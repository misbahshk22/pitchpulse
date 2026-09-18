import { Response } from 'express';
import type { Fixture, MatchEvent, AlertSubscription } from '../types.js';
import { getSubscriptionsForTeam } from '../db/database.js';
import { sendTelegramAlert } from '../bots/telegram.js';
import { sendDiscordAlert } from '../bots/discord.js';
import { sendWhatsAppAlert } from '../bots/whatsapp.js';

interface SseClient {
  id: string;
  res: Response;
}

class NotificationDispatcher {
  private sseClients: SseClient[] = [];

  public registerSseClient(id: string, res: Response): void {
    this.sseClients.push({ id, res });
    console.log(`[SSE] Client connected: ${id} (Total: ${this.sseClients.length})`);
  }

  public removeSseClient(id: string): void {
    this.sseClients = this.sseClients.filter(c => c.id !== id);
    console.log(`[SSE] Client disconnected: ${id} (Total: ${this.sseClients.length})`);
  }

  public broadcastLiveUpdate(liveFixtures: Fixture[]): void {
    const payload = JSON.stringify({ type: 'LIVE_UPDATE', data: liveFixtures, timestamp: new Date().toISOString() });
    for (const client of this.sseClients) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        console.error(`[SSE] Error writing to client ${client.id}:`, err);
      }
    }
  }

  public async notifyGoal(fixture: Fixture, event: MatchEvent): Promise<void> {
    const message = `⚽ <b>GOAL!</b> ${event.player.name} (${event.time.elapsed}')\n` +
      `<b>${fixture.homeTeam.name}</b> ${fixture.score.home} - ${fixture.score.away} <b>${fixture.awayTeam.name}</b>\n` +
      `🏆 ${fixture.leagueName}`;

    console.log(`[Notification Dispatcher] Broadcasting Goal Alert: ${fixture.homeTeam.name} ${fixture.score.home}-${fixture.score.away} ${fixture.awayTeam.name}`);

    // 1. Web Clients via SSE
    const payload = JSON.stringify({
      type: 'GOAL_ALERT',
      fixtureId: fixture.id,
      message: `${event.player.name} scored for ${event.team.name}! (${fixture.score.home} - ${fixture.score.away})`,
      event,
      score: fixture.score
    });
    for (const client of this.sseClients) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        // connection closed
      }
    }

    // 2. Deliver to subscribed Telegram, Discord, and WhatsApp channels
    const subs = [
      ...getSubscriptionsForTeam(fixture.homeTeam.id),
      ...getSubscriptionsForTeam(fixture.awayTeam.id)
    ];

    for (const sub of subs) {
      if (sub.events.includes('goal')) {
        await this.deliverToChannel(sub, message, fixture);
      }
    }
  }

  public async notifyMatchKickoff(fixture: Fixture): Promise<void> {
    const message = `⏱️ <b>KICKOFF!</b> ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} is underway!\n🏆 ${fixture.leagueName}`;
    console.log(`[Notification Dispatcher] Kickoff: ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);

    const payload = JSON.stringify({ type: 'KICKOFF_ALERT', fixtureId: fixture.id, message });
    for (const client of this.sseClients) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {}
    }

    const subs = [
      ...getSubscriptionsForTeam(fixture.homeTeam.id),
      ...getSubscriptionsForTeam(fixture.awayTeam.id)
    ];

    for (const sub of subs) {
      if (sub.events.includes('kickoff')) {
        await this.deliverToChannel(sub, message, fixture);
      }
    }
  }

  public async deliverToChannel(sub: AlertSubscription, htmlText: string, fixture?: Fixture): Promise<void> {
    const plainText = htmlText.replace(/<[^>]*>?/gm, '');

    switch (sub.channel) {
      case 'telegram':
        await sendTelegramAlert(sub.targetId, htmlText);
        break;

      case 'discord':
        await sendDiscordAlert(sub.targetId, {
          title: fixture ? `⚽ ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}` : '⚽ Matchday Alert',
          description: plainText,
          color: 0xef4444
        });
        break;

      case 'whatsapp':
        // WhatsApp markdown uses *bold* instead of <b>
        const waText = htmlText.replace(/<b>(.*?)<\/b>/g, '*$1*').replace(/<[^>]*>?/gm, '');
        await sendWhatsAppAlert(sub.targetId, waText);
        break;

      case 'web':
        // handled via SSE broadcast
        break;
    }
  }
}

export const notificationDispatcher = new NotificationDispatcher();

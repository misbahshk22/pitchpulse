import { Request, Response } from 'express';
import { CONFIG } from '../config.js';
import { footballApi } from '../services/footballApi.js';
import { handleNaturalLanguageQuery } from '../services/nlpQuery.js';
import { saveSubscription, searchFixturesByTeam } from '../db/database.js';

export function handleWhatsAppVerification(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === CONFIG.whatsappVerifyToken) {
    console.log('[WhatsApp Webhook] Verification successful!');
    res.status(200).send(challenge);
  } else {
    console.warn('[WhatsApp Webhook] Verification failed: Token mismatch.');
    res.sendStatus(403);
  }
}

export async function handleWhatsAppIncoming(req: Request, res: Response): Promise<void> {
  // Acknowledge Meta immediately to avoid retries
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message || message.type !== 'text') return;

  const fromNumber = message.from; // Sender WhatsApp phone number
  const userText = message.text?.body?.trim() || '';

  console.log(`[WhatsApp Inbound] Message from ${fromNumber}: "${userText}"`);

  let replyText = '';

  const clean = userText.toLowerCase();

  // 1. "live"
  if (clean === 'live' || clean === '/live') {
    const live = await footballApi.getLiveMatches();
    if (live.length === 0) {
      replyText = '⏸️ No live matches currently in progress across the tracked European leagues.';
    } else {
      replyText = `🔴 LIVE MATCHES (${live.length})\n\n`;
      for (const m of live) {
        replyText += `🏆 ${m.leagueName}\n⏱️ ${m.elapsed ? m.elapsed + "'" : ''} [${m.status}]\n`;
        replyText += `*${m.homeTeam.name}* ${m.score.home ?? 0} - ${m.score.away ?? 0} *${m.awayTeam.name}*\n\n`;
      }
    }
  }
  // 2. "follow <team>"
  else if (clean.startsWith('follow ') || clean.startsWith('/follow ')) {
    const teamName = clean.replace(/^\/?follow\s+/, '').trim();
    const matches = searchFixturesByTeam(teamName, 1);
    const matchedTeam = matches[0]?.homeTeam.name.toLowerCase().includes(teamName.toLowerCase())
      ? matches[0].homeTeam
      : (matches[0]?.awayTeam || { id: 0, name: teamName });

    saveSubscription({
      id: `whatsapp:${fromNumber}:${matchedTeam.id || teamName}`,
      channel: 'whatsapp',
      targetId: fromNumber,
      teamId: matchedTeam.id || undefined,
      events: ['goal', 'kickoff', 'fulltime'],
      createdAt: new Date().toISOString()
    });

    replyText = `🔔 *Alerts Activated!*\nYou will now receive instant goal and kickoff updates for *${matchedTeam.name}* on WhatsApp!`;
  }
  // 3. Fallback to NLP Assistant
  else {
    const result = await handleNaturalLanguageQuery(userText);
    replyText = `⚽ *GoalHub Bot*\n${result.message}\n\n`;
    if (result.matches && result.matches.length > 0) {
      for (const m of result.matches.slice(0, 3)) {
        const score = m.score.home !== null ? `${m.score.home} - ${m.score.away}` : 'vs';
        replyText += `• *${m.homeTeam.name}* ${score} *${m.awayTeam.name}* (${m.leagueName})\n`;
      }
    }
  }

  await sendWhatsAppAlert(fromNumber, replyText);
}

export async function sendWhatsAppAlert(toPhoneNumber: string, text: string): Promise<boolean> {
  if (!CONFIG.whatsappAccessToken || !CONFIG.whatsappPhoneNumberId) {
    console.log(`[WhatsApp Standby] Simulated alert to ${toPhoneNumber}:\n${text}`);
    return true;
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${CONFIG.whatsappPhoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.whatsappAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhoneNumber,
        type: 'text',
        text: { body: text }
      })
    });

    if (!response.ok) {
      const errJson = await response.json();
      console.error('[WhatsApp Cloud API] Send error:', errJson);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[WhatsApp API] Request failed for ${toPhoneNumber}:`, err);
    return false;
  }
}

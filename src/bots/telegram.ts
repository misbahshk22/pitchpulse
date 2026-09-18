import { Bot, InlineKeyboard } from 'grammy';
import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import { footballApi } from '../services/footballApi.js';
import { handleNaturalLanguageQuery } from '../services/nlpQuery.js';
import { saveSubscription, searchFixturesByTeam } from '../db/database.js';
import type { Fixture } from '../types.js';

let botInstance: Bot | null = null;

export function initTelegramBot(): void {
  if (!CONFIG.telegramBotToken) {
    console.log('[Telegram Bot] No TELEGRAM_BOT_TOKEN provided. Telegram Bot is in standby mode.');
    return;
  }

  try {
    botInstance = new Bot(CONFIG.telegramBotToken);

    // /start and /help command
    botInstance.command(['start', 'help'], async (ctx) => {
      const welcome = `⚽ <b>Welcome to GoalHub Bot!</b>\n\n` +
        `Your real-time companion for the <b>Top 5 European Leagues & UEFA Competitions</b>.\n\n` +
        `<b>Available Commands:</b>\n` +
        `• /live — See active matches & live scores\n` +
        `• /fixtures — Browse upcoming schedules by competition\n` +
        `• /standings — View league tables\n` +
        `• /follow <i>&lt;team&gt;</i> — Subscribe to instant goal alerts\n` +
        `• /unfollow <i>&lt;team&gt;</i> — Stop alerts for a team\n\n` +
        `💬 <i>Tip: You can also ask me anything directly, like <b>"next arsenal match"</b> or <b>"who is playing live"</b>!</i>`;

      await ctx.reply(welcome, { parse_mode: 'HTML' });
    });

    // /live command
    botInstance.command('live', async (ctx) => {
      await ctx.replyWithChatAction('typing');
      const live = await footballApi.getLiveMatches();

      if (live.length === 0) {
        return ctx.reply('⏸️ No live matches currently in progress across the tracked European leagues.');
      }

      let msg = `🔴 <b>LIVE MATCHES (${live.length})</b>\n\n`;
      for (const m of live) {
        msg += `🏆 <b>${m.leagueName}</b>\n`;
        msg += `⏱️ ${m.elapsed ? m.elapsed + "'" : ''} [${m.status}]\n`;
        msg += `<b>${m.homeTeam.name}</b> ${m.score.home ?? 0} - ${m.score.away ?? 0} <b>${m.awayTeam.name}</b>\n`;
        if (m.events && m.events.length > 0) {
          const goals = m.events.filter(e => e.type === 'Goal');
          if (goals.length > 0) {
            msg += `⚽ ${goals.map(g => `${g.player.name} ${g.time.elapsed}'`).join(', ')}\n`;
          }
        }
        msg += `\n`;
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    });

    // /fixtures command with interactive inline keyboard
    botInstance.command('fixtures', async (ctx) => {
      const keyboard = new InlineKeyboard()
        .text('🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', 'fix:39').text('🇪🇸 La Liga', 'fix:140').row()
        .text('🇮🇹 Serie A', 'fix:135').text('🇩🇪 Bundesliga', 'fix:78').row()
        .text('🇫🇷 Ligue 1', 'fix:61').text('⭐ Champions League', 'fix:2').row()
        .text('🟠 Europa League', 'fix:3').text('🟢 Conference League', 'fix:848');

      await ctx.reply('📅 Select a competition to view upcoming fixtures:', {
        reply_markup: keyboard
      });
    });

    // /standings command with inline keyboard
    botInstance.command('standings', async (ctx) => {
      const keyboard = new InlineKeyboard()
        .text('🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', 'std:39').text('🇪🇸 La Liga', 'std:140').row()
        .text('🇮🇹 Serie A', 'std:135').text('🇩🇪 Bundesliga', 'std:78').row()
        .text('🇫🇷 Ligue 1', 'std:61');

      await ctx.reply('🏆 Select a league table to view standings:', {
        reply_markup: keyboard
      });
    });

    // Callback queries for inline keyboard buttons
    botInstance.callbackQuery(/^fix:(\d+)$/, async (ctx) => {
      const leagueId = parseInt(ctx.match[1], 10);
      const league = TRACKED_LEAGUES[leagueId];
      if (!league) return ctx.answerCallbackQuery('League not found.');

      await ctx.answerCallbackQuery();
      const fixtures = await footballApi.getFixtures(leagueId);
      const upcoming = fixtures.slice(0, 6);

      let msg = `📅 <b>${league.name} Fixtures</b>\n\n`;
      if (upcoming.length === 0) {
        msg += `No upcoming matches scheduled at this time.`;
      } else {
        for (const f of upcoming) {
          const date = new Date(f.kickoff).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          const score = (f.score.home !== null && f.score.away !== null)
            ? `(${f.score.home} - ${f.score.away})`
            : 'vs';
          msg += `• <b>${f.homeTeam.name}</b> ${score} <b>${f.awayTeam.name}</b>\n  <i>${date}</i>\n`;
        }
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    });

    botInstance.callbackQuery(/^std:(\d+)$/, async (ctx) => {
      const leagueId = parseInt(ctx.match[1], 10);
      const league = TRACKED_LEAGUES[leagueId];
      if (!league) return ctx.answerCallbackQuery('League not found.');

      await ctx.answerCallbackQuery();
      const standings = await footballApi.getStandings(leagueId);

      let msg = `🏆 <b>${league.name} Standings</b>\n\n`;
      msg += `<code>#  Club            P   GD  Pts</code>\n`;
      for (const s of standings.slice(0, 8)) {
        const rank = String(s.rank).padEnd(2, ' ');
        const name = s.team.name.substring(0, 14).padEnd(15, ' ');
        const p = String(s.played).padStart(2, ' ');
        const gd = String(s.goalsDiff).padStart(3, ' ');
        const pts = String(s.points).padStart(3, ' ');
        msg += `<code>${rank} ${name} ${p} ${gd}  ${pts}</code>\n`;
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    });

    // /follow <team> command
    botInstance.command('follow', async (ctx) => {
      const teamName = ctx.match?.trim();
      if (!teamName) {
        return ctx.reply('⚠️ Please specify a team name. Example: <code>/follow Arsenal</code>', { parse_mode: 'HTML' });
      }

      const matches = searchFixturesByTeam(teamName, 1);
      const matchedTeam = matches[0]?.homeTeam.name.toLowerCase().includes(teamName.toLowerCase())
        ? matches[0].homeTeam
        : (matches[0]?.awayTeam || { id: 0, name: teamName });

      const chatId = String(ctx.chat.id);
      saveSubscription({
        id: `telegram:${chatId}:${matchedTeam.id || teamName.toLowerCase()}`,
        channel: 'telegram',
        targetId: chatId,
        teamId: matchedTeam.id || undefined,
        events: ['goal', 'kickoff', 'fulltime'],
        createdAt: new Date().toISOString()
      });

      await ctx.reply(`🔔 <b>Alerts Activated!</b>\nYou will now receive live goal and kickoff alerts for <b>${matchedTeam.name}</b> in this chat!`, {
        parse_mode: 'HTML'
      });
    });

    // Natural Language / Free text fallback
    botInstance.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return; // ignore other commands

      await ctx.replyWithChatAction('typing');
      const result = await handleNaturalLanguageQuery(ctx.message.text);

      let reply = `🤖 ${result.message}\n\n`;
      if (result.matches && result.matches.length > 0) {
        for (const m of result.matches.slice(0, 3)) {
          const score = (m.score.home !== null) ? `${m.score.home} - ${m.score.away}` : 'vs';
          reply += `• <b>${m.homeTeam.name}</b> ${score} <b>${m.awayTeam.name}</b> (${m.leagueName})\n`;
        }
      } else if (result.standings && result.standings.length > 0) {
        for (const s of result.standings.slice(0, 5)) {
          reply += `${s.rank}. <b>${s.team.name}</b> — ${s.points} pts\n`;
        }
      }

      await ctx.reply(reply, { parse_mode: 'HTML' });
    });

    botInstance.catch((err) => {
      console.error('[Telegram Bot] Unhandled bot error:', err);
    });

    if (!process.env.VERCEL) {
      botInstance.start();
      console.log('[Telegram Bot] grammY bot listener started successfully!');
    }
  } catch (err) {
    console.error('[Telegram Bot] Failed to initialize bot:', err);
  }
}

export function getTelegramBot(): Bot | null {
  if (!botInstance && CONFIG.telegramBotToken) {
    initTelegramBot();
  }
  return botInstance;
}

export async function sendTelegramAlert(chatId: string, message: string): Promise<boolean> {
  if (!botInstance) {
    console.log(`[Telegram Bot Standby] Simulated alert to chat ${chatId}:\n${message}`);
    return true;
  }

  try {
    await botInstance.api.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return true;
  } catch (err) {
    console.error(`[Telegram Bot] Error sending alert to ${chatId}:`, err);
    return false;
  }
}

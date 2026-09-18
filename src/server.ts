import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, TRACKED_LEAGUES } from './config.js';
import { getDatabase, saveSubscription, getAllSubscriptions, deleteSubscription, getNextUpcomingFixture } from './db/database.js';
import { footballApi } from './services/footballApi.js';
import { adaptivePoller } from './services/poller.js';
import { notificationDispatcher } from './services/notificationDispatcher.js';
import { handleNaturalLanguageQuery } from './services/nlpQuery.js';
import { initTelegramBot, getTelegramBot } from './bots/telegram.js';
import { webhookCallback } from 'grammy';
import { initDiscordBot } from './bots/discord.js';
import { handleWhatsAppVerification, handleWhatsAppIncoming } from './bots/whatsapp.js';

import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static assets from both projectRoot and cwd
app.use('/static', express.static(path.join(projectRoot, 'static')));
app.use('/static', express.static(path.join(projectRoot, 'public', 'static')));
app.use('/static', express.static(path.join(process.cwd(), 'static')));
app.use('/static', express.static(path.join(process.cwd(), 'public', 'static')));
app.use(express.static(path.join(projectRoot, 'public')));
app.use(express.static(path.join(process.cwd(), 'public')));

// Serve index.html on root
app.get('/', (req, res) => {
  const candidates = [
    path.join(process.cwd(), 'public', 'index.html'),
    path.join(projectRoot, 'public', 'index.html'),
    path.join(projectRoot, 'index.html'),
    path.join(process.cwd(), 'index.html')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.sendFile(path.join(projectRoot, 'index.html'));
});

// 1. Get tracked leagues
app.get('/api/leagues', (req, res) => {
  res.json({
    status: 'success',
    leagues: Object.values(TRACKED_LEAGUES)
  });
});

// 2. Get fixtures (optionally filtered by league)
app.get('/api/fixtures', async (req, res) => {
  try {
    const leagueId = req.query.league ? parseInt(req.query.league as string, 10) : undefined;
    if (leagueId) {
      const fixtures = await footballApi.getFixtures(leagueId);
      return res.json({ status: 'success', leagueId, fixtures });
    }
    const all = await Promise.all(
      Object.keys(TRACKED_LEAGUES).map(id => footballApi.getFixtures(Number(id)))
    );
    res.json({ status: 'success', fixtures: all.flat() });
  } catch (err) {
    console.error('Error fetching fixtures:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch fixtures' });
  }
});

// 3. Get live matches in play & today's schedule
app.get('/api/fixtures/live', async (req, res) => {
  try {
    const live = await footballApi.getLiveMatches();
    const today = await footballApi.getTodayMatches();
    res.json({ status: 'success', count: live.length, live, today });
  } catch (err) {
    console.error('Error fetching live fixtures:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch live matches' });
  }
});

// 3b. Get matches scheduled or played today across all tracked leagues
app.get('/api/fixtures/today', async (req, res) => {
  try {
    const today = await footballApi.getTodayMatches();
    res.json({ status: 'success', count: today.length, fixtures: today });
  } catch (err) {
    console.error('Error fetching today fixtures:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch today matches' });
  }
});

// 4. Get marquee next upcoming match
app.get('/api/fixtures/next', (req, res) => {
  try {
    const team = req.query.team as string | undefined;
    const next = getNextUpcomingFixture(team);
    res.json({ status: 'success', next });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch next fixture' });
  }
});

// 5. Get league standings
app.get('/api/standings', async (req, res) => {
  try {
    const leagueId = req.query.league ? parseInt(req.query.league as string, 10) : 39;
    const standings = await footballApi.getStandings(leagueId);
    res.json({ status: 'success', leagueId, standings });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch standings' });
  }
});

// 5b. Get all teams / clubs (optionally by league)
app.get('/api/teams', async (req, res) => {
  try {
    const leagueId = req.query.league ? parseInt(req.query.league as string, 10) : undefined;
    const teams = await footballApi.getTeams(leagueId);
    res.json({ status: 'success', count: teams.length, teams });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch teams' });
  }
});

// 5c. Get full official squad for any club
app.get('/api/squad', async (req, res) => {
  try {
    const teamQuery = req.query.team as string;
    if (!teamQuery) {
      return res.status(400).json({ status: 'error', message: 'Team query parameter required' });
    }
    const squad = await footballApi.getTeamSquad(teamQuery);
    if (!squad) {
      return res.status(404).json({ status: 'error', message: `Squad not found for "${teamQuery}"` });
    }
    res.json({ status: 'success', squad });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch squad' });
  }
});

// 6. Natural language search & query
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Query string required' });
    }
    const result = await handleNaturalLanguageQuery(query);
    res.json({ status: 'success', result });
  } catch (err) {
    console.error('Error in NLP query:', err);
    res.status(500).json({ status: 'error', message: 'Failed to parse query' });
  }
});

// 7. Subscribe to notifications
app.post('/api/notifications/subscribe', (req, res) => {
  try {
    const { channel, targetId, teamId, leagueId, events } = req.body;
    if (!channel || !targetId) {
      return res.status(400).json({ status: 'error', message: 'channel and targetId are required' });
    }

    const subId = `${channel}:${targetId}:${teamId || 'all'}`;
    saveSubscription({
      id: subId,
      channel,
      targetId,
      teamId,
      leagueId,
      events: events || ['goal', 'kickoff', 'fulltime'],
      createdAt: new Date().toISOString()
    });

    res.json({ status: 'success', message: 'Subscription active', id: subId });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to save subscription' });
  }
});

// 7b. List all active notification subscriptions
app.get('/api/notifications/subscriptions', (req, res) => {
  try {
    const subs = getAllSubscriptions();
    res.json({ status: 'success', count: subs.length, subscriptions: subs });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to retrieve subscriptions' });
  }
});

// 7c. Remove a subscription
app.delete('/api/notifications/unsubscribe/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = deleteSubscription(id);
    res.json({ status: 'success', deleted, id });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to delete subscription' });
  }
});

// 8. Server-Sent Events (SSE) for Real-Time Score Updates
app.get('/api/live/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  notificationDispatcher.registerSseClient(clientId, res);

  const live = await footballApi.getLiveMatches();
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, live })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    notificationDispatcher.removeSseClient(clientId);
  });
});

// 9. WhatsApp Cloud API Webhook Endpoints
app.get('/api/webhook/whatsapp', handleWhatsAppVerification);
app.post('/api/webhook/whatsapp', handleWhatsAppIncoming);

// 9b. Telegram Webhook Endpoint (Serverless on Vercel)
app.use('/api/webhook/telegram', (req, res) => {
  const bot = getTelegramBot();
  if (!bot) {
    return res.status(200).send('Telegram bot not configured. Set TELEGRAM_BOT_TOKEN.');
  }
  return webhookCallback(bot, 'express')(req, res);
});

// 10. Test Alert Trigger (Multi-Channel Dispatch Test)
app.post('/api/test/trigger-alert', async (req, res) => {
  try {
    const live = await footballApi.getLiveMatches();
    const targetMatch = live[0] || {
      id: 9999,
      leagueId: 39,
      leagueName: 'Premier League',
      leagueLogo: 'https://media.api-sports.io/football/leagues/39.png',
      kickoff: new Date().toISOString(),
      status: '2H',
      statusText: 'Second Half',
      elapsed: 88,
      homeTeam: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
      awayTeam: { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' },
      score: { home: 3, away: 1 }
    };

    const event = {
      time: { elapsed: targetMatch.elapsed || 88 },
      team: targetMatch.homeTeam,
      player: { name: req.body.scorer || 'Bukayo Saka' },
      type: 'Goal' as const,
      detail: 'Stunning strike into the top corner!'
    };

    await notificationDispatcher.notifyGoal(targetMatch as any, event);

    res.json({
      status: 'success',
      message: 'Goal alert broadcasted to Web (SSE), Telegram, Discord, and WhatsApp!',
      match: targetMatch,
      event
    });
  } catch (err) {
    console.error('Error triggering test alert:', err);
    res.status(500).json({ status: 'error', message: 'Failed to trigger test alert' });
  }
});

// Start server
async function bootstrap() {
  getDatabase();
  await footballApi.seedInitialData();

  adaptivePoller.start();
  initTelegramBot();
  initDiscordBot();

  app.listen(CONFIG.port, () => {
    console.log(`====================================================`);
    console.log(`⚽ GoalHub European Football Platform is running!`);
    console.log(`🌐 Web Dashboard: http://localhost:${CONFIG.port}`);
    console.log(`📱 Telegram Bot: ${CONFIG.telegramBotToken ? 'Connected' : 'Standby (Provide TELEGRAM_BOT_TOKEN)'}`);
    console.log(`🎮 Discord Bot:  ${CONFIG.discordBotToken ? 'Connected' : 'Standby (Provide DISCORD_BOT_TOKEN)'}`);
    console.log(`💬 WhatsApp Bot: Webhook listening at /api/webhook/whatsapp`);
    console.log(`📡 Feed Mode: ${CONFIG.useEspnFreeLiveFeed ? 'Public ESPN Real-Time Feed (100% Free Live)' : 'API-Football Connected'}`);
    console.log(`🏆 Tracked Leagues: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, UCL, UEL, UECL`);
    console.log(`====================================================`);
  });
}

if (!process.env.VERCEL) {
  bootstrap().catch(err => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}

export default app;
export { app };

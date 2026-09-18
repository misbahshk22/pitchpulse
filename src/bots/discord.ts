import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  TextChannel
} from 'discord.js';
import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import { footballApi } from '../services/footballApi.js';
import { handleNaturalLanguageQuery } from '../services/nlpQuery.js';
import { saveSubscription, deleteSubscription, searchFixturesByTeam } from '../db/database.js';
import type { Fixture, StandingTeam, TeamSquad, SquadPlayer } from '../types.js';

let discordClient: Client | null = null;

export interface DiscordCommandResult {
  embeds?: any[];
  content?: string;
}

function resolveLeagueId(arg: string): number {
  const clean = (arg || '').toLowerCase().trim();
  if (clean.includes('ucl') || clean.includes('champions')) return 2;
  if (clean.includes('uel') || clean.includes('europa')) return 3;
  if (clean.includes('conf') || clean.includes('ecl') || clean.includes('conference')) return 848;
  if (clean.includes('laliga') || clean.includes('la liga') || clean.includes('spain')) return 140;
  if (clean.includes('seriea') || clean.includes('serie a') || clean.includes('italy')) return 135;
  if (clean.includes('bundes') || clean.includes('germany')) return 78;
  if (clean.includes('ligue') || clean.includes('france')) return 61;
  return 39; // Premier League default
}

export async function processDiscordCommand(content: string, channelId: string = 'demo'): Promise<DiscordCommandResult> {
  const trimmed = (content || '').trim();
  const lower = trimmed.toLowerCase();

  // 1. HELP / GOALHUB
  if (lower === '!help' || lower === '!goalhub' || lower === '!pitchpulse' || lower === '!matchday') {
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('⚽ GoalHub Real-Time Discord Bot')
      .setDescription('Your complete football companion for the **Top 5 European Leagues & UEFA Competitions**.\nUse the commands below to access real-time stats, official squads, and live alerts:')
      .addFields(
        {
          name: '🔴 Live Scores & Matches',
          value: '`!live` — In-play matches with live clocks, scoreboards & scorers.\n`!today` — Today’s European matchday kickoffs & full-time results.'
        },
        {
          name: '👥 Official Squads & Rosters',
          value: '`!squad <team>` — Full roster with jersey numbers & positions (e.g. `!squad Barcelona`, `!squad Arsenal`).'
        },
        {
          name: '📅 Schedules & Fixtures',
          value: '`!next <team>` — Next upcoming match countdown, venue & date (e.g. `!next Real Madrid`).\n`!schedule <team>` — Next 5 matches for any European club.\n`!fixtures [league]` — Upcoming matches for a league (e.g. `!fixtures pl`, `!fixtures ucl`).'
        },
        {
          name: '🏆 League Standings',
          value: '`!standings [league]` — League table with P, W, D, L, GD, Pts (e.g. `!standings laliga`, `!standings pl`).'
        },
        {
          name: '⚔️ Head-to-Head & Match Details',
          value: '`!h2h <team1> vs <team2>` — Compare any two European clubs.'
        },
        {
          name: '🔔 Live Goal Alerts',
          value: '`!follow <team>` — Subscribe this channel to instant goal & kickoff alerts.\n`!unfollow <team>` — Remove alert subscription.'
        },
        {
          name: '🤖 AI Football Assistant',
          value: '`!ask <anything>` — Natural language query (e.g. `!ask who is playing live`, `!ask when is el clasico`).'
        }
      )
      .setFooter({ text: 'GoalHub Multi-Platform Sports Platform · Powered by ESPN Live Data' })
      .setTimestamp();

    return { embeds: [embed] };
  }

  // 2. SQUAD: !squad <team> or !roster <team>
  if (lower.startsWith('!squad') || lower.startsWith('!roster') || lower.startsWith('!team')) {
    const query = trimmed.replace(/^!(squad|roster|team)/i, '').trim();
    if (!query) {
      return { content: '⚠️ Please specify a team name. Example: `!squad FC Barcelona` or `!squad Arsenal`' };
    }

    const squad = await footballApi.getTeamSquad(query);
    if (!squad || !squad.players || squad.players.length === 0) {
      return { content: `⚠️ Could not find official squad roster for "**${query}**". Try: *Barcelona, Real Madrid, Arsenal, Bayern Munich, PSG, Manchester City*` };
    }

    // Group players by position
    const gks: SquadPlayer[] = [];
    const defs: SquadPlayer[] = [];
    const mids: SquadPlayer[] = [];
    const fwds: SquadPlayer[] = [];
    const others: SquadPlayer[] = [];

    for (const p of squad.players) {
      const pos = (p.position || '').toLowerCase();
      if (pos.includes('goal') || pos.includes('gk')) gks.push(p);
      else if (pos.includes('def') || pos.includes('back')) defs.push(p);
      else if (pos.includes('mid')) mids.push(p);
      else if (pos.includes('for') || pos.includes('att') || pos.includes('wing') || pos.includes('striker')) fwds.push(p);
      else others.push(p);
    }

    const fmt = (arr: SquadPlayer[]) =>
      arr.map(p => `\`#${p.jersey !== '-' ? p.jersey : '•'}\` **${p.name}**`).join(', ') || 'None listed';

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(`👥 ${squad.teamName} — Official Squad (${squad.players.length} Players)`)
      .setThumbnail(squad.teamLogo || null)
      .addFields(
        { name: `🧤 Goalkeepers (${gks.length})`, value: fmt(gks) },
        { name: `🛡️ Defenders (${defs.length})`, value: fmt(defs) },
        { name: `🎯 Midfielders (${mids.length})`, value: fmt(mids) },
        { name: `⚡ Forwards (${fwds.length})`, value: fmt(fwds) }
      );

    if (others.length > 0) {
      embed.addFields({ name: `📋 Other Squad Members (${others.length})`, value: fmt(others) });
    }

    embed.setFooter({ text: 'Official 2024/25 Squad Roster · GoalHub' });
    return { embeds: [embed] };
  }

  // 3. NEXT MATCH: !next <team>
  if (lower.startsWith('!next')) {
    const query = trimmed.replace(/^!next/i, '').trim();
    if (!query) {
      return { content: '⚠️ Please specify a team. Example: `!next Arsenal` or `!next Real Madrid`' };
    }

    const schedule = await footballApi.getTeamSchedule(query);
    if (!schedule || schedule.length === 0) {
      return { content: `⚠️ No upcoming match found for "**${query}**".` };
    }

    // Find next upcoming match or latest
    const upcoming = schedule.find(f => f.status === 'NS' || ['1H', '2H', 'HT'].includes(f.status)) || schedule[0];

    const isLive = ['1H', '2H', 'HT'].includes(upcoming.status);
    const dateStr = new Date(upcoming.kickoff).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });

    const embed = new EmbedBuilder()
      .setColor(isLive ? 0xef4444 : 0x3b82f6)
      .setTitle(`⚡ Next Match: ${upcoming.homeTeam.name} vs ${upcoming.awayTeam.name}`)
      .setThumbnail(upcoming.homeTeam.logo || upcoming.awayTeam.logo || null)
      .addFields(
        { name: '🏆 Competition', value: `${upcoming.leagueName} · ${upcoming.round || 'Regular Season'}`, inline: true },
        { name: '⏱️ Status', value: isLive ? `🔴 LIVE (${upcoming.elapsed}')` : '📅 Scheduled', inline: true },
        { name: '📅 Date & Kickoff', value: dateStr, inline: false },
        { name: '🏟️ Stadium / Venue', value: upcoming.venue || 'Europe', inline: false }
      )
      .setFooter({ text: 'GoalHub Match Tracking' })
      .setTimestamp();

    return { embeds: [embed] };
  }

  // 4. SCHEDULE: !schedule <team>
  if (lower.startsWith('!schedule')) {
    const query = trimmed.replace(/^!schedule/i, '').trim();
    if (!query) {
      return { content: '⚠️ Please specify a team. Example: `!schedule Barcelona`' };
    }

    const schedule = await footballApi.getTeamSchedule(query);
    if (!schedule || schedule.length === 0) {
      return { content: `⚠️ No match schedule found for "**${query}**".` };
    }

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(`📅 Match Calendar for ${query.toUpperCase()}`)
      .setDescription(`Showing upcoming matches across European & domestic tournaments:`);

    for (const f of schedule.slice(0, 6)) {
      const date = new Date(f.kickoff).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const score = (f.score.home !== null && f.score.away !== null) ? `${f.score.home} - ${f.score.away}` : 'vs';
      embed.addFields({
        name: `${f.homeTeam.name} ${score} ${f.awayTeam.name}`,
        value: `🏆 ${f.leagueName} · 📅 ${date} · 📍 ${f.venue || 'Stadium'}`
      });
    }

    return { embeds: [embed] };
  }

  // 5. LIVE MATCHES: !live
  if (lower === '!live') {
    const live = await footballApi.getLiveMatches();
    if (live.length === 0) {
      const today = await footballApi.getTodayMatches();
      const embed = new EmbedBuilder()
        .setColor(0x64748b)
        .setTitle('⏸️ No Matches In-Play Right Now')
        .setDescription('All European stadiums are between match windows.\nBelow are today’s fixtures:');

      for (const m of today.slice(0, 5)) {
        const score = m.score.home !== null ? `${m.score.home} - ${m.score.away}` : 'vs';
        embed.addFields({
          name: `${m.homeTeam.name} ${score} ${m.awayTeam.name}`,
          value: `🏆 ${m.leagueName} · [${m.status}] ${m.statusText || ''}`
        });
      }
      return { embeds: [embed] };
    }

    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle(`🔴 LIVE EUROPEAN MATCHES (${live.length})`)
      .setTimestamp();

    for (const m of live) {
      const scoreText = `⚽ **${m.homeTeam.name}** ${m.score.home ?? 0} - ${m.score.away ?? 0} **${m.awayTeam.name}**`;
      let details = `🏆 **${m.leagueName}** · ⏱️ **${m.elapsed ? m.elapsed + "'" : ''}** [${m.status}]`;
      if (m.events && m.events.length > 0) {
        const goals = m.events.filter(e => e.type === 'Goal');
        if (goals.length > 0) {
          details += `\n⚽ Goals: ${goals.map(g => `${g.player.name} (${g.time.elapsed}')`).join(', ')}`;
        }
      }
      details += `\n📍 ${m.venue || 'Stadium'}`;
      embed.addFields({ name: scoreText, value: details });
    }

    return { embeds: [embed] };
  }

  // 6. TODAY'S MATCHES: !today
  if (lower === '!today') {
    const today = await footballApi.getTodayMatches();
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(`📅 Today’s European Matchday (${today.length} Fixtures)`)
      .setDescription('Scheduled kickoffs & full-time results across tracked competitions:');

    for (const m of today.slice(0, 8)) {
      const score = (m.score.home !== null && m.score.away !== null) ? `${m.score.home} - ${m.score.away}` : 'vs';
      embed.addFields({
        name: `${m.homeTeam.name} ${score} ${m.awayTeam.name}`,
        value: `🏆 ${m.leagueName} · Status: **${m.status}** ${m.statusText || ''}`
      });
    }

    return { embeds: [embed] };
  }

  // 7. STANDINGS: !standings [league]
  if (lower.startsWith('!standings') || lower.startsWith('!table')) {
    const arg = trimmed.replace(/^!(standings|table)/i, '').trim();
    const leagueId = resolveLeagueId(arg);
    const league = TRACKED_LEAGUES[leagueId];
    const standings = await footballApi.getStandings(leagueId);

    if (!standings || standings.length === 0) {
      return { content: `⚠️ Could not load standings for **${league?.name || 'League'}**.` };
    }

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle(`🏆 ${league?.name || 'League'} Standings 2024/25`)
      .setThumbnail(league?.logo || null);

    let tableText = '```\n#  Club              P   W  D  L  GD  Pts\n';
    tableText += '------------------------------------------\n';

    for (const s of standings.slice(0, 10)) {
      const rank = String(s.rank).padEnd(2, ' ');
      const name = (s.team.name.length > 16 ? s.team.name.slice(0, 15) + '…' : s.team.name).padEnd(17, ' ');
      const p = String(s.played).padStart(2, ' ');
      const w = String(s.win).padStart(2, ' ');
      const d = String(s.draw).padStart(2, ' ');
      const l = String(s.lose).padStart(2, ' ');
      const gd = String(s.goalsDiff > 0 ? '+' + s.goalsDiff : s.goalsDiff).padStart(3, ' ');
      const pts = String(s.points).padStart(3, ' ');
      tableText += `${rank} ${name} ${p} ${w} ${d} ${l} ${gd} ${pts}\n`;
    }
    tableText += '```';

    embed.setDescription(tableText);
    embed.setFooter({ text: 'Top 10 clubs shown · GoalHub European Standings' });
    return { embeds: [embed] };
  }

  // 8. FIXTURES: !fixtures [league]
  if (lower.startsWith('!fixtures')) {
    const arg = trimmed.replace('!fixtures', '').trim();
    const targetLeagueId = resolveLeagueId(arg);
    const league = TRACKED_LEAGUES[targetLeagueId];
    const fixtures = await footballApi.getFixtures(targetLeagueId);
    const upcoming = fixtures.slice(0, 6);

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(`📅 ${league?.name || 'Football'} Upcoming Fixtures`)
      .setThumbnail(league?.logo || null);

    for (const f of upcoming) {
      const date = new Date(f.kickoff).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const score = (f.score.home !== null) ? `${f.score.home} - ${f.score.away}` : 'vs';
      embed.addFields({
        name: `${f.homeTeam.name} ${score} ${f.awayTeam.name}`,
        value: `🕒 ${date} | 📍 ${f.venue || 'Stadium'}`
      });
    }

    return { embeds: [embed] };
  }

  // 9. HEAD-TO-HEAD: !h2h <team1> vs <team2>
  if (lower.startsWith('!h2h')) {
    const query = trimmed.replace('!h2h', '').trim();
    const parts = query.split(/\s+vs\s+|\s+v\s+|\s+against\s+/i);
    if (parts.length < 2) {
      return { content: '⚠️ Please specify two teams. Example: `!h2h Barcelona vs Real Madrid` or `!h2h Arsenal vs Chelsea`' };
    }

    const team1Name = parts[0].trim();
    const team2Name = parts[1].trim();

    const [t1, t2] = await Promise.all([
      footballApi.findTeam(team1Name),
      footballApi.findTeam(team2Name)
    ]);

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(`⚔️ Head-to-Head: ${t1?.name || team1Name} vs ${t2?.name || team2Name}`)
      .setThumbnail(t1?.logo || t2?.logo || null);

    embed.addFields(
      { name: `🛡️ ${t1?.name || team1Name}`, value: `🏆 League: ${t1 ? (TRACKED_LEAGUES[t1.leagueId]?.name || 'Europe') : 'European Football'}\nTracked Team in GoalHub`, inline: true },
      { name: `🛡️ ${t2?.name || team2Name}`, value: `🏆 League: ${t2 ? (TRACKED_LEAGUES[t2.leagueId]?.name || 'Europe') : 'European Football'}\nTracked Team in GoalHub`, inline: true }
    );

    const t1Schedule = await footballApi.getTeamSchedule(team1Name);
    const directClash = t1Schedule.find(f =>
      (f.homeTeam.name.toLowerCase().includes(team2Name.toLowerCase()) || f.awayTeam.name.toLowerCase().includes(team2Name.toLowerCase()))
    );

    if (directClash) {
      const date = new Date(directClash.kickoff).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      embed.addFields({
        name: '📅 Next Face-Off',
        value: `**${directClash.homeTeam.name} vs ${directClash.awayTeam.name}**\n🏆 ${directClash.leagueName} · 📅 ${date} · 📍 ${directClash.venue || 'Stadium'}`
      });
    } else {
      embed.addFields({
        name: '📅 Next Face-Off',
        value: 'No direct clash scheduled in the upcoming rounds.'
      });
    }

    return { embeds: [embed] };
  }

  // 10. FOLLOW: !follow <team>
  if (lower.startsWith('!follow')) {
    const teamName = trimmed.replace('!follow', '').trim();
    if (!teamName) {
      return { content: '⚠️ Please specify a team. Example: `!follow Arsenal` or `!follow Barcelona`' };
    }

    const matches = searchFixturesByTeam(teamName, 1);
    const matchedTeam = matches[0]?.homeTeam.name.toLowerCase().includes(teamName.toLowerCase())
      ? matches[0].homeTeam
      : (matches[0]?.awayTeam || { id: 0, name: teamName });

    saveSubscription({
      id: `discord:${channelId}:${matchedTeam.id || teamName.toLowerCase()}`,
      channel: 'discord',
      targetId: channelId,
      teamId: matchedTeam.id || undefined,
      events: ['goal', 'kickoff', 'fulltime'],
      createdAt: new Date().toISOString()
    });

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🔔 Channel Subscribed to Real-Time Alerts!')
      .setDescription(`This channel will now receive live goal and kickoff notifications for **${matchedTeam.name}**!`)
      .setFooter({ text: 'Use !unfollow <team> to stop alerts at any time.' });

    return { embeds: [embed] };
  }

  // 11. UNFOLLOW: !unfollow <team>
  if (lower.startsWith('!unfollow')) {
    const teamName = trimmed.replace('!unfollow', '').trim();
    if (!teamName) {
      return { content: '⚠️ Please specify a team. Example: `!unfollow Arsenal`' };
    }

    deleteSubscription(`discord:${channelId}:${teamName.toLowerCase()}`);

    const embed = new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle('🔕 Alert Unsubscribed')
      .setDescription(`Removed alerts for **${teamName}** from this channel.`);

    return { embeds: [embed] };
  }

  // 12. ASK ASSISTANT: !ask <query>
  if (lower.startsWith('!ask')) {
    const query = trimmed.replace('!ask', '').trim();
    if (!query) return { content: 'Please specify a query. Example: `!ask next arsenal match` or `!ask who is playing live`' };

    const result = await handleNaturalLanguageQuery(query);
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🤖 GoalHub Assistant')
      .setDescription(result.message);

    if (result.matches && result.matches.length > 0) {
      for (const m of result.matches.slice(0, 3)) {
        const score = m.score.home !== null ? `${m.score.home} - ${m.score.away}` : 'vs';
        embed.addFields({
          name: `${m.homeTeam.name} ${score} ${m.awayTeam.name}`,
          value: `🏆 ${m.leagueName} · ${new Date(m.kickoff).toLocaleDateString()}`
        });
      }
    }

    return { embeds: [embed] };
  }

  return { content: '❓ Unknown command. Type `!help` or `!goalhub` to see all available football commands!' };
}

export function initDiscordBot(): void {
  if (!CONFIG.discordBotToken) {
    console.log('[Discord Bot] No DISCORD_BOT_TOKEN provided. Discord Bot is in standby mode.');
    return;
  }

  try {
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    discordClient.on('ready', () => {
      console.log(`[Discord Bot] Logged in as ${discordClient?.user?.tag}!`);
    });

    discordClient.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      const content = message.content.trim();
      if (!content.startsWith('!')) return;

      try {
        const res = await processDiscordCommand(content, message.channel.id);
        if (res.embeds && res.embeds.length > 0) {
          await message.reply({ embeds: res.embeds });
        } else if (res.content) {
          await message.reply(res.content);
        }
      } catch (err) {
        console.error('[Discord Bot] Error handling message:', err);
      }
    });

    discordClient.login(CONFIG.discordBotToken);
  } catch (err) {
    console.error('[Discord Bot] Initialization error:', err);
  }
}

export async function sendDiscordAlert(channelId: string, alert: { title: string; description: string; color?: number }): Promise<boolean> {
  if (!discordClient || !discordClient.isReady()) {
    console.log(`[Discord Bot Standby] Simulated alert to channel ${channelId}:\n${alert.title} — ${alert.description}`);
    return true;
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(alert.color || 0xef4444)
        .setTitle(alert.title)
        .setDescription(alert.description)
        .setTimestamp();

      await (channel as TextChannel).send({ embeds: [embed] });
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[Discord Bot] Failed to send alert to channel ${channelId}:`, err);
    return false;
  }
}

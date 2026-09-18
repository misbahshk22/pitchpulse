import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  TextChannel
} from 'discord.js';
import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import { footballApi } from '../services/footballApi.js';
import { handleNaturalLanguageQuery } from '../services/nlpQuery.js';
import { saveSubscription, searchFixturesByTeam } from '../db/database.js';

let discordClient: Client | null = null;

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

      // Help command
      if (content === '!help' || content === '!goalhub' || content === '!pitchpulse' || content === '!matchday') {
        const embed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('⚽ GoalHub Discord Bot')
          .setDescription('Real-time fixture & live tracking for Top 5 Leagues & UEFA Competitions.')
          .addFields(
            { name: '!live', value: 'Check all currently active matches with live scores.', inline: true },
            { name: '!fixtures [league]', value: 'View upcoming matches (e.g. `!fixtures pl`, `!fixtures ucl`).', inline: true },
            { name: '!standings [league]', value: 'Display current league standings.', inline: true },
            { name: '!follow <team>', value: 'Subscribe this channel to real-time goal alerts.', inline: true },
            { name: '!ask <question>', value: 'Ask any fixture query (e.g. `!ask next arsenal match`).', inline: true }
          )
          .setFooter({ text: 'GoalHub Multi-Platform Sports Bot' });

        await message.reply({ embeds: [embed] });
        return;
      }

      // !live command
      if (content === '!live') {
        const live = await footballApi.getLiveMatches();
        if (live.length === 0) {
          return message.reply('⏸️ No live matches currently in progress across the tracked leagues.');
        }

        const embed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle(`🔴 LIVE MATCHES (${live.length})`)
          .setTimestamp();

        for (const m of live) {
          const scoreText = `**${m.homeTeam.name}** ${m.score.home ?? 0} - ${m.score.away ?? 0} **${m.awayTeam.name}**`;
          let details = `🏆 ${m.leagueName} · ⏱️ ${m.elapsed ? m.elapsed + "'" : ''} [${m.status}]`;
          if (m.events && m.events.length > 0) {
            const goals = m.events.filter(e => e.type === 'Goal');
            if (goals.length > 0) {
              details += `\n⚽ ${goals.map(g => `${g.player.name} (${g.time.elapsed}')`).join(', ')}`;
            }
          }
          embed.addFields({ name: scoreText, value: details });
        }

        return message.reply({ embeds: [embed] });
      }

      // !fixtures [league]
      if (content.startsWith('!fixtures')) {
        const arg = content.replace('!fixtures', '').trim().toLowerCase();
        let targetLeagueId = 39; // default PL
        if (arg.includes('ucl') || arg.includes('champions')) targetLeagueId = 2;
        else if (arg.includes('laliga') || arg.includes('spain')) targetLeagueId = 140;
        else if (arg.includes('seriea') || arg.includes('italy')) targetLeagueId = 135;
        else if (arg.includes('bundes') || arg.includes('germany')) targetLeagueId = 78;
        else if (arg.includes('ligue') || arg.includes('france')) targetLeagueId = 61;
        else if (arg.includes('uel') || arg.includes('europa')) targetLeagueId = 3;

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
            value: `🕒 ${date} | 📍 ${f.venue || 'TBD'}`
          });
        }

        return message.reply({ embeds: [embed] });
      }

      // !follow <team>
      if (content.startsWith('!follow')) {
        const teamName = content.replace('!follow', '').trim();
        if (!teamName) {
          return message.reply('⚠️ Please specify a team. Example: `!follow Arsenal`');
        }

        const matches = searchFixturesByTeam(teamName, 1);
        const matchedTeam = matches[0]?.homeTeam.name.toLowerCase().includes(teamName.toLowerCase())
          ? matches[0].homeTeam
          : (matches[0]?.awayTeam || { id: 0, name: teamName });

        const channelId = message.channel.id;
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
          .setTitle('🔔 Channel Subscribed!')
          .setDescription(`This channel will now receive live goal and match kickoff alerts for **${matchedTeam.name}**!`);

        return message.reply({ embeds: [embed] });
      }

      // !ask <query>
      if (content.startsWith('!ask')) {
        const query = content.replace('!ask', '').trim();
        if (!query) return message.reply('Please specify a query. Example: `!ask next arsenal match`');

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

        return message.reply({ embeds: [embed] });
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

import { TRACKED_LEAGUES } from '../config.js';
import { getNextUpcomingFixture } from '../db/database.js';
import { footballApi } from './footballApi.js';
import type { QueryResult, Fixture } from '../types.js';

export async function handleNaturalLanguageQuery(userQuery: string): Promise<QueryResult> {
  const clean = userQuery.trim().toLowerCase();

  // 1. Team-specific queries (CHECK FIRST so "barcelona" doesn't collide with "el" in Europa League)
  const teamMatch = await footballApi.findTeam(clean);

  if (teamMatch) {
    const isSquadQuery = clean.includes('squad') || clean.includes('player') || clean.includes('roster') || clean.includes('lineup');

    // Fetch squad & schedule in parallel from real ESPN feed + DB
    const [squad, schedule] = await Promise.all([
      footballApi.getTeamSquad(teamMatch.name),
      footballApi.getTeamSchedule(teamMatch.name)
    ]);

    if (isSquadQuery && squad) {
      return {
        query: userQuery,
        intent: 'squad',
        message: `Official current squad for **${teamMatch.name}** (${squad.players.length} players):`,
        squad,
        matches: schedule.slice(0, 3)
      };
    }

    // Default team search: show upcoming real matches + squad roster
    const matchCount = schedule.length;
    return {
      query: userQuery,
      intent: 'team_info',
      message: matchCount > 0 
        ? `Found ${matchCount} match${matchCount > 1 ? 'es' : ''} in the schedule for **${teamMatch.name}**:`
        : `Match schedule and official squad for **${teamMatch.name}**:`,
      matches: schedule,
      squad: squad || undefined
    };
  }

  // 2. Check for live matches
  if (clean.includes('live') || clean.includes('now') || clean.includes('playing today') || clean.includes('who is playing')) {
    const liveMatches = await footballApi.getLiveMatches();
    if (liveMatches.length === 0) {
      const todayMatches = await footballApi.getTodayMatches();
      return {
        query: userQuery,
        intent: 'live_matches',
        message: 'There are currently no active in-play matches right now. Here are the matches scheduled for today:',
        matches: todayMatches.slice(0, 6)
      };
    }
    return {
      query: userQuery,
      intent: 'live_matches',
      message: `Found ${liveMatches.length} live match${liveMatches.length > 1 ? 'es' : ''} right now:`,
      matches: liveMatches
    };
  }

  // 3. Check for standings / table requests
  if (clean.includes('table') || clean.includes('standing') || clean.includes('standings')) {
    let matchedLeagueId = 39;
    for (const league of Object.values(TRACKED_LEAGUES)) {
      if (clean.includes(league.name.toLowerCase())) {
        matchedLeagueId = league.id;
        break;
      }
    }
    const standings = await footballApi.getStandings(matchedLeagueId);
    const leagueName = TRACKED_LEAGUES[matchedLeagueId]?.name || 'League';
    return {
      query: userQuery,
      intent: 'standings',
      message: `Here is the current table for **${leagueName}**:`,
      standings
    };
  }

  // 4. Check for specific league fixtures (use whole-word boundaries so 'el' doesn't match 'barcelona')
  const words = clean.split(/\s+/);
  for (const league of Object.values(TRACKED_LEAGUES)) {
    const leagueLower = league.name.toLowerCase();
    const codeLower = league.code.toLowerCase();
    const matchesName = clean.includes(leagueLower);
    const matchesCode = words.includes(codeLower) || (league.id === 2 && (words.includes('ucl') || clean.includes('champions league'))) || (league.id === 3 && (words.includes('uel') || clean.includes('europa league')));

    if (matchesName || matchesCode) {
      const fixtures = await footballApi.getFixtures(league.id);
      return {
        query: userQuery,
        intent: 'league_fixtures',
        message: `Upcoming fixtures in **${league.name}**:`,
        matches: fixtures.slice(0, 6)
      };
    }
  }

  // Fallback: marquee upcoming match
  const generalNext = getNextUpcomingFixture();
  return {
    query: userQuery,
    intent: 'unknown',
    message: `I couldn't pinpoint "${userQuery}". Here is the marquee upcoming European match:`,
    matches: generalNext ? [generalNext] : []
  };
}

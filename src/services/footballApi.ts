import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import type { 
  Fixture, StandingTeam, MatchEvent, MatchStatus, TeamSquad, SquadPlayer,
  MatchDetails, MatchStatComparison, LineupPlayer, H2HSummary, H2HMeeting,
  LeagueLeaders, LeagueLeaderPlayer, PlayerProfile, GlobalSearchResult, Team
} from '../types.js';
import { saveFixtures, getFixturesByLeague, getLiveFixturesFromDb, searchFixturesByTeam } from '../db/database.js';

export interface ClubInfo {
  id: number;
  name: string;
  shortName?: string;
  code?: string;
  logo: string;
  leagueId: number;
  espnLeagueCode: string;
}

const TEAM_ALIASES: Record<string, string> = {
  'barca': 'barcelona',
  'barça': 'barcelona',
  'fc barcelona': 'barcelona',
  'fcb': 'barcelona',
  'madrid': 'real madrid',
  'real': 'real madrid',
  'los blancos': 'real madrid',
  'atleti': 'atletico madrid',
  'atletico': 'atletico madrid',
  'gunners': 'arsenal',
  'the gunners': 'arsenal',
  'man city': 'manchester city',
  'mancity': 'manchester city',
  'city': 'manchester city',
  'man utd': 'manchester united',
  'manutd': 'manchester united',
  'man united': 'manchester united',
  'united': 'manchester united',
  'red devils': 'manchester united',
  'chelsea': 'chelsea',
  'the blues': 'chelsea',
  'spurs': 'tottenham hotspur',
  'tottenham': 'tottenham hotspur',
  'liverpool': 'liverpool',
  'reds': 'liverpool',
  'the reds': 'liverpool',
  'juve': 'juventus',
  'inter': 'internazionale',
  'inter milan': 'internazionale',
  'milan': 'ac milan',
  'roma': 'as roma',
  'bvb': 'borussia dortmund',
  'dortmund': 'borussia dortmund',
  'bayern': 'bayern munich',
  'fc bayern': 'bayern munich',
  'leverkusen': 'bayer leverkusen',
  'psg': 'paris saint-germain',
  'paris': 'paris saint-germain',
  'monaco': 'as monaco',
  'marseille': 'olympique de marseille',
  'om': 'olympique de marseille',
  'ol': 'olympique lyonnais',
  'lyon': 'olympique lyonnais'
};

class FootballApiService {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private teamDirectory: Map<string, ClubInfo> = new Map();
  private teamsByLeague: Map<number, ClubInfo[]> = new Map();
  private isTeamsIndexed = false;

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any, ttlSec: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSec * 1000
    });
  }

  // 1. Index all clubs across all tracked leagues from ESPN
  public async indexAllTeams(): Promise<void> {
    if (this.isTeamsIndexed) return;
    console.log('[FootballAPI] Indexing all clubs across Top 5 Leagues & UEFA...');

    for (const league of Object.values(TRACKED_LEAGUES)) {
      if (!league.espnCode) continue;

      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/teams`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) continue;

        const json = await res.json();
        const teamsRaw = json.sports?.[0]?.leagues?.[0]?.teams || [];
        const leagueClubs: ClubInfo[] = [];

        for (const item of teamsRaw) {
          const t = item.team;
          if (!t) continue;

          const club: ClubInfo = {
            id: parseInt(t.id, 10),
            name: t.displayName || t.name,
            shortName: t.shortDisplayName || t.name,
            code: t.abbreviation,
            logo: t.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png`,
            leagueId: league.id,
            espnLeagueCode: league.espnCode
          };

          leagueClubs.push(club);

          // Index by exact name and clean variants
          const norm = (str: string) => str.toLowerCase().trim().replace(/^fc\s+/, '').replace(/\s+fc$/, '').replace(/[\.\-]/g, '');
          this.teamDirectory.set(t.name.toLowerCase(), club);
          this.teamDirectory.set(t.displayName.toLowerCase(), club);
          this.teamDirectory.set(norm(t.name), club);
          this.teamDirectory.set(norm(t.displayName), club);
          if (t.shortDisplayName) this.teamDirectory.set(norm(t.shortDisplayName), club);
          if (t.abbreviation) this.teamDirectory.set(t.abbreviation.toLowerCase(), club);
        }

        this.teamsByLeague.set(league.id, leagueClubs);
      } catch (err) {
        console.warn(`[FootballAPI] Could not index teams for ${league.name}:`, err);
      }
    }

    this.isTeamsIndexed = true;
    console.log(`[FootballAPI] Successfully indexed ${this.teamDirectory.size} club name mappings across all leagues!`);
  }

  // Get list of teams for a specific league or all leagues
  public async getTeams(leagueId?: number): Promise<ClubInfo[]> {
    await this.indexAllTeams();
    if (leagueId) {
      return this.teamsByLeague.get(leagueId) || [];
    }
    const all: ClubInfo[] = [];
    for (const list of this.teamsByLeague.values()) {
      all.push(...list);
    }
    return all;
  }

  // Find team by query string (case-insensitive, alias aware, fuzzy friendly)
  public async findTeam(query: string): Promise<ClubInfo | null> {
    if (!query || typeof query !== 'string') return null;
    await this.indexAllTeams();

    let clean = query.toLowerCase().trim();
    // Strip query noise words
    const stripped = clean.replace(/\b(schedule|fixtures|matches|match|vs|game|squad|roster|players|when|is|playing|next|who|the|now|live|scores?)\b/g, '').trim();

    // If query was just a generic status word without a team name, return null
    if (['', 'live', 'today', 'now', 'match', 'game', 'score', 'scores', 'table', 'standings'].includes(stripped)) {
      return null;
    }

    clean = stripped;

    // Check alias direct match
    if (TEAM_ALIASES[clean]) {
      clean = TEAM_ALIASES[clean];
    } else {
      for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
        const regex = new RegExp(`\\b${alias}\\b`, 'i');
        if (regex.test(clean)) {
          clean = canonical;
          break;
        }
      }
    }

    const norm = clean.replace(/^fc\s+/, '').replace(/\s+fc$/, '').replace(/[\.\-]/g, '').trim();

    // Exact match
    if (this.teamDirectory.has(clean)) return this.teamDirectory.get(clean)!;
    if (this.teamDirectory.has(norm)) return this.teamDirectory.get(norm)!;

    // Partial contains (require at least 4 chars for norm to prevent false prefixes)
    for (const [key, club] of this.teamDirectory.entries()) {
      if (key.length >= 4 && (norm.includes(key) || (norm.length >= 4 && key.includes(norm)))) {
        return club;
      }
    }
    return null;
  }

  // 2. Get Real Squad / Roster for ANY club
  public async getTeamSquad(teamQuery: string): Promise<TeamSquad | null> {
    const team = await this.findTeam(teamQuery);
    if (!team) return null;

    const cacheKey = `squad:${team.id}`;
    const cached = this.getCached<TeamSquad>(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${team.espnLeagueCode}/teams/${team.id}/roster`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;

      const json = await res.json();
      const athletes = json.athletes || [];

      const players: SquadPlayer[] = athletes.map((a: any) => ({
        id: a.id,
        name: a.displayName || a.fullName || 'Player',
        jersey: a.jersey || '-',
        position: a.position?.displayName || 'Player'
      }));

      const squadData: TeamSquad = {
        teamName: team.name,
        teamLogo: team.logo,
        players
      };

      this.setCache(cacheKey, squadData, 86400); // 24h cache
      return squadData;
    } catch (err) {
      console.warn(`[ESPN Free API] Squad fetch failed for ${team.name}:`, err);
      return null;
    }
  }

  // 3. Get Real Team Full Schedule (Upcoming + Recent from ESPN & DB)
  public async getTeamSchedule(teamQuery: string): Promise<Fixture[]> {
    const team = await this.findTeam(teamQuery);
    if (!team) return [];

    const cacheKey = `schedule:${team.id}`;
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached) return cached;

    const fixturesMap = new Map<number, Fixture>();

    // 1. Check local database for any fixtures involving this team
    const dbFixtures = searchFixturesByTeam(team.name, 20);
    for (const f of dbFixtures) {
      fixturesMap.set(f.id, f);
    }
    if (team.shortName && team.shortName !== team.name) {
      for (const f of searchFixturesByTeam(team.shortName, 20)) {
        fixturesMap.set(f.id, f);
      }
    }

    // 2. Fetch official ESPN team schedule
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${team.espnLeagueCode}/teams/${team.id}/schedule`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.events)) {
          const league = TRACKED_LEAGUES[team.leagueId];
          for (const ev of json.events) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;

            const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
            const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
            if (!homeComp || !awayComp) continue;

            const state = ev.status?.type?.state;
            let status: MatchStatus = 'NS';
            if (state === 'in') status = '1H';
            else if (state === 'post' || ev.status?.type?.completed) status = 'FT';

            const parseScore = (c: any) => {
              if (c.score?.value !== undefined) return c.score.value;
              if (typeof c.score === 'string' || typeof c.score === 'number') return parseInt(c.score, 10);
              return null;
            };

            const fId = parseInt(ev.id, 10) || Math.floor(Math.random() * 90000) + 10000;
            fixturesMap.set(fId, {
              id: fId,
              leagueId: team.leagueId,
              leagueName: league?.name || 'Football',
              leagueLogo: league?.logo || '',
              round: ev.status?.type?.detail || ev.seasonType?.name || '',
              kickoff: ev.date || new Date().toISOString(),
              status,
              statusText: ev.status?.type?.description || (status === 'FT' ? 'Finished' : 'Scheduled'),
              elapsed: null,
              homeTeam: {
                id: parseInt(homeComp.team?.id, 10) || 1,
                name: homeComp.team?.displayName || 'Home',
                code: homeComp.team?.abbreviation,
                logo: homeComp.team?.logo || ''
              },
              awayTeam: {
                id: parseInt(awayComp.team?.id, 10) || 2,
                name: awayComp.team?.displayName || 'Away',
                code: awayComp.team?.abbreviation,
                logo: awayComp.team?.logo || ''
              },
              score: {
                home: parseScore(homeComp),
                away: parseScore(awayComp)
              },
              venue: comp.venue?.fullName || undefined
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[ESPN Free API] Schedule fetch failed for ${team.name}:`, err);
    }

    const allFixtures = Array.from(fixturesMap.values());
    allFixtures.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

    if (allFixtures.length > 0) {
      saveFixtures(allFixtures);
      this.setCache(cacheKey, allFixtures, 300);
    }
    return allFixtures;
  }

  // 4. Fetch Full Fixture Schedule across multiple matchday dates
  public async getFixtures(leagueId: number): Promise<Fixture[]> {
    const cacheKey = `fixtures:${leagueId}`;
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached && cached.length > 2) return cached;

    const league = TRACKED_LEAGUES[leagueId];

    if (CONFIG.useEspnFreeLiveFeed && league?.espnCode) {
      try {
        // First fetch current scoreboard to get active calendar dates
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/scoreboard`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const json = await res.json();
          const rawCalendar = json.leagues?.[0]?.calendar || [];
          const allFixtures: Fixture[] = [];

          // Map today's matches
          const todayEvents = this.mapEspnEventsToFixtures(json.events || [], leagueId);
          allFixtures.push(...todayEvents);

          // Extract date strings safely (handles string arrays and UEFA nested object entries)
          const calendarDates: string[] = [];
          for (const item of rawCalendar) {
            if (typeof item === 'string') {
              calendarDates.push(item);
            } else if (item && typeof item === 'object') {
              if (Array.isArray(item.entries)) {
                for (const entry of item.entries) {
                  if (typeof entry === 'string') calendarDates.push(entry);
                  else if (entry?.value) calendarDates.push(entry.value);
                  else if (entry?.startDate) calendarDates.push(entry.startDate);
                }
              } else if (item.startDate) {
                calendarDates.push(item.startDate);
              }
            }
          }

          // Find upcoming dates in calendar and fetch next 3 match dates to show the full schedule!
          const nowIso = new Date().toISOString().split('T')[0];
          const upcomingDates = calendarDates
            .map((c: string) => (typeof c === 'string' ? c.split('T')[0].replace(/-/g, '') : ''))
            .filter((dStr: string) => {
              if (!dStr || dStr.length < 8) return false;
              const dIso = `${dStr.substring(0, 4)}-${dStr.substring(4, 6)}-${dStr.substring(6, 8)}`;
              return dIso >= nowIso;
            })
            .slice(0, 3);

          for (const dateParam of upcomingDates) {
            try {
              const dateUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/scoreboard?dates=${dateParam}`;
              const dRes = await fetch(dateUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
              if (dRes.ok) {
                const dJson = await dRes.json();
                const dEvents = this.mapEspnEventsToFixtures(dJson.events || [], leagueId);
                for (const ev of dEvents) {
                  if (!allFixtures.some(existing => existing.id === ev.id)) {
                    allFixtures.push(ev);
                  }
                }
              }
            } catch (e) {}
          }

          if (allFixtures.length > 0) {
            saveFixtures(allFixtures);
            this.setCache(cacheKey, allFixtures, 300);
            return allFixtures;
          }
        }
      } catch (err) {
        console.warn(`[ESPN Free API] Error fetching full fixtures for ${league?.name}:`, err);
      }
    }

    const dbFixtures = getFixturesByLeague(leagueId);
    if (dbFixtures.length > 0) {
      this.setCache(cacheKey, dbFixtures, 60);
      return dbFixtures;
    }

    return [];
  }

  // Helper to map ESPN events array to our Fixture model
  private mapEspnEventsToFixtures(events: any[], leagueId: number): Fixture[] {
    const league = TRACKED_LEAGUES[leagueId];
    const fixtures: Fixture[] = [];

    for (const ev of events) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;

      const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
      if (!homeComp || !awayComp) continue;

      const state = ev.status?.type?.state;
      let status: MatchStatus = 'NS';
      if (state === 'in') status = '1H';
      else if (state === 'post' || ev.status?.type?.completed) status = 'FT';

      const elapsed = ev.status?.displayClock ? parseInt(ev.status.displayClock, 10) : null;
      const homeScore = homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null;
      const awayScore = awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null;

      const eventsList: MatchEvent[] = [];
      if (Array.isArray(comp.details)) {
        for (const d of comp.details) {
          if (d.type?.text?.toLowerCase().includes('goal')) {
            eventsList.push({
              time: { elapsed: parseInt(d.clock?.displayValue || '0', 10) },
              team: { id: d.team?.id ? parseInt(d.team.id, 10) : 0, name: d.team?.displayName || 'Team' },
              player: { name: d.athletesInvolved?.[0]?.displayName || 'Scorer' },
              type: 'Goal',
              detail: d.type?.text || 'Goal'
            });
          }
        }
      }

      fixtures.push({
        id: parseInt(ev.id, 10) || Math.floor(Math.random() * 90000) + 10000,
        leagueId,
        leagueName: league?.name || 'Football',
        leagueLogo: league?.logo || '',
        round: ev.status?.type?.detail || '',
        kickoff: ev.date || new Date().toISOString(),
        status,
        statusText: ev.status?.type?.description || 'Scheduled',
        elapsed,
        homeTeam: {
          id: parseInt(homeComp.team?.id, 10) || 1,
          name: homeComp.team?.displayName || 'Home',
          code: homeComp.team?.abbreviation,
          logo: homeComp.team?.logo || ''
        },
        awayTeam: {
          id: parseInt(awayComp.team?.id, 10) || 2,
          name: awayComp.team?.displayName || 'Away',
          code: awayComp.team?.abbreviation,
          logo: awayComp.team?.logo || ''
        },
        score: {
          home: homeScore,
          away: awayScore
        },
        venue: comp.venue?.fullName ? `${comp.venue.fullName}, ${comp.venue.address?.city || ''}` : undefined,
        events: eventsList
      });
    }

    return fixtures;
  }

  // 5. Get Live Matches (In-play only)
  public async getLiveMatches(): Promise<Fixture[]> {
    const cacheKey = 'fixtures:live';
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached) return cached;

    if (CONFIG.useEspnFreeLiveFeed) {
      const allPromises = Object.values(TRACKED_LEAGUES).map(async (l) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${l.espnCode}/scoreboard`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) return [];
          const json = await res.json();
          return this.mapEspnEventsToFixtures(json.events || [], l.id);
        } catch {
          return [];
        }
      });

      const results = await Promise.all(allPromises);
      const live = results.flat().filter(f => ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.status));
      if (live.length > 0) {
        this.setCache(cacheKey, live, 20);
        return live;
      }
    }

    const dbLive = getLiveFixturesFromDb();
    if (dbLive.length > 0) {
      this.setCache(cacheKey, dbLive, 15);
      return dbLive;
    }

    // Absolutely zero mock data fallback
    this.setCache(cacheKey, [], 20);
    return [];
  }

  // 5b. Get Today's Real Scoreboard Matches (Active, Upcoming or Finished Today)
  public async getTodayMatches(): Promise<Fixture[]> {
    const cacheKey = 'fixtures:today';
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached) return cached;

    if (CONFIG.useEspnFreeLiveFeed) {
      const allPromises = Object.values(TRACKED_LEAGUES).map(async (l) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${l.espnCode}/scoreboard`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) return [];
          const json = await res.json();
          return this.mapEspnEventsToFixtures(json.events || [], l.id);
        } catch {
          return [];
        }
      });

      const results = await Promise.all(allPromises);
      const today = results.flat();
      today.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
      this.setCache(cacheKey, today, 60);
      return today;
    }

    return [];
  }

  // 6. Get Standings (Enhanced for Top 5 Leagues & UEFA 36-team Swiss Stage)
  public async getStandings(leagueId: number): Promise<StandingTeam[]> {
    const cacheKey = `standings:${leagueId}`;
    const cached = this.getCached<StandingTeam[]>(cacheKey);
    if (cached) return cached;

    const league = TRACKED_LEAGUES[leagueId];
    if (league?.espnCode) {
      try {
        const url = `https://site.web.api.espn.com/apis/v2/sports/soccer/${league.espnCode}/standings`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const json = await res.json();
          let entries: any[] = [];
          if (Array.isArray(json.children)) {
            for (const child of json.children) {
              if (Array.isArray(child.standings?.entries)) {
                entries.push(...child.standings.entries);
              }
            }
          }
          if (entries.length === 0) {
            entries = json.standings?.[0]?.entries || [];
          }

          if (Array.isArray(entries) && entries.length > 0) {
            const list: StandingTeam[] = entries.map((item: any, idx: number) => {
              const getStat = (name: string) => item.stats?.find((s: any) => s.name === name)?.value ?? 0;
              return {
                rank: idx + 1,
                team: {
                  id: parseInt(item.team?.id, 10) || idx + 1,
                  name: item.team?.displayName || item.team?.name || 'Club',
                  logo: item.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${item.team?.id}.png`
                },
                points: getStat('points'),
                goalsDiff: getStat('pointDifferential') || getStat('goalDifference'),
                played: getStat('gamesPlayed'),
                win: getStat('wins'),
                draw: getStat('ties'),
                lose: getStat('losses'),
                form: item.stats?.find((s: any) => s.name === 'form')?.displayValue
              };
            });
            this.setCache(cacheKey, list, 3600);
            return list;
          }
        }
      } catch (e) {
        console.warn(`[FootballAPI] Standings fetch failed for ${league.name}:`, e);
      }
    }

    return [];
  }

  // 7. Match Center Details (Lineups, Formations, Dual-Team Stats, Key Events Timeline)
  public async getMatchDetails(matchId: number, leagueCode?: string): Promise<MatchDetails | null> {
    const cacheKey = `match:details:${matchId}`;
    const cached = this.getCached<MatchDetails>(cacheKey);
    if (cached) return cached;

    // Determine candidate league codes
    const candidates = leagueCode ? [leagueCode] : Object.values(TRACKED_LEAGUES).map(l => l.espnCode);

    for (const code of candidates) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/summary?event=${matchId}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) continue;

        const json = await res.json();
        const header = json.header;
        if (!header) continue;

        const comp = header.competitions?.[0];
        if (!comp) continue;

        const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
        const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
        if (!homeComp || !awayComp) continue;

        const state = header.status?.type?.state;
        let status: MatchStatus = 'NS';
        if (state === 'in') status = '1H';
        else if (state === 'post' || header.status?.type?.completed) status = 'FT';

        const fixture: Fixture = {
          id: matchId,
          leagueId: 0,
          leagueName: header.league?.name || 'Football',
          leagueLogo: header.league?.logos?.[0]?.href || '',
          round: header.season?.name || comp.round || '',
          kickoff: comp.date || new Date().toISOString(),
          status,
          statusText: header.status?.type?.description || 'Scheduled',
          elapsed: header.status?.displayClock ? parseInt(header.status.displayClock, 10) : null,
          homeTeam: {
            id: parseInt(homeComp.team?.id, 10) || 1,
            name: homeComp.team?.displayName || 'Home',
            code: homeComp.team?.abbreviation,
            logo: homeComp.team?.logos?.[0]?.href || homeComp.team?.logo || ''
          },
          awayTeam: {
            id: parseInt(awayComp.team?.id, 10) || 2,
            name: awayComp.team?.displayName || 'Away',
            code: awayComp.team?.abbreviation,
            logo: awayComp.team?.logos?.[0]?.href || awayComp.team?.logo || ''
          },
          score: {
            home: homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null,
            away: awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null
          },
          venue: comp.venue?.fullName ? `${comp.venue.fullName}, ${comp.venue.address?.city || ''}` : undefined,
          events: []
        };

        // Extract dual-team stats
        const stats: MatchStatComparison[] = [];
        const homeStatsRaw = json.boxscore?.teams?.find((t: any) => t.team?.id === homeComp.team?.id)?.statistics || [];
        const awayStatsRaw = json.boxscore?.teams?.find((t: any) => t.team?.id === awayComp.team?.id)?.statistics || [];

        const statDefinitions = [
          { name: 'possessionPct', label: 'Possession %' },
          { name: 'totalShots', label: 'Total Shots' },
          { name: 'shotsOnTarget', label: 'Shots on Target' },
          { name: 'wonCorners', label: 'Corner Kicks' },
          { name: 'foulsCommitted', label: 'Fouls Committed' },
          { name: 'yellowCards', label: 'Yellow Cards' },
          { name: 'redCards', label: 'Red Cards' },
          { name: 'accuratePasses', label: 'Passes Completed' }
        ];

        for (const def of statDefinitions) {
          const hStat = homeStatsRaw.find((s: any) => s.name === def.name)?.displayValue ?? '0';
          const aStat = awayStatsRaw.find((s: any) => s.name === def.name)?.displayValue ?? '0';
          const hNum = parseFloat(String(hStat).replace('%', '')) || 0;
          const aNum = parseFloat(String(aStat).replace('%', '')) || 0;
          const sum = hNum + aNum;
          const homePct = sum > 0 ? Math.round((hNum / sum) * 100) : 50;
          const awayPct = 100 - homePct;

          stats.push({
            name: def.name,
            label: def.label,
            homeValue: hStat,
            awayValue: aStat,
            homePct,
            awayPct
          });
        }

        // Extract Lineups (Starting XI + Bench Substitutes)
        const mapRoster = (rawRoster: any[]): { starters: LineupPlayer[]; substitutes: LineupPlayer[] } => {
          const starters: LineupPlayer[] = [];
          const substitutes: LineupPlayer[] = [];
          if (!Array.isArray(rawRoster)) return { starters, substitutes };

          for (const item of rawRoster) {
            const ath = item.athlete || item;
            const p: LineupPlayer = {
              id: String(ath.id || Math.random().toString(36).substring(7)),
              name: ath.displayName || ath.name || 'Player',
              jersey: String(ath.jersey ?? item.jersey ?? '-'),
              position: ath.position?.name || ath.position?.abbreviation || item.position || '',
              starter: !!item.starter,
              captain: !!item.captain
            };
            if (item.starter) {
              starters.push(p);
            } else {
              substitutes.push(p);
            }
          }
          return { starters, substitutes };
        };

        const homeRosterRaw = json.rosters?.find((r: any) => r.homeAway === 'home');
        const awayRosterRaw = json.rosters?.find((r: any) => r.homeAway === 'away');

        const homeLineupMapped = mapRoster(homeRosterRaw?.roster || []);
        const awayLineupMapped = mapRoster(awayRosterRaw?.roster || []);

        const lineups = {
          home: {
            team: fixture.homeTeam,
            formation: homeRosterRaw?.formation || '4-3-3',
            starters: homeLineupMapped.starters,
            substitutes: homeLineupMapped.substitutes
          },
          away: {
            team: fixture.awayTeam,
            formation: awayRosterRaw?.formation || '4-3-3',
            starters: awayLineupMapped.starters,
            substitutes: awayLineupMapped.substitutes
          }
        };

        // Extract Events Timeline (Goals, Cards, Subs)
        const timeline: MatchEvent[] = [];
        if (Array.isArray(json.keyEvents)) {
          for (const ev of json.keyEvents) {
            const isGoal = ev.type?.type === 'goal' || ev.type?.text?.toLowerCase().includes('goal') || ev.scoringPlay;
            const isCard = ev.type?.type === 'card' || ev.type?.text?.toLowerCase().includes('card');
            const isSub = ev.type?.type === 'substitution' || ev.type?.text?.toLowerCase().includes('sub');

            timeline.push({
              id: ev.id,
              time: { elapsed: parseInt(ev.clock?.displayValue || String(ev.period?.number ? ev.period.number * 45 : 0), 10) },
              team: {
                id: ev.team?.id ? parseInt(ev.team.id, 10) : 0,
                name: ev.team?.displayName || ''
              },
              player: {
                id: ev.participants?.[0]?.athlete?.id ? parseInt(ev.participants[0].athlete.id, 10) : undefined,
                name: ev.participants?.[0]?.athlete?.displayName || ev.text || ''
              },
              type: isGoal ? 'Goal' : isCard ? 'Card' : isSub ? 'subst' : 'Var',
              detail: ev.type?.text || ev.text || ''
            });
          }
        }

        // Extract Commentary
        const commentary: string[] = [];
        if (Array.isArray(json.commentary)) {
          for (const c of json.commentary.slice(0, 15)) {
            if (c.text) commentary.push(`${c.time?.displayValue ? c.time.displayValue + ' - ' : ''}${c.text}`);
          }
        }

        const matchDetails: MatchDetails = {
          fixture,
          stats,
          lineups,
          timeline,
          commentary
        };

        this.setCache(cacheKey, matchDetails, status === 'FT' ? 1800 : 30);
        return matchDetails;
      } catch (err) {
        // try next candidate league code
      }
    }
    return null;
  }

  // 8. Head-to-Head (H2H) Module: W/D/L record, last 5-10 meetings, score history
  public async getHeadToHead(team1Query: string, team2Query: string): Promise<H2HSummary | null> {
    const t1 = await this.findTeam(team1Query);
    const t2 = await this.findTeam(team2Query);
    if (!t1 || !t2) return null;

    const cacheKey = `h2h:${t1.id}:${t2.id}`;
    const cached = this.getCached<H2HSummary>(cacheKey);
    if (cached) return cached;

    const meetings: H2HMeeting[] = [];
    const seenEventIds = new Set<number>();
    const currentYear = new Date().getFullYear();
    const seasons = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

    // Fetch team 1's schedule & match history across multiple seasons to capture past meetings
    await Promise.all(
      seasons.map(async (yr) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${t1.espnLeagueCode}/teams/${t1.id}/schedule?season=${yr}`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) return;

          const json = await res.json();
          const events = json.events || [];
          for (const ev of events) {
            const evId = parseInt(ev.id, 10);
            if (seenEventIds.has(evId)) continue;

            const comp = ev.competitions?.[0];
            if (!comp) continue;
            const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
            const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
            if (!homeComp || !awayComp) continue;

            const hId = parseInt(homeComp.team?.id, 10);
            const aId = parseInt(awayComp.team?.id, 10);

            if ((hId === t1.id && aId === t2.id) || (hId === t2.id && aId === t1.id)) {
              seenEventIds.add(evId);
              const hScore = homeComp.score?.value ?? (homeComp.score?.displayValue !== undefined ? parseInt(homeComp.score.displayValue, 10) : (homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null));
              const aScore = awayComp.score?.value ?? (awayComp.score?.displayValue !== undefined ? parseInt(awayComp.score.displayValue, 10) : (awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null));

              let winnerId: number | null = null;
              if (hScore !== null && aScore !== null) {
                if (hScore > aScore) winnerId = hId;
                else if (aScore > hScore) winnerId = aId;
              }

              meetings.push({
                id: evId,
                date: ev.date || new Date().toISOString(),
                competition: ev.season?.name || comp.notes?.[0]?.headline || 'Direct Match',
                homeTeam: {
                  id: hId,
                  name: homeComp.team?.displayName || 'Home',
                  logo: homeComp.team?.logos?.[0]?.href || homeComp.team?.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${hId}.png`
                },
                awayTeam: {
                  id: aId,
                  name: awayComp.team?.displayName || 'Away',
                  logo: awayComp.team?.logos?.[0]?.href || awayComp.team?.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${aId}.png`
                },
                score: { home: hScore, away: aScore },
                winnerId
              });
            }
          }
        } catch (e) {}
      })
    );

    // Sort by date descending and cap to last 10 meetings
    meetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recentMeetings = meetings.slice(0, 10);

    let t1Wins = 0;
    let t2Wins = 0;
    let draws = 0;
    let t1Goals = 0;
    let t2Goals = 0;

    for (const m of recentMeetings) {
      if (m.winnerId === t1.id) t1Wins++;
      else if (m.winnerId === t2.id) t2Wins++;
      else if (m.score.home !== null && m.score.away !== null) draws++;

      if (m.homeTeam.id === t1.id) {
        t1Goals += m.score.home || 0;
        t2Goals += m.score.away || 0;
      } else {
        t2Goals += m.score.home || 0;
        t1Goals += m.score.away || 0;
      }
    }

    const summary: H2HSummary = {
      team1: { id: t1.id, name: t1.name, logo: t1.logo, code: t1.code },
      team2: { id: t2.id, name: t2.name, logo: t2.logo, code: t2.code },
      totalMatches: recentMeetings.length,
      team1Wins: t1Wins,
      draws,
      team2Wins: t2Wins,
      team1Goals: t1Goals,
      team2Goals: t2Goals,
      recentMeetings
    };

    this.setCache(cacheKey, summary, 600);
    return summary;
  }

  // 9. League Leaders (Top Scorers & Assists per League)
  public async getLeagueLeaders(leagueId: number): Promise<LeagueLeaders | null> {
    const cacheKey = `leaders:${leagueId}`;
    const cached = this.getCached<LeagueLeaders>(cacheKey);
    if (cached) return cached;

    const league = TRACKED_LEAGUES[leagueId];
    if (!league?.espnCode) return null;

    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/statistics`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;

      const json = await res.json();
      const statsCategories = json.stats || [];

      const parseCategory = (name: string): LeagueLeaderPlayer[] => {
        const cat = statsCategories.find((c: any) => c.name === name || c.displayName?.toLowerCase().includes(name));
        if (!cat || !Array.isArray(cat.leaders)) return [];

        return cat.leaders.slice(0, 15).map((l: any, idx: number) => {
          const ath = l.athlete || {};
          const team = ath.team || {};
          let apps = 0;
          const matchMatch = (l.displayValue || '').match(/Matches:\s*(\d+)/i);
          if (matchMatch) apps = parseInt(matchMatch[1], 10);

          return {
            rank: idx + 1,
            id: String(ath.id || idx + 1),
            name: ath.displayName || 'Player',
            shortName: ath.shortName || ath.displayName,
            jersey: ath.jersey || '',
            team: {
              id: parseInt(team.id, 10) || 0,
              name: team.displayName || team.name || 'Club',
              logo: team.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`
            },
            appearances: apps,
            value: l.value ?? 0,
            displayValue: l.displayValue || String(l.value ?? 0)
          };
        });
      };

      const topScorers = parseCategory('goalsLeaders');
      const topAssists = parseCategory('assistsLeaders');

      const result: LeagueLeaders = {
        leagueId,
        leagueName: league.name,
        topScorers,
        topAssists
      };

      this.setCache(cacheKey, result, 1800);
      return result;
    } catch (err) {
      console.warn(`[FootballAPI] Failed to fetch leaders for ${league.name}:`, err);
      return null;
    }
  }

  // 10. Player Profile (Photo, Club, Position, Age, Season Stats)
  public async getPlayerProfile(playerId: string | number): Promise<PlayerProfile | null> {
    const cacheKey = `player:${playerId}`;
    const cached = this.getCached<PlayerProfile>(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/${playerId}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;

      const json = await res.json();
      const ath = json.athlete;
      if (!ath) return null;

      const team = ath.team || {};
      const statsSummary = ath.statsSummary?.statistics || [];

      const getStat = (names: string[]) => {
        const item = statsSummary.find((s: any) =>
          names.some(n => s.name?.toLowerCase() === n.toLowerCase() || s.name?.toLowerCase().includes(n.toLowerCase()))
        );
        if (!item) return 0;
        if (typeof item.value === 'number') return item.value;
        const parsed = parseFloat(item.displayValue);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Also parse starts-subIns if present e.g. "4 (0)" -> 4 appearances
      let apps = getStat(['appearances', 'gamesPlayed']);
      if (!apps) {
        const startsItem = statsSummary.find((s: any) => s.name === 'starts-subIns');
        if (startsItem) {
          if (typeof startsItem.value === 'number') {
            apps = startsItem.value;
          } else if (startsItem.displayValue) {
            const m = startsItem.displayValue.match(/(\d+)\s*\(\s*(\d+)\s*\)/);
            if (m) apps = parseInt(m[1], 10) + parseInt(m[2], 10);
            else apps = parseFloat(startsItem.displayValue) || 0;
          }
        }
      }

      const goals = getStat(['totalGoals', 'goals']);
      const assists = getStat(['goalAssists', 'assists']);
      const yellowCards = getStat(['yellowCards', 'yellow']);
      const redCards = getStat(['redCards', 'red']);

      const profile: PlayerProfile = {
        id: String(ath.id),
        name: ath.displayName || ath.fullName || 'Player',
        fullName: ath.fullName,
        jersey: ath.jersey,
        photo: `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${ath.id}.png&w=350&h=254`,
        position: ath.position?.displayName || ath.position?.name || 'Forward',
        team: {
          id: parseInt(team.id, 10) || 0,
          name: team.displayName || team.name || 'Club',
          logo: team.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`
        },
        age: ath.age,
        birthDate: ath.displayDOB,
        height: ath.displayHeight,
        weight: ath.displayWeight,
        nationality: ath.citizenship || ath.citizenshipCountry,
        flag: ath.flag?.href,
        stats: {
          season: ath.statsSummary?.displayName || ath.statsSummary?.season?.displayName || '2024-25',
          appearances: apps,
          goals,
          assists,
          yellowCards,
          redCards
        }
      };

      this.setCache(cacheKey, profile, 3600);
      return profile;
    } catch (err) {
      console.warn(`[FootballAPI] Failed to fetch player profile for ${playerId}:`, err);
      return null;
    }
  }

  // 11. Omnichannel Global Search (Teams, Players, Fixtures)
  public async globalSearch(query: string): Promise<GlobalSearchResult> {
    if (!query || typeof query !== 'string') {
      return { query: '', teams: [], players: [], fixtures: [] };
    }
    await this.indexAllTeams();

    const q = query.toLowerCase().trim();
    const matchingTeams: Team[] = [];
    const matchingPlayers: (SquadPlayer & { teamName: string; teamLogo: string; teamId: number })[] = [];

    // Search clubs
    for (const club of this.teamDirectory.values()) {
      if (club.name.toLowerCase().includes(q) || (club.shortName && club.shortName.toLowerCase().includes(q))) {
        if (!matchingTeams.some(t => t.id === club.id)) {
          matchingTeams.push({
            id: club.id,
            name: club.name,
            code: club.code,
            logo: club.logo
          });
        }
      }
      if (matchingTeams.length >= 6) break;
    }

    // Search players across cached squads
    for (const [key, cacheItem] of this.cache.entries()) {
      if (key.startsWith('squad:')) {
        const squad = cacheItem.data as TeamSquad;
        if (squad && Array.isArray(squad.players)) {
          for (const p of squad.players) {
            if (p.name.toLowerCase().includes(q)) {
              if (!matchingPlayers.some(existing => existing.id === p.id)) {
                matchingPlayers.push({
                  ...p,
                  teamName: squad.teamName,
                  teamLogo: squad.teamLogo || '',
                  teamId: 0
                });
              }
              if (matchingPlayers.length >= 8) break;
            }
          }
        }
      }
      if (matchingPlayers.length >= 8) break;
    }

    // Also search live athletes via ESPN search API if we have few players
    if (matchingPlayers.length < 5) {
      try {
        const searchUrl = `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=8`;
        const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (sRes.ok) {
          const sJson = await sRes.json();
          const results = sJson.results || [];
          for (const group of results) {
            const contents = group.contents || [];
            for (const item of contents) {
              if (item.sport === 'soccer' && item.type === 'player') {
                let pId = '';
                const uidMatch = (item.uid || '').match(/a:(\d+)/);
                if (uidMatch) pId = uidMatch[1];
                else {
                  const linkMatch = (item.link?.web || '').match(/\/id\/(\d+)/);
                  if (linkMatch) pId = linkMatch[1];
                }
                if (pId && !matchingPlayers.some(existing => existing.id === pId)) {
                  matchingPlayers.push({
                    id: pId,
                    name: item.displayName || 'Player',
                    jersey: '',
                    position: item.description || 'Soccer Player',
                    teamName: item.subtitle || 'Club',
                    teamLogo: '',
                    teamId: 0
                  });
                }
                if (matchingPlayers.length >= 8) break;
              }
            }
            if (matchingPlayers.length >= 8) break;
          }
        }
      } catch (e) {}
    }

    // Search fixtures
    const matchingFixtures = searchFixturesByTeam(q, 6);

    return {
      query,
      teams: matchingTeams.slice(0, 5),
      players: matchingPlayers.slice(0, 6),
      fixtures: matchingFixtures.slice(0, 5)
    };
  }

  public async seedInitialData(): Promise<void> {
    console.log('[FootballAPI] Initializing real-time sports data across all 8 European competitions...');
    
    // 1. Index all 96+ clubs immediately
    await this.indexAllTeams().catch(err => console.error('[FootballAPI] Team indexing error:', err));

    // 2. Pre-fetch real schedules for all 8 leagues in parallel
    const leagueIds = Object.keys(TRACKED_LEAGUES).map(Number);
    console.log(`[FootballAPI] Pre-fetching live fixtures for ${leagueIds.length} competitions...`);
    
    await Promise.allSettled(leagueIds.map(id => this.getFixtures(id)));
    console.log('[FootballAPI] All 8 European competitions successfully synced and ready!');
  }
}

export const footballApi = new FootballApiService();

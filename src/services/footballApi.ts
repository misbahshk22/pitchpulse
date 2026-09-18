import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import type { Fixture, StandingTeam, MatchEvent, MatchStatus, TeamSquad, SquadPlayer } from '../types.js';
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

  // 6. Get Standings
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
          const entries = json.children?.[0]?.standings?.entries || json.standings?.[0]?.entries;
          if (Array.isArray(entries) && entries.length > 0) {
            const list: StandingTeam[] = entries.map((item: any, idx: number) => {
              const getStat = (name: string) => item.stats?.find((s: any) => s.name === name)?.value ?? 0;
              return {
                rank: idx + 1,
                team: {
                  id: parseInt(item.team?.id, 10) || idx + 1,
                  name: item.team?.displayName || 'Club',
                  logo: item.team?.logos?.[0]?.href || ''
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
      } catch (e) {}
    }

    return [];
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

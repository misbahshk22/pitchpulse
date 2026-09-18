import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import type { Fixture, AlertSubscription } from '../types.js';

// In-memory collections (ultra-fast, zero native dependencies, 100% serverless resilient)
const fixturesStore = new Map<number, Fixture>();
const subscriptionsStore = new Map<string, AlertSubscription>();

let dbInstance: any = null;
let sqliteAttempted = false;

export function getDatabase(): any {
  if (sqliteAttempted) return dbInstance;
  sqliteAttempted = true;

  // Never attempt native SQLite in serverless Lambda environments (Netlify / Vercel)
  if (process.env.NETLIFY || process.env.VERCEL) {
    return {
      exec: () => {},
      prepare: () => ({ run: () => {}, get: () => null, all: () => [] })
    };
  }

  try {
    // Dynamic import to avoid esbuild bundling require('sqlite')
    const sqliteModule = 'node:sqlite';
    const req = typeof require !== 'undefined' ? require : (eval('require') as any);
    const { DatabaseSync } = req(sqliteModule);
    if (DatabaseSync) {
      dbInstance = new DatabaseSync(CONFIG.databasePath);
      initSchema(dbInstance);
      return dbInstance;
    }
  } catch {
    // SQLite not available; in-memory store will serve seamlessly
  }

  return {
    exec: () => {},
    prepare: () => ({ run: () => {}, get: () => null, all: () => [] })
  };
}

function initSchema(db: any): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS leagues (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT,
        country TEXT,
        season INTEGER,
        logo TEXT,
        badge_color TEXT
      );
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT,
        logo TEXT
      );
      CREATE TABLE IF NOT EXISTS fixtures (
        id INTEGER PRIMARY KEY,
        league_id INTEGER NOT NULL,
        league_name TEXT,
        league_logo TEXT,
        round TEXT,
        kickoff TEXT NOT NULL,
        status TEXT NOT NULL,
        status_text TEXT,
        elapsed INTEGER,
        home_team_id INTEGER NOT NULL,
        home_team_name TEXT NOT NULL,
        home_team_logo TEXT,
        away_team_id INTEGER NOT NULL,
        away_team_name TEXT NOT NULL,
        away_team_logo TEXT,
        home_score INTEGER,
        away_score INTEGER,
        venue TEXT,
        raw_events TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        target_id TEXT NOT NULL,
        team_id INTEGER,
        league_id INTEGER,
        events TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fixtures_league ON fixtures(league_id);
      CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
      CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff ON fixtures(kickoff);
    `);
  } catch {}
}

export function saveFixtures(fixtures: Fixture[]): void {
  for (const f of fixtures) {
    fixturesStore.set(f.id, f);
  }

  const db = getDatabase();
  if (db && dbInstance) {
    try {
      const upsert = db.prepare(`
        INSERT INTO fixtures (
          id, league_id, league_name, league_logo, round, kickoff, status, status_text,
          elapsed, home_team_id, home_team_name, home_team_logo,
          away_team_id, away_team_name, away_team_logo,
          home_score, away_score, venue, raw_events, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          status_text = excluded.status_text,
          elapsed = excluded.elapsed,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          raw_events = excluded.raw_events,
          updated_at = datetime('now')
      `);
      for (const f of fixtures) {
        upsert.run(
          f.id,
          f.leagueId,
          f.leagueName,
          f.leagueLogo,
          f.round || '',
          f.kickoff,
          f.status,
          f.statusText,
          f.elapsed,
          f.homeTeam.id,
          f.homeTeam.name,
          f.homeTeam.logo,
          f.awayTeam.id,
          f.awayTeam.name,
          f.awayTeam.logo,
          f.score.home,
          f.score.away,
          f.venue || '',
          JSON.stringify(f.events || [])
        );
      }
    } catch {}
  }
}

export function getFixturesByLeague(leagueId: number, limit = 50): Fixture[] {
  const matches = Array.from(fixturesStore.values())
    .filter(f => f.leagueId === leagueId)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  return matches.slice(0, limit);
}

export function getAllFixtures(limit = 100): Fixture[] {
  const matches = Array.from(fixturesStore.values())
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  return matches.slice(0, limit);
}

export function getLiveFixturesFromDb(): Fixture[] {
  const liveStatuses = new Set(['1H', '2H', 'HT', 'ET', 'P', 'LIVE']);
  return Array.from(fixturesStore.values())
    .filter(f => liveStatuses.has(f.status))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

export function getNextUpcomingFixture(teamQuery?: string): Fixture | null {
  const upcoming = Array.from(fixturesStore.values())
    .filter(f => f.status === 'NS')
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  if (!teamQuery) {
    return upcoming[0] || null;
  }

  const q = teamQuery.toLowerCase();
  const match = upcoming.find(f => 
    f.homeTeam.name.toLowerCase().includes(q) ||
    f.awayTeam.name.toLowerCase().includes(q)
  );
  return match || null;
}

export function searchFixturesByTeam(teamName: string, limit = 10): Fixture[] {
  const q = teamName.toLowerCase();
  const matches = Array.from(fixturesStore.values())
    .filter(f => 
      f.homeTeam.name.toLowerCase().includes(q) ||
      f.awayTeam.name.toLowerCase().includes(q)
    )
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  return matches.slice(0, limit);
}

export function saveSubscription(sub: AlertSubscription): void {
  subscriptionsStore.set(sub.id, sub);
}

export function getAllSubscriptions(): AlertSubscription[] {
  return Array.from(subscriptionsStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function deleteSubscription(id: string): boolean {
  return subscriptionsStore.delete(id);
}

export function getSubscriptionsForTeam(teamId: number): AlertSubscription[] {
  return Array.from(subscriptionsStore.values())
    .filter(sub => !sub.teamId || sub.teamId === teamId);
}

import { DatabaseSync } from 'node:sqlite';
import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import type { Fixture, AlertSubscription } from '../types.js';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(CONFIG.databasePath);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: DatabaseSync): void {
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

  // Seed default leagues if empty
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM leagues');
  const countRow = countStmt.get() as { count: number };
  if (countRow.count === 0) {
    const insertLeague = db.prepare(`
      INSERT INTO leagues (id, name, code, country, season, logo, badge_color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const league of Object.values(TRACKED_LEAGUES)) {
      insertLeague.run(
        league.id,
        league.name,
        league.code,
        league.country,
        league.season,
        league.logo,
        league.badgeColor
      );
    }
  }
}

export function saveFixtures(fixtures: Fixture[]): void {
  const db = getDatabase();
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
}

export function getFixturesByLeague(leagueId: number, limit = 50): Fixture[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM fixtures 
    WHERE league_id = ? 
    ORDER BY kickoff ASC 
    LIMIT ?
  `);
  const rows = stmt.all(leagueId, limit) as any[];
  return rows.map(mapRowToFixture);
}

export function getAllFixtures(limit = 100): Fixture[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM fixtures 
    ORDER BY kickoff ASC 
    LIMIT ?
  `);
  const rows = stmt.all(limit) as any[];
  return rows.map(mapRowToFixture);
}

export function getLiveFixturesFromDb(): Fixture[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM fixtures 
    WHERE status IN ('1H', '2H', 'HT', 'ET', 'P', 'LIVE')
    ORDER BY kickoff ASC
  `);
  const rows = stmt.all() as any[];
  return rows.map(mapRowToFixture);
}

export function getNextUpcomingFixture(teamQuery?: string): Fixture | null {
  const db = getDatabase();
  if (teamQuery) {
    const q = `%${teamQuery}%`;
    const stmt = db.prepare(`
      SELECT * FROM fixtures 
      WHERE (home_team_name LIKE ? OR away_team_name LIKE ?)
        AND status = 'NS'
      ORDER BY kickoff ASC 
      LIMIT 1
    `);
    const row = stmt.get(q, q) as any;
    return row ? mapRowToFixture(row) : null;
  }

  const stmt = db.prepare(`
    SELECT * FROM fixtures 
    WHERE status = 'NS' 
    ORDER BY kickoff ASC 
    LIMIT 1
  `);
  const row = stmt.get() as any;
  return row ? mapRowToFixture(row) : null;
}

export function searchFixturesByTeam(teamName: string, limit = 10): Fixture[] {
  const db = getDatabase();
  const q = `%${teamName}%`;
  const stmt = db.prepare(`
    SELECT * FROM fixtures 
    WHERE (home_team_name LIKE ? OR away_team_name LIKE ?)
    ORDER BY kickoff ASC 
    LIMIT ?
  `);
  const rows = stmt.all(q, q, limit) as any[];
  return rows.map(mapRowToFixture);
}

export function saveSubscription(sub: AlertSubscription): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO subscriptions (id, channel, target_id, team_id, league_id, events, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      events = excluded.events
  `);
  stmt.run(
    sub.id,
    sub.channel,
    sub.targetId,
    sub.teamId || null,
    sub.leagueId || null,
    JSON.stringify(sub.events),
    sub.createdAt
  );
}

export function getAllSubscriptions(): AlertSubscription[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM subscriptions ORDER BY created_at DESC`);
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    id: r.id,
    channel: r.channel,
    targetId: r.target_id,
    teamId: r.team_id,
    leagueId: r.league_id,
    events: JSON.parse(r.events || '[]'),
    createdAt: r.created_at
  }));
}

export function deleteSubscription(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM subscriptions WHERE id = ?`);
  const res = stmt.run(id);
  return res.changes > 0;
}

export function getSubscriptionsForTeam(teamId: number): AlertSubscription[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE team_id = ? OR team_id IS NULL
  `);
  const rows = stmt.all(teamId) as any[];
  return rows.map(r => ({
    id: r.id,
    channel: r.channel,
    targetId: r.target_id,
    teamId: r.team_id,
    leagueId: r.league_id,
    events: JSON.parse(r.events),
    createdAt: r.created_at
  }));
}

function mapRowToFixture(row: any): Fixture {
  return {
    id: row.id,
    leagueId: row.league_id,
    leagueName: row.league_name,
    leagueLogo: row.league_logo,
    round: row.round,
    kickoff: row.kickoff,
    status: row.status,
    statusText: row.status_text,
    elapsed: row.elapsed,
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name,
      logo: row.home_team_logo
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name,
      logo: row.away_team_logo
    },
    score: {
      home: row.home_score,
      away: row.away_score
    },
    venue: row.venue,
    events: row.raw_events ? JSON.parse(row.raw_events) : []
  };
}

export type MatchStatus = 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'P' | 'FT' | 'AET' | 'PEN' | 'PST' | 'CANC';

export interface Team {
  id: number;
  name: string;
  code?: string;
  logo: string;
}

export interface FixtureScore {
  home: number | null;
  away: number | null;
}

export interface MatchEvent {
  id?: string;
  time: {
    elapsed: number;
    extra?: number | null;
  };
  team: {
    id: number;
    name: string;
    logo?: string;
  };
  player: {
    id?: number;
    name: string;
  };
  assist?: {
    id?: number;
    name: string | null;
  };
  type: 'Goal' | 'Card' | 'subst' | 'Var';
  detail: string;
  comments?: string | null;
}

export interface Fixture {
  id: number;
  leagueId: number;
  leagueName: string;
  leagueLogo: string;
  round?: string;
  kickoff: string; // ISO 8601
  status: MatchStatus;
  statusText: string;
  elapsed: number | null;
  homeTeam: Team;
  awayTeam: Team;
  score: FixtureScore;
  venue?: string;
  events?: MatchEvent[];
}

export interface StandingTeam {
  rank: number;
  team: Team;
  points: number;
  goalsDiff: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  form?: string;
}

export interface StandingGroup {
  leagueId: number;
  leagueName: string;
  standings: StandingTeam[];
}

export interface AlertSubscription {
  id: string;
  channel: 'web' | 'telegram' | 'discord' | 'whatsapp';
  targetId: string;
  teamId?: number;
  leagueId?: number;
  competitionFilter?: string; // Granular filter: e.g. "all", "uefa.champions", "eng.1"
  events: ('kickoff' | 'lineup' | 'goal' | 'fulltime')[];
  createdAt: string;
}

export interface SquadPlayer {
  id?: string;
  name: string;
  jersey?: string;
  position?: string;
  photo?: string;
}

export interface TeamSquad {
  teamName: string;
  teamLogo?: string;
  manager?: string;
  stadium?: string;
  players: SquadPlayer[];
}

export interface QueryResult {
  query: string;
  intent: 'next_match' | 'live_matches' | 'league_fixtures' | 'standings' | 'team_info' | 'squad' | 'unknown';
  message: string;
  matches?: Fixture[];
  standings?: StandingTeam[];
  squad?: TeamSquad;
}

// ==========================================
// Phase 1: Core Additions Types
// ==========================================

export interface MatchStatComparison {
  name: string;
  label: string;
  homeValue: number | string;
  awayValue: number | string;
  homePct: number;
  awayPct: number;
}

export interface LineupPlayer {
  id: string;
  name: string;
  jersey: string;
  position: string;
  starter: boolean;
  captain?: boolean;
}

export interface TeamLineup {
  team: Team;
  formation?: string;
  starters: LineupPlayer[];
  substitutes: LineupPlayer[];
}

export interface MatchDetails {
  fixture: Fixture;
  stats: MatchStatComparison[];
  lineups: {
    home: TeamLineup;
    away: TeamLineup;
  };
  timeline: MatchEvent[];
  commentary?: string[];
  lastFiveGames?: {
    home: Fixture[];
    away: Fixture[];
  };
}

export interface H2HMeeting {
  id: number;
  date: string;
  competition: string;
  homeTeam: Team;
  awayTeam: Team;
  score: FixtureScore;
  winnerId: number | null; // null = draw
}

export interface H2HSummary {
  team1: Team;
  team2: Team;
  totalMatches: number;
  team1Wins: number;
  draws: number;
  team2Wins: number;
  team1Goals: number;
  team2Goals: number;
  recentMeetings: H2HMeeting[];
}

export interface LeagueLeaderPlayer {
  rank: number;
  id: string;
  name: string;
  shortName?: string;
  jersey?: string;
  team: Team;
  appearances: number;
  value: number;
  displayValue: string;
  photo?: string;
}

export interface LeagueLeaders {
  leagueId: number;
  leagueName: string;
  topScorers: LeagueLeaderPlayer[];
  topAssists: LeagueLeaderPlayer[];
}

export interface PlayerProfile {
  id: string;
  name: string;
  fullName?: string;
  jersey?: string;
  photo: string;
  position: string;
  team: Team;
  age?: number;
  birthDate?: string;
  height?: string;
  weight?: string;
  nationality?: string;
  flag?: string;
  stats: {
    season: string;
    appearances: number;
    goals: number;
    assists: number;
    yellowCards?: number;
    redCards?: number;
  };
}

export interface GlobalSearchResult {
  query: string;
  teams: Team[];
  players: (SquadPlayer & { teamName: string; teamLogo: string; teamId: number })[];
  fixtures: Fixture[];
}


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
  events: ('kickoff' | 'lineup' | 'goal' | 'fulltime')[];
  createdAt: string;
}

export interface SquadPlayer {
  id?: string;
  name: string;
  jersey?: string;
  position?: string;
}

export interface TeamSquad {
  teamName: string;
  teamLogo?: string;
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

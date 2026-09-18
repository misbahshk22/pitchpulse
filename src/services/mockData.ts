import type { Fixture, StandingTeam } from '../types.js';

export function getMockFixtures(): Fixture[] {
  const now = new Date();
  const todayIso = (offsetHours: number) => new Date(now.getTime() + offsetHours * 3600 * 1000).toISOString();

  return [
    // 1. Live Match - Premier League
    {
      id: 1001,
      leagueId: 39,
      leagueName: 'Premier League',
      leagueLogo: 'https://media.api-sports.io/football/leagues/39.png',
      round: 'Regular Season - 28',
      kickoff: todayIso(-1.2), // started ~72 mins ago
      status: '2H',
      statusText: 'Second Half',
      elapsed: 73,
      homeTeam: {
        id: 42,
        name: 'Arsenal',
        code: 'ARS',
        logo: 'https://media.api-sports.io/football/teams/42.png'
      },
      awayTeam: {
        id: 49,
        name: 'Chelsea',
        code: 'CHE',
        logo: 'https://media.api-sports.io/football/teams/49.png'
      },
      score: { home: 2, away: 1 },
      venue: 'Emirates Stadium, London',
      events: [
        {
          time: { elapsed: 14 },
          team: { id: 42, name: 'Arsenal' },
          player: { name: 'Bukayo Saka' },
          assist: { name: 'Martin Ødegaard' },
          type: 'Goal',
          detail: 'Normal Goal'
        },
        {
          time: { elapsed: 38 },
          team: { id: 49, name: 'Chelsea' },
          player: { name: 'Cole Palmer' },
          assist: { name: 'Nicolas Jackson' },
          type: 'Goal',
          detail: 'Normal Goal'
        },
        {
          time: { elapsed: 59 },
          team: { id: 42, name: 'Arsenal' },
          player: { name: 'Kai Havertz' },
          assist: { name: 'Declan Rice' },
          type: 'Goal',
          detail: 'Header'
        },
        {
          time: { elapsed: 65 },
          team: { id: 49, name: 'Chelsea' },
          player: { name: 'Moisés Caicedo' },
          type: 'Card',
          detail: 'Yellow Card'
        }
      ]
    },

    // 2. Upcoming Match - Premier League
    {
      id: 1002,
      leagueId: 39,
      leagueName: 'Premier League',
      leagueLogo: 'https://media.api-sports.io/football/leagues/39.png',
      round: 'Regular Season - 28',
      kickoff: todayIso(2.5),
      status: 'NS',
      statusText: 'Not Started',
      elapsed: null,
      homeTeam: {
        id: 50,
        name: 'Manchester City',
        code: 'MCI',
        logo: 'https://media.api-sports.io/football/teams/50.png'
      },
      awayTeam: {
        id: 40,
        name: 'Liverpool',
        code: 'LIV',
        logo: 'https://media.api-sports.io/football/teams/40.png'
      },
      score: { home: null, away: null },
      venue: 'Etihad Stadium, Manchester'
    },

    // 3. Live Match - UEFA Champions League
    {
      id: 2001,
      leagueId: 2,
      leagueName: 'UEFA Champions League',
      leagueLogo: 'https://media.api-sports.io/football/leagues/2.png',
      round: 'Round of 16',
      kickoff: todayIso(-0.6), // started ~36 mins ago
      status: '1H',
      statusText: 'First Half',
      elapsed: 38,
      homeTeam: {
        id: 541,
        name: 'Real Madrid',
        code: 'RMA',
        logo: 'https://media.api-sports.io/football/teams/541.png'
      },
      awayTeam: {
        id: 157,
        name: 'Bayern Munich',
        code: 'BAY',
        logo: 'https://media.api-sports.io/football/teams/157.png'
      },
      score: { home: 1, away: 0 },
      venue: 'Santiago Bernabéu, Madrid',
      events: [
        {
          time: { elapsed: 22 },
          team: { id: 541, name: 'Real Madrid' },
          player: { name: 'Vinícius Júnior' },
          assist: { name: 'Jude Bellingham' },
          type: 'Goal',
          detail: 'Normal Goal'
        }
      ]
    },

    // 4. Upcoming - La Liga
    {
      id: 3001,
      leagueId: 140,
      leagueName: 'La Liga',
      leagueLogo: 'https://media.api-sports.io/football/leagues/140.png',
      round: 'Regular Season - 27',
      kickoff: todayIso(5),
      status: 'NS',
      statusText: 'Not Started',
      elapsed: null,
      homeTeam: {
        id: 529,
        name: 'Barcelona',
        code: 'BAR',
        logo: 'https://media.api-sports.io/football/teams/529.png'
      },
      awayTeam: {
        id: 530,
        name: 'Atletico Madrid',
        code: 'ATM',
        logo: 'https://media.api-sports.io/football/teams/530.png'
      },
      score: { home: null, away: null },
      venue: 'Estadi Olímpic Lluís Companys, Barcelona'
    },

    // 5. Finished Match - Serie A
    {
      id: 4001,
      leagueId: 135,
      leagueName: 'Serie A',
      leagueLogo: 'https://media.api-sports.io/football/leagues/135.png',
      round: 'Regular Season - 27',
      kickoff: todayIso(-5),
      status: 'FT',
      statusText: 'Match Finished',
      elapsed: 90,
      homeTeam: {
        id: 505,
        name: 'Inter Milan',
        code: 'INT',
        logo: 'https://media.api-sports.io/football/teams/505.png'
      },
      awayTeam: {
        id: 496,
        name: 'Juventus',
        code: 'JUV',
        logo: 'https://media.api-sports.io/football/teams/496.png'
      },
      score: { home: 2, away: 0 },
      venue: 'San Siro, Milan',
      events: [
        {
          time: { elapsed: 31 },
          team: { id: 505, name: 'Inter Milan' },
          player: { name: 'Lautaro Martínez' },
          type: 'Goal',
          detail: 'Normal Goal'
        },
        {
          time: { elapsed: 78 },
          team: { id: 505, name: 'Inter Milan' },
          player: { name: 'Marcus Thuram' },
          type: 'Goal',
          detail: 'Normal Goal'
        }
      ]
    },

    // 6. Upcoming - Bundesliga
    {
      id: 5001,
      leagueId: 78,
      leagueName: 'Bundesliga',
      leagueLogo: 'https://media.api-sports.io/football/leagues/78.png',
      round: 'Matchday 25',
      kickoff: todayIso(24),
      status: 'NS',
      statusText: 'Not Started',
      elapsed: null,
      homeTeam: {
        id: 168,
        name: 'Bayer Leverkusen',
        code: 'B04',
        logo: 'https://media.api-sports.io/football/teams/168.png'
      },
      awayTeam: {
        id: 165,
        name: 'Borussia Dortmund',
        code: 'BVB',
        logo: 'https://media.api-sports.io/football/teams/165.png'
      },
      score: { home: null, away: null },
      venue: 'BayArena, Leverkusen'
    },

    // 7. Upcoming - Ligue 1
    {
      id: 6001,
      leagueId: 61,
      leagueName: 'Ligue 1',
      leagueLogo: 'https://media.api-sports.io/football/leagues/61.png',
      round: 'Round 25',
      kickoff: todayIso(26),
      status: 'NS',
      statusText: 'Not Started',
      elapsed: null,
      homeTeam: {
        id: 85,
        name: 'Paris Saint Germain',
        code: 'PSG',
        logo: 'https://media.api-sports.io/football/teams/85.png'
      },
      awayTeam: {
        id: 91,
        name: 'Monaco',
        code: 'MON',
        logo: 'https://media.api-sports.io/football/teams/91.png'
      },
      score: { home: null, away: null },
      venue: 'Parc des Princes, Paris'
    },

    // 8. Upcoming - UEFA Europa League
    {
      id: 7001,
      leagueId: 3,
      leagueName: 'UEFA Europa League',
      leagueLogo: 'https://media.api-sports.io/football/leagues/3.png',
      round: 'Round of 16',
      kickoff: todayIso(48),
      status: 'NS',
      statusText: 'Not Started',
      elapsed: null,
      homeTeam: {
        id: 33,
        name: 'Manchester United',
        code: 'MUN',
        logo: 'https://media.api-sports.io/football/teams/33.png'
      },
      awayTeam: {
        id: 489,
        name: 'AC Milan',
        code: 'ACM',
        logo: 'https://media.api-sports.io/football/teams/489.png'
      },
      score: { home: null, away: null },
      venue: 'Old Trafford, Manchester'
    },

    // 9. Upcoming - UEFA Conference League
    {
      id: 8001,
      leagueId: 848,
      leagueName: 'UEFA Conference League',
      leagueLogo: 'https://media.api-sports.io/football/leagues/848.png',
      round: 'Round of 16',
      kickoff: todayIso(50),
      status: 'NS',
      statusText: 'Not Started',
      elapsed: null,
      homeTeam: {
        id: 502,
        name: 'Fiorentina',
        code: 'FIO',
        logo: 'https://media.api-sports.io/football/teams/502.png'
      },
      awayTeam: {
        id: 546,
        name: 'Real Betis',
        code: 'BET',
        logo: 'https://media.api-sports.io/football/teams/546.png'
      },
      score: { home: null, away: null },
      venue: 'Stadio Artemio Franchi, Florence'
    }
  ];
}

export function getMockStandings(leagueId: number): StandingTeam[] {
  if (leagueId === 39) {
    return [
      { rank: 1, team: { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' }, points: 64, played: 28, win: 19, draw: 7, lose: 2, goalsDiff: 38, form: 'WWWDW' },
      { rank: 2, team: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' }, points: 62, played: 28, win: 19, draw: 5, lose: 4, goalsDiff: 41, form: 'WWWLW' },
      { rank: 3, team: { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' }, points: 59, played: 28, win: 18, draw: 5, lose: 5, goalsDiff: 34, form: 'WDWWL' },
      { rank: 4, team: { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' }, points: 51, played: 28, win: 15, draw: 6, lose: 7, goalsDiff: 18, form: 'DWWWL' }
    ];
  }
  if (leagueId === 140) {
    return [
      { rank: 1, team: { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' }, points: 63, played: 27, win: 20, draw: 3, lose: 4, goalsDiff: 42, form: 'WWWDW' },
      { rank: 2, team: { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' }, points: 60, played: 27, win: 18, draw: 6, lose: 3, goalsDiff: 35, form: 'WDWWW' },
      { rank: 3, team: { id: 530, name: 'Atletico Madrid', logo: 'https://media.api-sports.io/football/teams/530.png' }, points: 56, played: 27, win: 16, draw: 8, lose: 3, goalsDiff: 24, form: 'DWWWD' }
    ];
  }
  return [
    { rank: 1, team: { id: 541, name: 'Top Club', logo: 'https://media.api-sports.io/football/teams/541.png' }, points: 50, played: 22, win: 16, draw: 2, lose: 4, goalsDiff: 28, form: 'WWWWW' }
  ];
}

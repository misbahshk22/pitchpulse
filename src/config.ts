import dotenv from 'dotenv';
dotenv.config();

export interface LeagueMeta {
  id: number;
  name: string;
  code: string;
  espnCode: string;
  country: string;
  season: number;
  logo: string;
  badgeColor: string;
}

export const TRACKED_LEAGUES: Record<number, LeagueMeta> = {
  39: {
    id: 39,
    name: 'Premier League',
    code: 'PL',
    espnCode: 'eng.1',
    country: 'England',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/39.png',
    badgeColor: '#3d195b'
  },
  140: {
    id: 140,
    name: 'La Liga',
    code: 'PD',
    espnCode: 'esp.1',
    country: 'Spain',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/140.png',
    badgeColor: '#ee122b'
  },
  135: {
    id: 135,
    name: 'Serie A',
    code: 'SA',
    espnCode: 'ita.1',
    country: 'Italy',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/135.png',
    badgeColor: '#008fd7'
  },
  78: {
    id: 78,
    name: 'Bundesliga',
    code: 'BL1',
    espnCode: 'ger.1',
    country: 'Germany',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/78.png',
    badgeColor: '#d20515'
  },
  61: {
    id: 61,
    name: 'Ligue 1',
    code: 'FL1',
    espnCode: 'fra.1',
    country: 'France',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/61.png',
    badgeColor: '#091c3e'
  },
  2: {
    id: 2,
    name: 'UEFA Champions League',
    code: 'CL',
    espnCode: 'uefa.champions',
    country: 'World',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/2.png',
    badgeColor: '#0e1e5b'
  },
  3: {
    id: 3,
    name: 'UEFA Europa League',
    code: 'EL',
    espnCode: 'uefa.europa',
    country: 'World',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/3.png',
    badgeColor: '#f36c21'
  },
  848: {
    id: 848,
    name: 'UEFA Conference League',
    code: 'ECL',
    espnCode: 'uefa.europa.conf',
    country: 'World',
    season: 2025,
    logo: 'https://media.api-sports.io/football/leagues/848.png',
    badgeColor: '#08803b'
  }
};

export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiFootballKey: process.env.API_FOOTBALL_KEY || '',
  apiFootballHost: process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io',
  useEspnFreeLiveFeed: process.env.USE_ESPN_FREE !== 'false', // Default true: 100% free live data with zero keys!
  pollingIntervalLiveSec: parseInt(process.env.POLLING_INTERVAL_LIVE_SEC || '40', 10),
  pollingIntervalIdleMin: parseInt(process.env.POLLING_INTERVAL_IDLE_MIN || '180', 10),
  
  // Bot Configurations
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  
  // WhatsApp Cloud API Configuration
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'matchday_verify_secret',

  databasePath: process.env.DATABASE_PATH || './matchday.db'
};

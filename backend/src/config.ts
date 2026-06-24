import dotenv from 'dotenv';
import path from 'path';

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/viral-video-studio.db',
  logLevel: process.env.LOG_LEVEL || 'info',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
} as const;

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbConfig = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'zona_user',
  password: String(process.env.PGPASSWORD || 'ZonaDB2026'),
  database: process.env.PGDATABASE || 'zona',
  ssl: process.env.PGSSL === 'true'
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
    : false,
};

console.log('PostgreSQL config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  passwordType: typeof dbConfig.password,
  passwordLength: dbConfig.password.length,
});

export const pool = new Pool(dbConfig);

export async function query(text, params = []) {
  return pool.query(text, params);
}

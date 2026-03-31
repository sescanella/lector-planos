import { Pool } from 'pg';
import { env } from './config/env';
import { runMigrations } from './db/migrate';

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (!env.DATABASE_URL) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
    });

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err.message);
    });
  }

  return pool;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  const p = getPool();
  if (!p) return false;

  try {
    await p.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function initDatabase(): Promise<void> {
  if (!env.DATABASE_URL) {
    console.log('DATABASE_URL not set — database features disabled');
    return;
  }

  const connected = await checkDatabaseConnection();
  if (connected) {
    console.log('Database connected successfully');
    const p = getPool()!;
    await runMigrations(p);
  } else {
    console.log('Database connection failed — server will start in degraded mode');
  }
}

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export async function runMigrations(pool: Pool): Promise<void> {
  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _migrations WHERE name = $1',
      [file]
    );

    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);

    await pool.query(sql);
    await pool.query(
      'INSERT INTO _migrations (name) VALUES ($1)',
      [file]
    );

    console.log(`Migration applied: ${file}`);
  }
}

import { createClient } from '@libsql/client';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

export async function createStorage(postgresUrl?: string) {
  const schema = `fixture_${randomUUID().replaceAll('-', '')}`;
  const pool = postgresUrl ? new pg.Pool({ connectionString: postgresUrl, max: 2 }) : null;
  const sqlite = pool ? null : createClient({ url: ':memory:' });
  if (pool) await pool.query(`CREATE SCHEMA ${schema}`);
  async function query(sql: string, args: (string | number)[] = []): Promise<Record<string, any>[]> {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query(`SET search_path TO ${schema}`);
        let i = 0;
        return (
          await client.query(
            sql.replace(/\?/g, () => `$${++i}`),
            args,
          )
        ).rows;
      } finally {
        client.release();
      }
    }
    return (await sqlite!.execute({ sql, args })).rows as Record<string, any>[];
  }
  for (const sql of [
    'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
    'CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
    'CREATE TABLE memberships (user_id INTEGER NOT NULL, project_id INTEGER NOT NULL)',
    'CREATE TABLE issues (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL)',
    'CREATE TABLE comments (id INTEGER PRIMARY KEY, issue_id INTEGER NOT NULL, body TEXT NOT NULL)',
  ])
    await query(sql);
  await query("INSERT INTO users VALUES (1,'Ada'),(2,'Linus')");
  await query("INSERT INTO projects VALUES (1,'Platform'),(2,'Private roadmap')");
  await query('INSERT INTO memberships VALUES (1,1),(2,2)');
  for (let i = 1; i <= 80; i++) {
    await query('INSERT INTO issues VALUES (?,?,?)', [
      i,
      i <= 60 ? 1 : 2,
      `Issue ${String(i).padStart(3, '0')}`,
    ]);
    for (let j = 0; j < 4; j++)
      await query('INSERT INTO comments VALUES (?,?,?)', [i * 10 + j, i, `Comment ${j}`]);
  }
  return {
    query,
    engine: pool ? 'PostgreSQL' : 'SQLite in-memory',
    async close() {
      if (pool) {
        await pool.query(`DROP SCHEMA ${schema} CASCADE`);
        await pool.end();
      }
      sqlite?.close();
    },
  };
}

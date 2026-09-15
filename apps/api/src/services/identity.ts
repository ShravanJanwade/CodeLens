import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDb, authSessions, githubConnections, eq, and, sql } from '@codelens/db';

export const jwtSecret = process.env.JWT_SECRET ?? 'local-development-secret-change-me';
if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32)
  throw new Error('Set a strong JWT_SECRET.');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const fail = (message: string, status = 400) =>
  new HTTPException(status as any, { message: JSON.stringify({ error: { message } }) });
export function appOrigin() {
  return (process.env.APP_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
}
export function seal(value: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv(
      'aes-256-gcm',
      createHash('sha256')
        .update(process.env.TOKEN_ENCRYPTION_KEY ?? jwtSecret)
        .digest(),
      nonce,
    );
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function unseal(value: string) {
  const data = Buffer.from(value, 'base64'),
    decipher = createDecipheriv(
      'aes-256-gcm',
      createHash('sha256')
        .update(process.env.TOKEN_ENCRYPTION_KEY ?? jwtSecret)
        .digest(),
      data.subarray(0, 12),
    );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
export async function createSession(c: Context, userId: string) {
  await getDb()
    .delete(authSessions)
    .where(sql`${authSessions.expiresAt} <= ${Date.now()}`);
  const token = randomBytes(32).toString('base64url');
  await getDb()
    .insert(authSessions)
    .values({ tokenHash: hash(token), userId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  setCookie(c, 'codelens_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/api',
    maxAge: 8 * 60 * 60,
  });
}
export async function resolveIdentity(c: Context) {
  const bearer = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (bearer) {
    try {
      const value = await verify(bearer, jwtSecret, 'HS256');
      if (typeof value.sub !== 'string') throw Error();
      return value.sub;
    } catch {
      throw fail('Invalid or expired access token', 401);
    }
  }
  const token = getCookie(c, 'codelens_session');
  if (!token) return null;
  const session = (
    await getDb()
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.tokenHash, hash(token)), sql`${authSessions.expiresAt} > ${Date.now()}`))
  )[0];
  return session?.userId ?? null;
}
export async function endSession(c: Context) {
  const token = getCookie(c, 'codelens_session');
  if (token)
    await getDb()
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, hash(token)));
  deleteCookie(c, 'codelens_session', { path: '/api' });
}
export function requireUser(c: Context): string {
  const value = c.get('userId');
  if (!value) throw fail('Sign in to manage your workspace.', 401);
  return value;
}
export async function connection(userId?: string | null) {
  const row = userId
    ? (await getDb().select().from(githubConnections).where(eq(githubConnections.userId, userId)))[0]
    : undefined;
  return row?.token ? row : undefined;
}
export async function githubToken(userId?: string | null) {
  const row = await connection(userId);
  return row ? unseal(row.token) : undefined;
}
export function checkOrigin(c: Context) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return;
  const origin = c.req.header('origin');
  const allowed = [
    appOrigin(),
    new URL(c.req.url).origin,
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://127.0.0.1:3010'] : []),
  ];
  if (origin && !allowed.includes(origin)) throw fail('Request origin is not allowed.', 403);
  if (c.req.header('sec-fetch-site') === 'cross-site')
    throw fail('Cross-site mutations are not allowed.', 403);
}

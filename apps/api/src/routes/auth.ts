import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getDb, schema, eq, oauthStates, githubConnections, sql } from '@codelens/db';
import {
  appOrigin,
  createSession,
  endSession,
  connection,
  requireUser,
  hash,
  seal,
  fail,
} from '../services/identity';
import { github } from '../services/github-client';

export const authRoutes = new Hono();
const db = getDb(),
  now = () => new Date().toISOString();
const oauthReady = () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
const callbackUrl = () => `${appOrigin()}/api/v1/auth/github/callback`;
const windows = new Map<string, { count: number; until: number }>();
authRoutes.use('/auth/*', async (c, next) => {
  if (c.req.method === 'POST') {
    const key = c.req.header('x-real-ip') ?? 'local',
      t = Date.now();
    const entry = windows.get(key);
    const value = entry && entry.until > t ? entry : { count: 0, until: t + 60000 };
    if (++value.count > 20) throw fail('Too many sign-in attempts. Try again in one minute.', 429);
    windows.set(key, value);
    if (windows.size > 10000) for (const [k, v] of windows) if (v.until < t) windows.delete(k);
  }
  await next();
});
authRoutes.get('/auth/status', async (c) => {
  const userId = c.get('userId' as never) as string | undefined;
  const user = userId ? (await db.select().from(schema.users).where(eq(schema.users.id, userId)))[0] : null;
  const linked = await connection(userId);
  return c.json({
    data: {
      user: user ? { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl } : null,
      github: linked ? { login: linked.login, scopes: linked.scopes, connectedAt: linked.updatedAt } : null,
      githubOAuthAvailable: oauthReady(),
      callbackUrl: callbackUrl(),
    },
  });
});
authRoutes.post('/auth/register', async (c) => {
  const body = await c.req.json();
  const email = String(body.email ?? '')
      .trim()
      .toLowerCase(),
    name = String(body.name ?? '').trim(),
    password = body.password;
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    !name ||
    name.length > 100 ||
    typeof password !== 'string' ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  )
    throw fail('Use your name, a valid email, and a password of 12–72 bytes.');
  if ((await db.select().from(schema.users).where(eq(schema.users.email, email))).length)
    throw fail('An account with that email already exists. Sign in instead.', 409);
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'user' as const,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(schema.users).values(user);
  await createSession(c, user.id);
  return c.json({ data: { user: { id: user.id, name, email } } }, 201);
});
authRoutes.post('/auth/login', async (c) => {
  const body = await c.req.json();
  const email = String(body.email ?? '')
      .trim()
      .toLowerCase(),
    password = body.password;
  if (typeof password !== 'string' || Buffer.byteLength(password) > 72)
    throw fail('Invalid email or password', 401);
  const user = (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0];
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    throw fail('Invalid email or password', 401);
  await createSession(c, user.id);
  return c.json({ data: { user: { id: user.id, email: user.email, name: user.name } } });
});
authRoutes.post('/auth/logout', async (c) => {
  await endSession(c);
  return c.json({ data: { signedOut: true } });
});
authRoutes.get('/auth/me', async (c) => {
  const id = requireUser(c),
    user = (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0];
  if (!user) throw fail('Account not found', 404);
  return c.json({ data: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl } });
});
authRoutes.get('/auth/github/start', async (c) => {
  if (!oauthReady()) return c.redirect(`${appOrigin()}/login?error=github_setup`);
  const purpose = c.req.query('purpose') === 'connect' ? 'connect' : 'login';
  const userId = purpose === 'connect' ? requireUser(c) : null;
  const state = randomBytes(32).toString('base64url'),
    verifier = randomBytes(32).toString('base64url');
  await db.delete(oauthStates).where(sql`${oauthStates.expiresAt} < ${Date.now()}`);
  await db
    .insert(oauthStates)
    .values({ stateHash: hash(state), verifier, purpose, userId, expiresAt: Date.now() + 600000 });
  setCookie(c, 'codelens_oauth', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/api',
    maxAge: 600,
  });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: callbackUrl(),
    scope:
      purpose === 'connect' ? 'read:user user:email repo workflow security_events' : 'read:user user:email',
    state,
    code_challenge: Buffer.from(hash(verifier), 'hex').toString('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  return c.redirect(url.toString());
});
authRoutes.get('/auth/github/callback', async (c) => {
  const state = c.req.query('state'),
    saved = getCookie(c, 'codelens_oauth');
  deleteCookie(c, 'codelens_oauth', { path: '/api' });
  if (!state || !saved || hash(state) !== hash(saved))
    return c.redirect(`${appOrigin()}/login?error=oauth_state`);
  const row = (
    await db
      .delete(oauthStates)
      .where(eq(oauthStates.stateHash, hash(state)))
      .returning()
  )[0];
  if (!row || row.expiresAt < Date.now() || !c.req.query('code'))
    return c.redirect(`${appOrigin()}/login?error=oauth_expired`);
  if (row.userId && row.userId !== c.get('userId' as never))
    return c.redirect(`${appOrigin()}/login?error=oauth_state`);
  try {
    const exchange = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: c.req.query('code'),
        redirect_uri: callbackUrl(),
        code_verifier: row.verifier,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const token = (await exchange.json()) as any;
    if (!exchange.ok || !token.access_token) throw Error('OAuth exchange failed');
    const profile = await github('/user', null, undefined, token.access_token);
    const emails = await github('/user/emails', null, undefined, token.access_token);
    const email =
      emails.find((e: any) => e.primary && e.verified)?.email ?? emails.find((e: any) => e.verified)?.email;
    if (!email) throw Error('Verified email required');
    const existing = (
      await db
        .select()
        .from(githubConnections)
        .where(eq(githubConnections.githubId, String(profile.id)))
    )[0];
    if (row.userId && existing && existing.userId !== row.userId)
      return c.redirect(`${appOrigin()}/account?error=github_in_use`);
    let userId = row.userId ?? existing?.userId;
    if (!userId) {
      if ((await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()))).length)
        return c.redirect(`${appOrigin()}/login?error=link_existing`);
      userId = crypto.randomUUID();
      await db.insert(schema.users).values({
        id: userId,
        email: email.toLowerCase(),
        name: profile.name ?? profile.login,
        passwordHash: '',
        avatarUrl: profile.avatar_url,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    // A basic sign-in must never replace a previously granted repository token with a narrower one.
    const linked = await connection(userId);
    if (row.purpose === 'connect' || !linked)
      await db
        .insert(githubConnections)
        .values({
          userId,
          githubId: String(profile.id),
          login: profile.login,
          token: seal(token.access_token),
          scopes: token.scope ?? '',
          updatedAt: now(),
        })
        .onConflictDoUpdate({
          target: githubConnections.userId,
          set: {
            githubId: String(profile.id),
            login: profile.login,
            token: seal(token.access_token),
            scopes: token.scope ?? '',
            updatedAt: now(),
          },
        });
    await createSession(c, userId);
    return c.redirect(
      `${appOrigin()}${row.purpose === 'connect' ? '/account?connected=true' : '/repositories'}`,
    );
  } catch {
    return c.redirect(`${appOrigin()}/login?error=github_failed`);
  }
});
authRoutes.delete('/integrations/github', async (c) => {
  // Retain the stable GitHub identity so OAuth-only accounts can still sign in after disconnecting repository access.
  await db
    .update(githubConnections)
    .set({ token: '', scopes: '', updatedAt: now() })
    .where(eq(githubConnections.userId, requireUser(c)));
  return c.json({ data: { disconnected: true } });
});
authRoutes.get('/integrations/github/repositories', async (c) => {
  const userId = requireUser(c);
  if (!(await connection(userId))) throw fail('Connect GitHub in Account first.', 409);
  const page = Math.max(1, Math.min(100, Number(c.req.query('page')) || 1));
  const repos = await github(
    `/user/repos?per_page=50&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
    userId,
  );
  return c.json({
    data: repos.map((r: any) => ({
      fullName: r.full_name,
      name: r.name,
      description: r.description,
      private: r.private,
      defaultBranch: r.default_branch,
      language: r.language,
    })),
    hasMore: repos.length === 50,
    page,
  });
});

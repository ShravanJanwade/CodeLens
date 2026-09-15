import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateConfig(env = process.env) {
  const errors = [];
  for (const key of ['JWT_SECRET', 'TOKEN_ENCRYPTION_KEY']) {
    if (!env[key] || env[key].length < 32 || /replace|change.me|your.secret/i.test(env[key]))
      errors.push(`${key}: use a unique, randomly generated value of at least 32 characters.`);
  }
  try {
    const url = new URL(env.APP_ORIGIN);
    if (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN || url.username || url.password)
      throw new Error();
    if (env.CORS_ORIGIN && env.CORS_ORIGIN !== url.origin)
      errors.push('CORS_ORIGIN must equal APP_ORIGIN for this single-origin deployment.');
  } catch {
    errors.push('APP_ORIGIN: use the public HTTPS origin without a trailing slash or path.');
  }
  if (!env.DATABASE_URL || !isAbsolute(env.DATABASE_URL))
    errors.push('DATABASE_URL: use an absolute SQLite file path on persistent storage.');
  if (
    !Number.isInteger(Number(env.PORT ?? 4000)) ||
    Number(env.PORT ?? 4000) < 1 ||
    Number(env.PORT ?? 4000) > 65535
  )
    errors.push('PORT must be an integer from 1 to 65535.');
  if (!!env.GITHUB_CLIENT_ID !== !!env.GITHUB_CLIENT_SECRET)
    errors.push('Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or leave both unset.');
  if (!['demo', 'gemini', 'ollama'].includes(env.AI_PROVIDER ?? 'demo'))
    errors.push('AI_PROVIDER must be demo, gemini, or ollama.');
  if (env.AI_PROVIDER === 'gemini' && (!env.GEMINI_API_KEY || !env.GEMINI_MODEL))
    errors.push('Gemini requires GEMINI_API_KEY and GEMINI_MODEL.');
  if (env.PUBLIC_DEMO === 'true')
    errors.push('PUBLIC_DEMO disables account mutations. Leave it false for the full workspace.');
  if (errors.length)
    throw new Error(`Production configuration is incomplete:\n${errors.map((e) => `- ${e}`).join('\n')}`);
  if (!env.GITHUB_CLIENT_ID)
    console.warn(
      'GitHub OAuth is disabled until its client ID and secret are configured. Email login remains available.',
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateConfig();
    console.log('Production configuration passed. Secret values were not printed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

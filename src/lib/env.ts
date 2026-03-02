/**
 * Validates that all required environment variables are present.
 * Called once at startup to fail fast if misconfigured.
 */

const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];
  for (const key of REQUIRED_VARS) {
    if (!import.meta.env[key]) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}. ` +
      `Check your .env file or deployment configuration.`
    );
  }
}

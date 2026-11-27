// Required server configuration. Checked once at server start in production
// (instrumentation.ts) so a misconfigured deploy fails loudly instead of
// erroring on the first request that happens to need a value.

const MIN_SECRET_LENGTH = 32;

export function missingProductionEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  if (!env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set (use the pooled Neon connection string).");
  }
  const secret = env.IDENTITY_SECRET ?? "";
  if (!secret) {
    problems.push("IDENTITY_SECRET is not set.");
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(`IDENTITY_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return problems;
}

/** Settings that work but are slow or risky in production: logged, not fatal. */
export function productionEnvWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  try {
    const host = new URL(env.DATABASE_URL ?? "").hostname;
    if (host.endsWith(".neon.tech") && !host.includes("-pooler")) {
      warnings.push(
        "DATABASE_URL is Neon's direct connection. Use the pooled one (host with \"-pooler\") for serverless; keep the direct one in DIRECT_URL.",
      );
    }
  } catch {
    // Missing/malformed URL is reported by assertProductionEnv.
  }
  return warnings;
}

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  for (const w of productionEnvWarnings()) console.warn(`[aratalk] ${w}`);
  const problems = missingProductionEnv();
  if (problems.length > 0) {
    throw new Error(
      `AraTalk is missing required environment variables:\n  - ${problems.join("\n  - ")}\n` +
        "Set them in your hosting provider (e.g. Vercel → Settings → Environment Variables) and redeploy.",
    );
  }
}

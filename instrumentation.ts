export async function register() {
  // Skip during `next build`; the check is for the running server.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionEnv } = await import("./lib/env");
  assertProductionEnv();
}

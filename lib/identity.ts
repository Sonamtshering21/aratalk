import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { nicknameFromHash } from "./nickname";

const COOKIE_NAME = "aratalk_id";
const ONE_YEAR = 60 * 60 * 24 * 365;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const value = process.env.IDENTITY_SECRET;
  if (!value || value.length < 16) {
    throw new Error("IDENTITY_SECRET must be set in .env (16+ characters).");
  }
  return value;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export type Identity = { hash: string; nickname: string };

/**
 * Read the viewer's identity hash without creating one.
 * Safe to call from Server Components. Returns null for first-time visitors.
 */
export async function readIdentityHash(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value || !UUID_RE.test(value)) return null;
  return sha256(value + secret());
}

/**
 * Get the viewer's identity, creating the cookie on first write.
 * Only call from Server Actions or Route Handlers (it may set a cookie).
 * The UUID and hash stay on the server; never return them to the client.
 */
export async function getOrCreateIdentity(): Promise<Identity> {
  const store = await cookies();
  let value = store.get(COOKIE_NAME)?.value;

  if (!value || !UUID_RE.test(value)) {
    value = randomUUID();
    store.set(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR,
    });
  }

  const hash = sha256(value + secret());
  return { hash, nickname: nicknameFromHash(hash) };
}

/** Hashed client IP, used only as a rate-limit key. */
export async function hashedIp(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return sha256(`ip:${ip}:${secret()}`);
}

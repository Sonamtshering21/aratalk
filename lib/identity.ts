import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { IDENTITY_COOKIE, isValidIdentityValue } from "./identity-cookie";
import { nicknameFromHash } from "./nickname";

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
  const value = (await cookies()).get(IDENTITY_COOKIE)?.value;
  if (!isValidIdentityValue(value)) return null;
  return sha256(value + secret());
}

/**
 * The viewer's identity for a write, or null when the request has no valid
 * anonymous browser cookie. The cookie is issued when a page is loaded
 * (proxy.ts); writes never create one, so cookie-less scripts are ignored.
 * The UUID and hash stay on the server; never return them to the client.
 */
export async function requireIdentity(): Promise<Identity | null> {
  const hash = await readIdentityHash();
  return hash ? { hash, nickname: nicknameFromHash(hash) } : null;
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

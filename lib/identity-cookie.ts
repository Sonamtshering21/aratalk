// The anonymous browser id cookie. No next/headers here, so Proxy can use it.
import { randomUUID } from "node:crypto";

export const IDENTITY_COOKIE = "aratalk_id";
const ONE_YEAR = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidIdentityValue(value: string | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

export function newIdentityCookie() {
  return {
    name: IDENTITY_COOKIE,
    value: randomUUID(),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  };
}

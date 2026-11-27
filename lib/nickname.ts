// Kept dependency-free so the seed script can import it directly.

export const NICKNAMES = [
  "Yak",
  "Dragon",
  "Panda",
  "Potato",
  "Tiger",
  "Takin",
  "Momo",
  "Ema Datshi",
  "Red Panda",
  "Snow Leopard",
  "Hornbill",
  "Raven",
  "Blue Poppy",
  "Butter Tea",
  "Red Rice",
  "Kewa Datshi",
  "Juniper",
  "Black-necked Crane",
  "Zaow",
  "Doma",
] as const;

/** Derive a stable, friendly nickname from a hex identity hash. */
export function nicknameFromHash(hash: string): string {
  const n = parseInt(hash.slice(0, 8), 16);
  const index = Number.isNaN(n) ? 0 : n % NICKNAMES.length;
  return `Anonymous ${NICKNAMES[index]}`;
}

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 999 → "999", 1234 → "1.2K", 3_400_000 → "3.4M". Same output on server and client. */
export function formatCount(n: number): string {
  return compact.format(Math.max(0, n));
}

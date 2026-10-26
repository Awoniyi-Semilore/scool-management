/**
 * MONEY CONVENTION
 * ----------------
 * All amounts are stored and calculated as INTEGER KOBO.
 * 1 naira = 100 kobo. Example: ₦50,000 = 5_000_000 kobo.
 * Floating-point numbers are never used for stored or calculated money.
 * Naira is only produced for display, via formatNaira().
 */

export type Kobo = number;

export const KOBO_PER_NAIRA = 100;

/** Parse a typed naira string such as "50,000" or "1500.5" into kobo. Returns null if invalid. */
export function parseNairaToKobo(input: string): Kobo | null {
  const cleaned = input.replace(/[₦,\s]/g, '').trim();
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const kobo = Number(whole) * KOBO_PER_NAIRA + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(kobo)) return null;
  return kobo;
}

/** Format integer kobo as a naira display string, e.g. 4500000 -> "₦45,000.00". */
export function formatNaira(kobo: Kobo): string {
  const negative = kobo < 0;
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / KOBO_PER_NAIRA);
  const k = abs % KOBO_PER_NAIRA;
  return `${negative ? '-' : ''}₦${naira.toLocaleString('en-NG')}.${String(k).padStart(2, '0')}`;
}

export function sumKobo(values: Kobo[]): Kobo {
  return values.reduce((a, b) => a + b, 0);
}

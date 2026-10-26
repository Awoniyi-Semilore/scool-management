/**
 * Writes an amount in words for receipts, e.g. 30000 kobo-free naira -> "Thirty thousand naira only".
 * Pure function, no dependencies.
 */
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion'];

function underThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) {
    if (h) parts.push('and');
    if (r < 20) parts.push(ONES[r]);
    else parts.push(`${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ''}`);
  }
  return parts.join(' ');
}

/** Whole-number words, lower case. 0 -> "zero". */
export function numberToWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Amount must be a whole number of zero or more.');
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let rest = n;
  let scale = 0;
  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk) parts.unshift(`${underThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
    rest = Math.floor(rest / 1000);
    scale++;
  }
  return parts.join(' ');
}

/** Receipt wording from an amount in kobo: "Thirty thousand naira only" or "... naira and fifty kobo only". */
export function nairaInWordsFromKobo(kobo: number): string {
  if (!Number.isSafeInteger(kobo) || kobo < 0) throw new Error('Amount must be zero or more.');
  const naira = Math.floor(kobo / 100);
  const k = kobo % 100;
  const base = numberToWords(naira);
  const text = `${base.charAt(0).toUpperCase()}${base.slice(1)} naira`;
  return k ? `${text} and ${numberToWords(k)} kobo only` : `${text} only`;
}

/**
 * Class levels the school uses. A class is a level plus an optional arm.
 * Examples: "JSS2" (no arm), "SS2 Science", "SS2 Commercial", "Primary 3 Gold", "Primary 3 A".
 */
export const LEVELS = [
  'Creche', 'Nursery 1', 'Nursery 2',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JSS 1', 'JSS 2', 'JSS 3',
  'SS 1', 'SS 2', 'SS 3',
] as const;

/** Class name from a level and an optional arm. An empty arm gives just the level. */
export function className(level: string, arm?: string | null): string {
  const a = (arm ?? '').trim().replace(/\s+/g, ' ');
  return a ? `${level} ${a}` : level;
}

/** Trims, drops empty entries, removes duplicates ignoring capitals. */
export function cleanSubjects(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim().replace(/\s+/g, ' ');
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

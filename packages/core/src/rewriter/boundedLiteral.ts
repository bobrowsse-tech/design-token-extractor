/** True when `needle` at `index` is not a slice of a longer identifier (`2px` in `12px`). */
export function isBoundedLiteral(text: string, index: number, needle: string): boolean {
  if (index < 0 || needle.length === 0) return false;
  const before = index === 0 ? '' : text[index - 1];
  const after = text[index + needle.length] ?? '';
  if (/[A-Za-z0-9_]/.test(before)) return false;
  if (/[A-Za-z0-9_]/.test(after)) return false;
  return true;
}

export function countBoundedLiterals(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    if (isBoundedLiteral(haystack, index, needle)) count += 1;
    from = index + needle.length;
  }
  return count;
}

export function indexOfBoundedLiteral(haystack: string, needle: string, from = 0): number {
  if (!needle) return -1;
  let start = from;
  while (start <= haystack.length) {
    const index = haystack.indexOf(needle, start);
    if (index === -1) return -1;
    if (isBoundedLiteral(haystack, index, needle)) return index;
    start = index + needle.length;
  }
  return -1;
}

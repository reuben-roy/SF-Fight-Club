/**
 * FE-5. Never return more than `cap` words. If a sentence ends inside that
 * window, cut back to the last sentence boundary. Otherwise cut on the word.
 */
export function truncateAtCap(text: string, cap: number): { text: string; truncated: boolean } {
  const tokens = wordTokens(text);
  if (tokens.length <= cap) return { text: tokens.join(" "), truncated: false };
  if (cap <= 0) return { text: "", truncated: true };
  const limited = tokens.slice(0, cap).join(" ");
  let end = -1;
  for (const match of limited.matchAll(/[.!?](?=\s|$)/g)) {
    if (match.index !== undefined) end = match.index + 1;
  }
  if (end > 0) return { text: limited.slice(0, end).trim(), truncated: true };
  return { text: limited, truncated: true };
}

export function wordCount(text: string): number {
  return wordTokens(text).length;
}

export function wordTokens(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

/** Hard character cut. Evidence snippets never store a full page. */
export function clipChars(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

/**
 * Normalize showcase card text so all cards look consistent regardless of
 * how title/description were entered (ALL CAPS, sentence case, etc.).
 */

/** Title case: first letter of each word uppercase, rest lowercase. */
export function formatShowcaseTitle(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/** Sentence case: first letter of first word uppercase, rest lowercase. */
export function formatShowcaseDescription(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

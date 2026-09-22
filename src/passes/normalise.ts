/**
 * One way to spell a place name for matching, shared by the data script and the search box.
 *
 * Shared because they must agree to the character: the script files "Saint-Étienne" under the key
 * the search box computes from whatever was typed. NFD strips the accents; a handful of letters
 * are not composed of a base and an accent and need saying explicitly.
 */
const LETTERS: Record<string, string> = { ł: 'l', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', đ: 'd', ð: 'd', þ: 'th', ı: 'i' }

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łøßæœđðþı]/g, (c) => LETTERS[c])
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function packetKey(text: string): string {
  const first = normalise(text)[0]
  return first && first >= 'a' && first <= 'z' ? first : '_'
}

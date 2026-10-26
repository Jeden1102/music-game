export const PLAYER_NAME_MIN_LENGTH = 2
export const PLAYER_NAME_MAX_LENGTH = 20

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function isValidPlayerName(value: string): boolean {
  const normalized = normalizePlayerName(value)
  return normalized.length >= PLAYER_NAME_MIN_LENGTH
    && normalized.length <= PLAYER_NAME_MAX_LENGTH
}

export function getPlayerInitials(name: string): string {
  const parts = normalizePlayerName(name).split(' ').filter(Boolean)

  if (parts.length === 0) {
    return '?'
  }

  return parts
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
}

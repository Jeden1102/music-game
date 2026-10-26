import { normalizeRoomCode } from '#shared/utils/room'

export function extractRoomCode(value: string): string {
  try {
    const url = new URL(value)
    const code = url.searchParams.get('code')

    if (code) {
      return normalizeRoomCode(code)
    }
  } catch {
    // The scanned value is not a URL.
  }

  const match = value.match(/\d{3,4}/)
  return match ? normalizeRoomCode(match[0]) : ''
}

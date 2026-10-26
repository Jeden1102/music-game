import type { RoomMembership } from '#shared/types/room'
import type { PlayerSession } from '~/types/player'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export function usePlayerSession() {
  const session = useCookie<PlayerSession | null>('musicline_session', {
    default: () => null,
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax'
  })

  const lastName = useCookie<string>('musicline_name', {
    default: () => '',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax'
  })

  function rememberName(name: string) {
    lastName.value = name
  }

  function saveMembership(membership: RoomMembership, isHost: boolean, name: string) {
    session.value = {
      name,
      playerId: membership.playerId,
      roomCode: membership.room.code,
      isHost
    }
    rememberName(name)
  }

  function clearSession() {
    session.value = null
  }

  return {
    session,
    lastName,
    rememberName,
    saveMembership,
    clearSession
  }
}

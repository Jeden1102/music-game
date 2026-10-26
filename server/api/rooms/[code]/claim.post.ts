import { claimRoundSong } from '../../../utils/room-store'
import { broadcastRoom } from '../../../utils/room-socket'
import { throwRoomActionError } from '../../../utils/room-action-error'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const result = await claimRoundSong(code, playerId)

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  await broadcastRoom(code)
  return result.room
})

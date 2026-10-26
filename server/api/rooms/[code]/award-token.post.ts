import { awardRoundToken } from '../../../utils/room-store'
import { broadcastRoom } from '../../../utils/room-socket'
import { throwRoomActionError } from '../../../utils/room-action-error'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string, targetPlayerId?: string } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const targetPlayerId = typeof body?.targetPlayerId === 'string' ? body.targetPlayerId : ''
  const result = await awardRoundToken(code, playerId, targetPlayerId)

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  await broadcastRoom(code)
  return result.room
})

import { leaveRoom } from '../../../utils/room-store'
import { broadcastRoom } from '../../../utils/room-socket'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''

  if (!playerId || !await leaveRoom(code, playerId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'PLAYER_NOT_FOUND',
      message: 'The player is not part of this room.'
    })
  }

  await broadcastRoom(code)
  return { ok: true }
})

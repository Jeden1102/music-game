import { leaveRoom } from '../../../utils/room-store'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''

  if (!playerId || !leaveRoom(code, playerId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'PLAYER_NOT_FOUND',
      message: 'The player is not part of this room.'
    })
  }

  return { ok: true }
})

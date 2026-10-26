import { getRoom } from '../../utils/room-store'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const playerId = getQuery(event).playerId
  const room = await getRoom(code, typeof playerId === 'string' ? playerId : null)

  if (!room) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ROOM_NOT_FOUND',
      message: 'The room does not exist or has expired.'
    })
  }

  return room
})

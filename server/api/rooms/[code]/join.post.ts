import type { JoinRoomInput } from '#shared/types/room'
import { isValidPlayerName, normalizePlayerName } from '#shared/utils/player'
import { joinRoom } from '../../../utils/room-store'
import { broadcastRoom } from '../../../utils/room-socket'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<Partial<JoinRoomInput> | null>(event)
  const name = normalizePlayerName(typeof body?.name === 'string' ? body.name : '')

  if (!isValidPlayerName(name)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'INVALID_NAME',
      message: 'The nickname must be between 2 and 20 characters.'
    })
  }

  const result = await joinRoom(code, name)

  if (!result.ok) {
    throw createError({
      statusCode: result.reason === 'ROOM_NOT_FOUND' ? 404 : 409,
      statusMessage: result.reason,
      message: result.reason === 'ROOM_NOT_FOUND'
        ? 'The room does not exist or has expired.'
        : 'The room is full.'
    })
  }

  await broadcastRoom(code)
  return result.membership
})

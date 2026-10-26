import { placeRoundCard } from '../../../utils/room-store'
import { throwRoomActionError } from '../../../utils/room-action-error'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string, position?: number } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const position = typeof body?.position === 'number' ? body.position : Number.NaN
  const result = placeRoundCard(code, playerId, position)

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  return result.room
})

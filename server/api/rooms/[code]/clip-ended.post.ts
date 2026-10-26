import { markClipEnded } from '../../../utils/room-store'
import { throwRoomActionError } from '../../../utils/room-action-error'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const result = markClipEnded(code, playerId)

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  return result.room
})

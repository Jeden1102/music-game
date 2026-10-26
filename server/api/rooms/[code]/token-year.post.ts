import { submitTokenYear } from '../../../utils/room-store'
import { throwRoomActionError } from '../../../utils/room-action-error'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string, year?: number } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const year = typeof body?.year === 'number' ? body.year : Number.NaN
  const result = submitTokenYear(code, playerId, year)

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  return result.room
})

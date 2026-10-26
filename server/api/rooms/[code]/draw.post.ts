import { drawRound, getRoom, getUsedSongIdsForHost } from '../../../utils/room-store'
import { findPlayableSong, toRoundSong } from '../../../utils/game-songs'
import { throwRoomActionError } from '../../../utils/room-action-error'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const room = getRoom(code)

  if (!room) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ROOM_NOT_FOUND',
      message: 'The room does not exist or has expired.'
    })
  }

  const usedSongIds = getUsedSongIdsForHost(code, playerId)

  if (!usedSongIds) {
    throwRoomActionError('NOT_HOST')
  }

  if (room.status === 'finished') {
    throwRoomActionError('GAME_FINISHED')
  }

  if (room.status !== 'playing') {
    throwRoomActionError('INVALID_STATE')
  }

  if (room.activeRound) {
    throwRoomActionError('ROUND_ACTIVE')
  }

  const song = await findPlayableSong(room.settings.categoryId, usedSongIds)

  if (!song) {
    throwRoomActionError('NO_SONG')
  }

  const result = drawRound(code, playerId, [toRoundSong(song)])

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  return result.room
})

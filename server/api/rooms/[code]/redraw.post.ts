import { getRoom, getUsedSongIdsForHost, redrawRound } from '../../../utils/room-store'
import { findPlayableSong, toRoundSong } from '../../../utils/game-songs'
import {
  invalidateSongYouTubeVideo,
  shouldInvalidateYouTubeVideo
} from '../../../utils/youtube-resolver'
import { throwRoomActionError } from '../../../utils/room-action-error'

interface RedrawBody {
  playerId?: string
  failedYoutubeId?: string
  errorCode?: number
}

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<RedrawBody | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const room = getRoom(code, playerId)

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

  const failedYoutubeId = typeof body?.failedYoutubeId === 'string'
    ? body.failedYoutubeId
    : ''
  const errorCode = typeof body?.errorCode === 'number' ? body.errorCode : 0
  const round = room.activeRound

  if (
    !round
    || !round.song
    || round.phase !== 'listening'
    || round.clipEndedAt
    || round.claims.length > 0
    || round.placement
  ) {
    throwRoomActionError('INVALID_STATE')
  }

  if (
    failedYoutubeId
    && failedYoutubeId === round.song.youtubeId
    && shouldInvalidateYouTubeVideo(errorCode)
  ) {
    await invalidateSongYouTubeVideo(round.song.id, failedYoutubeId)
  }

  const song = await findPlayableSong(room.settings.categoryId, usedSongIds)

  if (!song) {
    throwRoomActionError('NO_SONG')
  }

  const result = redrawRound(code, playerId, [toRoundSong(song)])

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  return result.room
})

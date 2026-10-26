import { getRoom, startRoom } from '../../../utils/room-store'
import { broadcastRoom } from '../../../utils/room-socket'
import { listSongs, shuffle, toTimelineCard } from '../../../utils/game-songs'
import { throwRoomActionError } from '../../../utils/room-action-error'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await readBody<{ playerId?: string } | null>(event)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const room = await getRoom(code)

  if (!room) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ROOM_NOT_FOUND',
      message: 'The room does not exist or has expired.'
    })
  }

  const songs = await listSongs(room.settings.categoryId)

  if (songs.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'NO_SONGS',
      message: 'There are no songs available for this room.'
    })
  }

  const shuffledSongs = shuffle(songs)
  const startingCards = room.players.map((_, index) => {
    return toTimelineCard(shuffledSongs[index % shuffledSongs.length]!)
  })
  const result = await startRoom(code, playerId, startingCards)

  if (!result.ok) {
    throwRoomActionError(result.reason)
  }

  await broadcastRoom(code)
  return result.room
})

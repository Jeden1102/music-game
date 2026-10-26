import prisma from '../../../lib/prisma'
import { findPlayableSong } from '../../utils/game-songs'

export default defineEventHandler(async (event) => {
  const categoryIdValue = Number(getQuery(event).categoryId ?? 0)
  const categoryId = Number.isInteger(categoryIdValue) && categoryIdValue > 0
    ? categoryIdValue
    : null
  const song = await findPlayableSong(categoryId)

  if (!song) {
    throw createError({
      statusCode: 404,
      statusMessage: 'NO_SONGS',
      message: 'No playable songs are available.'
    })
  }

  return prisma.song.update({
    where: { id: song.id },
    data: { lastPlayed: new Date() },
    include: { category: true }
  })
})

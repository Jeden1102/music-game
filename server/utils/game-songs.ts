import type { Category, Song } from '@prisma/client'
import type { RoomCategory, RoundSong, TimelineCard } from '#shared/types/room'
import prisma from '../../lib/prisma'
import { pickPlayableSong } from './youtube-resolver'

type SongWithCategory = Song & { category: Category }

export type PlayableSongWithCategory = SongWithCategory & { youtubeId: string }

export async function listCategories(): Promise<RoomCategory[]> {
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { songs: true } }
    },
    orderBy: { name: 'asc' }
  })

  return categories.map(category => ({
    id: category.id,
    name: category.name,
    songCount: category._count.songs
  }))
}

export async function findCategory(categoryId: number): Promise<RoomCategory | null> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      name: true,
      _count: { select: { songs: true } }
    }
  })

  if (!category) {
    return null
  }

  return {
    id: category.id,
    name: category.name,
    songCount: category._count.songs
  }
}

export async function listSongs(categoryId: number | null): Promise<SongWithCategory[]> {
  return prisma.song.findMany({
    where: categoryId ? { categoryId } : undefined,
    include: { category: true },
    orderBy: { id: 'asc' }
  })
}

/**
 * Resolves at most a handful of unknown YouTube IDs per draw. Songs with a
 * recently verified ID are returned immediately, so the Data API is only used
 * for new or broken records.
 */
export async function findPlayableSong(
  categoryId: number | null,
  excludedIds: ReadonlySet<number> = new Set()
): Promise<PlayableSongWithCategory | null> {
  return pickPlayableSong(await listSongs(categoryId), excludedIds)
}

export function toRoundSong(song: PlayableSongWithCategory): RoundSong {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    releaseYear: song.releaseYear,
    youtubeId: song.youtubeId,
    startTime: song.startTime,
    categoryName: song.category.name
  }
}

export function toTimelineCard(
  song: SongWithCategory,
  addedAt = new Date().toISOString()
): TimelineCard {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    releaseYear: song.releaseYear,
    categoryName: song.category.name,
    addedAt
  }
}

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]!
    shuffled[index] = shuffled[randomIndex]!
    shuffled[randomIndex] = current
  }

  return shuffled
}

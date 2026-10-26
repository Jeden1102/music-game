import type { SongImportItem, SongImportResult } from '#shared/types/song-import'
import prisma from '../../lib/prisma'

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const MIN_RELEASE_YEAR = 1900
const MAX_CLIP_START_SECONDS = 3600

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidImport(message: string) {
  return createError({
    statusCode: 422,
    statusMessage: 'INVALID_IMPORT',
    message
  })
}

function readString(value: unknown, field: string, index: number, maxLength: number): string {
  if (typeof value !== 'string') {
    throw invalidImport(`Song #${index + 1}: "${field}" must be a string.`)
  }

  const normalized = value.trim()

  if (!normalized) {
    throw invalidImport(`Song #${index + 1}: "${field}" cannot be empty.`)
  }

  if (normalized.length > maxLength) {
    throw invalidImport(`Song #${index + 1}: "${field}" must be at most ${maxLength} characters.`)
  }

  return normalized
}

function readInteger(
  value: unknown,
  field: string,
  index: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw invalidImport(
      `Song #${index + 1}: "${field}" must be an integer between ${min} and ${max}.`
    )
  }

  return value
}

function readOptionalYoutubeId(value: unknown, index: number): string | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw invalidImport(`Song #${index + 1}: "youtubeId" must be a string, null or omitted.`)
  }

  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  if (!YOUTUBE_ID_PATTERN.test(normalized)) {
    throw invalidImport(`Song #${index + 1}: "youtubeId" must be a valid 11-character YouTube ID.`)
  }

  return normalized
}

export function parseSongImport(input: unknown): SongImportItem[] {
  const rawSongs = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.songs)
      ? input.songs
      : null

  if (!rawSongs || rawSongs.length === 0) {
    throw invalidImport('Provide a non-empty "songs" array.')
  }

  const maximumReleaseYear = new Date().getFullYear()
  const songs = rawSongs.map((rawSong, index): SongImportItem => {
    if (!isRecord(rawSong)) {
      throw invalidImport(`Song #${index + 1}: each item must be an object.`)
    }

    return {
      title: readString(rawSong.title, 'title', index, 200),
      artist: readString(rawSong.artist, 'artist', index, 200),
      releaseYear: readInteger(
        rawSong.releaseYear,
        'releaseYear',
        index,
        MIN_RELEASE_YEAR,
        maximumReleaseYear
      ),
      youtubeId: readOptionalYoutubeId(rawSong.youtubeId, index),
      startTime: rawSong.startTime === undefined
        ? 0
        : readInteger(rawSong.startTime, 'startTime', index, 0, MAX_CLIP_START_SECONDS),
      category: readString(rawSong.category, 'category', index, 60)
    }
  })

  const seenYoutubeIds = new Set<string>()

  for (const song of songs) {
    if (!song.youtubeId) {
      continue
    }

    if (seenYoutubeIds.has(song.youtubeId)) {
      throw invalidImport(`Duplicate "youtubeId" in the payload: ${song.youtubeId}.`)
    }

    seenYoutubeIds.add(song.youtubeId)
  }

  return songs
}

export async function importSongs(songs: SongImportItem[]): Promise<SongImportResult> {
  const categories = [...new Set(songs.map(song => song.category))]
  const categoryIds = new Map<string, number>()

  for (const name of categories) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name }
    })

    categoryIds.set(name, category.id)
  }

  for (const song of songs) {
    const categoryId = categoryIds.get(song.category)

    if (!categoryId) {
      throw invalidImport(`Unknown category: ${song.category}.`)
    }

    const data = {
      title: song.title,
      artist: song.artist,
      releaseYear: song.releaseYear,
      startTime: song.startTime,
      categoryId
    }
    const youtubeData = song.youtubeId === undefined
      ? {}
      : {
          youtubeId: song.youtubeId,
          youtubeVerifiedAt: null,
          youtubeRejectedIds: null
        }
    const existing = await prisma.song.findFirst({
      where: {
        title: song.title,
        artist: song.artist,
        releaseYear: song.releaseYear
      },
      select: { id: true }
    })

    if (existing) {
      await prisma.song.update({
        where: { id: existing.id },
        data: { ...data, ...youtubeData }
      })
      continue
    }

    await prisma.song.create({
      data: {
        ...data,
        ...youtubeData,
        youtubeId: song.youtubeId ?? null
      }
    })
  }

  return {
    imported: songs.length,
    categories
  }
}

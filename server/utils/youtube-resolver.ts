import type { Song } from '@prisma/client'
import prisma from '../../lib/prisma'
import { getYouTubeOEmbedInfo } from './youtube-availability'

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3'
const REQUEST_TIMEOUT_MS = 6000
const VERIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000
const MAX_RESOLUTION_ATTEMPTS = 5
const MAX_REJECTED_IDS = 10
const MIN_VIDEO_SECONDS = 20
const MAX_CLIP_SECONDS = 30

const INVALIDATING_ERROR_CODES = new Set([2, 5, 100, 101, 150])
const BAD_TITLE_WORDS = [
  'cover',
  'karaoke',
  'instrumental',
  'remix',
  'bootleg',
  'mashup',
  'nightcore',
  'slowed',
  'reverb',
  '8d',
  'sped up',
  'reaction',
  'tutorial',
  'parodia',
  'parody'
]
const STOP_WORDS = new Set([
  'the',
  'and',
  'feat',
  'ft',
  'prod',
  'official',
  'video',
  'audio',
  'music',
  'lyrics',
  'topic'
])

type ResolvableSong = Pick<
  Song,
  | 'id'
  | 'title'
  | 'artist'
  | 'releaseYear'
  | 'youtubeId'
  | 'youtubeVerifiedAt'
  | 'youtubeRejectedIds'
  | 'startTime'
>

export type PlayableSong<T extends ResolvableSong> = T & { youtubeId: string }

interface YouTubeConfig {
  apiKey: string
  regionCode: string
}

interface YouTubeErrorPayload {
  error?: {
    errors?: { reason?: string }[]
  }
}

interface SearchListResponse extends YouTubeErrorPayload {
  items?: { id?: { videoId?: string } }[]
}

interface VideoDetails {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
    liveBroadcastContent?: string
  }
  status?: {
    embeddable?: boolean
    privacyStatus?: string
    uploadStatus?: string
    regionRestriction?: {
      allowed?: string[]
      blocked?: string[]
    }
  }
  contentDetails?: {
    duration?: string
    contentRating?: {
      ytRating?: string
    }
  }
}

interface VideoListResponse extends YouTubeErrorPayload {
  items?: VideoDetails[]
}

interface ResolvedVideo {
  youtubeId: string
  startTime: number
  verified?: boolean
}

const negativeCache = new Map<number, number>()
const inflightResolutions = new Map<number, Promise<ResolvedVideo | null>>()
let quotaBlockedUntil = 0
let warnedMissingApiKey = false

function getYouTubeConfig(): YouTubeConfig {
  try {
    const config = useRuntimeConfig()

    return {
      apiKey: typeof config.youtubeApiKey === 'string' ? config.youtubeApiKey : '',
      regionCode: typeof config.youtubeRegionCode === 'string' && config.youtubeRegionCode
        ? config.youtubeRegionCode
        : 'PL'
    }
  } catch {
    return {
      apiKey: process.env.NUXT_YOUTUBE_API_KEY ?? process.env.YOUTUBE_API_KEY ?? '',
      regionCode: process.env.NUXT_YOUTUBE_REGION_CODE ?? 'PL'
    }
  }
}

function parseRejectedIds(value: string | null): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
  )
}

function serializeRejectedIds(ids: Set<string>): string {
  return [...ids].slice(-MAX_REJECTED_IDS).join(',')
}

function isFreshVerification(song: ResolvableSong): boolean {
  return Boolean(
    song.youtubeId
    && song.youtubeVerifiedAt
    && Date.now() - song.youtubeVerifiedAt.getTime() < VERIFIED_TTL_MS
  )
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

function splitArtists(artist: string): string[] {
  return [
    artist,
    ...artist.split(/\s*(?:feat\.?|ft\.?|&|,|\/|\s+i\s+)\s*/i)
  ]
    .map(value => value.trim())
    .filter(Boolean)
}

function titleMatches(song: ResolvableSong, title: string): boolean {
  const wantedTitle = normalizeText(song.title)
  const candidateTitle = normalizeText(title)

  if (!wantedTitle || !candidateTitle) {
    return false
  }

  if (candidateTitle.includes(wantedTitle)) {
    return true
  }

  const wantedTokens = tokenize(song.title).filter(token => token.length > 2)

  if (wantedTokens.length === 0) {
    return false
  }

  const candidateTokens = new Set(tokenize(title))
  const matches = wantedTokens.filter(token => candidateTokens.has(token)).length

  return matches / wantedTokens.length >= 0.6
}

function artistMatches(song: ResolvableSong, title: string, channelTitle: string): boolean {
  const haystackTokens = new Set(tokenize(`${title} ${channelTitle}`))

  return splitArtists(song.artist).some((name) => {
    return tokenize(name)
      .filter(token => token.length >= 3)
      .some(token => haystackTokens.has(token))
  })
}

function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value)

  if (!match) {
    return null
  }

  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const seconds = Number(match[4] ?? 0)

  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

function regionAllowsVideo(video: VideoDetails, regionCode: string): boolean {
  const restriction = video.status?.regionRestriction

  if (!restriction) {
    return true
  }

  if (restriction.blocked?.includes(regionCode)) {
    return false
  }

  return !restriction.allowed || restriction.allowed.includes(regionCode)
}

function isEmbeddableVideo(video: VideoDetails, regionCode: string): boolean {
  const status = video.status
  const duration = parseDurationSeconds(video.contentDetails?.duration)
  const liveState = video.snippet?.liveBroadcastContent ?? 'none'

  return status?.embeddable === true
    && status.privacyStatus === 'public'
    && status.uploadStatus === 'processed'
    && liveState !== 'live'
    && liveState !== 'upcoming'
    && video.contentDetails?.contentRating?.ytRating !== 'ytAgeRestricted'
    && regionAllowsVideo(video, regionCode)
    && (duration === null || duration >= MIN_VIDEO_SECONDS)
}

function scoreVideo(song: ResolvableSong, video: VideoDetails, rejected: Set<string>): number | null {
  if (!isEmbeddableVideo(video, getYouTubeConfig().regionCode) || rejected.has(video.id)) {
    return null
  }

  const title = video.snippet?.title ?? ''
  const channelTitle = video.snippet?.channelTitle ?? ''

  if (!titleMatches(song, title) || !artistMatches(song, title, channelTitle)) {
    return null
  }

  const normalizedTitle = normalizeText(title)
  const normalizedChannel = normalizeText(channelTitle)
  const normalizedArtist = normalizeText(song.artist)
  let score = 90

  if (normalizedChannel.endsWith('topic')) {
    score += 60
  }

  if (normalizedChannel.includes(normalizedArtist)) {
    score += 25
  }

  if (normalizedTitle.includes('audio')) {
    score += 10
  }

  if (normalizedTitle.includes('official')) {
    score += 5
  }

  if (normalizedTitle.includes('live')) {
    score -= 15
  }

  if (BAD_TITLE_WORDS.some(word => normalizedTitle.includes(word))) {
    score -= 60
  }

  return score >= 40 ? score : null
}

function chooseStartTime(song: ResolvableSong, durationSeconds: number | null): number {
  const requested = Math.max(0, song.startTime)

  if (!durationSeconds || durationSeconds <= 0) {
    return requested
  }

  if (requested + MAX_CLIP_SECONDS <= durationSeconds) {
    return requested
  }

  const fallback = Math.min(30, Math.floor(durationSeconds * 0.2))

  if (fallback + MAX_CLIP_SECONDS <= durationSeconds) {
    return fallback
  }

  return Math.max(0, durationSeconds - MAX_CLIP_SECONDS - 2)
}

async function searchVideoIds(
  query: string,
  config: YouTubeConfig,
  relaxed: boolean
): Promise<string[] | null> {
  if (!config.apiKey) {
    if (!warnedMissingApiKey) {
      warnedMissingApiKey = true
      console.warn('[youtube] NUXT_YOUTUBE_API_KEY is missing; new songs cannot be resolved')
    }

    return null
  }

  if (Date.now() < quotaBlockedUntil) {
    return null
  }

  const url = new URL(`${YOUTUBE_API_URL}/search`)

  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', '12')
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('safeSearch', 'none')
  url.searchParams.set('regionCode', config.regionCode)
  url.searchParams.set('key', config.apiKey)

  if (!relaxed) {
    url.searchParams.set('videoSyndicated', 'true')
    url.searchParams.set('videoCategoryId', '10')
  }

  const payload = await requestYouTube<SearchListResponse>(url)

  if (!payload) {
    return null
  }

  return (payload.items ?? [])
    .map(item => item.id?.videoId)
    .filter((id): id is string => Boolean(id))
}

async function fetchVideoDetails(
  ids: string[],
  config: YouTubeConfig
): Promise<VideoDetails[] | null> {
  if (!config.apiKey || ids.length === 0) {
    return []
  }

  const url = new URL(`${YOUTUBE_API_URL}/videos`)

  url.searchParams.set('part', 'snippet,status,contentDetails')
  url.searchParams.set('id', ids.slice(0, 50).join(','))
  url.searchParams.set('key', config.apiKey)

  const payload = await requestYouTube<VideoListResponse>(url)

  if (!payload) {
    return null
  }

  return payload.items ?? []
}

function pickBestVideo(
  song: ResolvableSong,
  videos: VideoDetails[],
  rejected: Set<string>
): VideoDetails | null {
  let bestVideo: VideoDetails | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const video of videos) {
    const score = scoreVideo(song, video, rejected)

    if (score !== null && score > bestScore) {
      bestVideo = video
      bestScore = score
    }
  }

  return bestVideo
}

function resolveVideo(song: ResolvableSong, video: VideoDetails): ResolvedVideo {
  const duration = parseDurationSeconds(video.contentDetails?.duration)

  return {
    youtubeId: video.id,
    startTime: chooseStartTime(song, duration),
    verified: true
  }
}

async function requestYouTube<T extends YouTubeErrorPayload>(url: URL): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const payload = await response.json().catch(() => null) as T | null

    if (!response.ok || !payload) {
      const reason = payload?.error?.errors?.[0]?.reason ?? ''

      if (
        reason === 'quotaExceeded'
        || reason === 'dailyLimitExceeded'
        || reason === 'rateLimitExceeded'
      ) {
        quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS
        console.warn('[youtube] data api quota exceeded, using cached ids only')
      } else {
        console.warn('[youtube] data api request failed', {
          status: response.status,
          reason
        })
      }

      return null
    }

    return payload
  } catch (error) {
    console.warn('[youtube] data api network error', {
      message: error instanceof Error ? error.message : 'unknown'
    })
    return null
  }
}

async function resolveExistingVideo(
  song: ResolvableSong,
  config: YouTubeConfig,
  rejected: Set<string>
): Promise<ResolvedVideo | null> {
  if (!song.youtubeId || rejected.has(song.youtubeId)) {
    return null
  }

  const oembed = await getYouTubeOEmbedInfo(song.youtubeId)

  if (!oembed.playable) {
    return null
  }

  if (!config.apiKey) {
    return {
      youtubeId: song.youtubeId,
      startTime: Math.max(0, song.startTime),
      verified: false
    }
  }

  const details = await fetchVideoDetails([song.youtubeId], config)
  const video = details?.find(item => item.id === song.youtubeId)

  if (!video) {
    // A temporary API failure should not discard an ID that oEmbed accepts.
    return details === null
      ? {
          youtubeId: song.youtubeId,
          startTime: Math.max(0, song.startTime),
          verified: false
        }
      : null
  }

  if (scoreVideo(song, video, rejected) === null) {
    return null
  }

  return resolveVideo(song, video)
}

async function resolveFromSearch(
  song: ResolvableSong,
  config: YouTubeConfig,
  rejected: Set<string>
): Promise<ResolvedVideo | null> {
  const primaryArtist = splitArtists(song.artist)[0] ?? song.artist
  const queries = [
    `${primaryArtist} ${song.title}`,
    `${song.artist} ${song.title}`
  ].filter((query, index, all) => query.trim() && all.indexOf(query) === index)
  let usedRelaxedSearch = false

  for (const query of queries) {
    let ids = await searchVideoIds(query, config, false)

    if (ids === null) {
      return null
    }

    if (ids.length === 0 && !usedRelaxedSearch) {
      usedRelaxedSearch = true
      ids = await searchVideoIds(query, config, true)

      if (ids === null) {
        return null
      }
    }

    if (ids.length === 0) {
      continue
    }

    const details = await fetchVideoDetails(ids, config)

    if (details === null) {
      return null
    }

    const bestVideo = pickBestVideo(song, details, rejected)

    if (bestVideo) {
      return resolveVideo(song, bestVideo)
    }
  }

  return null
}

async function persistResolution(
  song: ResolvableSong,
  resolved: ResolvedVideo,
  rejected: Set<string>,
  verified: boolean
): Promise<void> {
  const nextRejected = new Set(rejected)

  nextRejected.delete(resolved.youtubeId)

  await prisma.song.update({
    where: { id: song.id },
    data: {
      youtubeId: resolved.youtubeId,
      startTime: resolved.startTime,
      youtubeVerifiedAt: verified ? new Date() : null,
      youtubeRejectedIds: serializeRejectedIds(nextRejected)
    }
  })
}

async function resolveSongVideoUncached(song: ResolvableSong): Promise<ResolvedVideo | null> {
  const rejected = parseRejectedIds(song.youtubeRejectedIds)
  const config = getYouTubeConfig()
  const existing = await resolveExistingVideo(song, config, rejected)

  if (existing) {
    await persistResolution(song, existing, rejected, existing.verified === true)
    return existing
  }

  const found = await resolveFromSearch(song, config, rejected)

  if (found) {
    await persistResolution(song, found, rejected, true)
    return found
  }

  negativeCache.set(song.id, Date.now() + NEGATIVE_CACHE_TTL_MS)
  console.warn('[youtube] could not resolve a playable video', {
    songId: song.id,
    title: song.title,
    artist: song.artist
  })

  return null
}

export async function resolveSongVideo(song: ResolvableSong): Promise<ResolvedVideo | null> {
  if (song.youtubeId && isFreshVerification(song)) {
    return {
      youtubeId: song.youtubeId,
      startTime: song.startTime
    }
  }

  const negativeUntil = negativeCache.get(song.id)

  if (negativeUntil && negativeUntil > Date.now()) {
    return null
  }

  const inflight = inflightResolutions.get(song.id)

  if (inflight) {
    return inflight
  }

  const promise = resolveSongVideoUncached(song)
    .finally(() => inflightResolutions.delete(song.id))

  inflightResolutions.set(song.id, promise)

  return promise
}

export async function pickPlayableSong<T extends ResolvableSong>(
  songs: T[],
  excludedIds: ReadonlySet<number> = new Set(),
  maxResolutionAttempts = MAX_RESOLUTION_ATTEMPTS
): Promise<PlayableSong<T> | null> {
  const available = songs.filter(song => !excludedIds.has(song.id))

  for (let index = available.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = available[index]!
    available[index] = available[randomIndex]!
    available[randomIndex] = current
  }

  let attempts = 0

  for (const song of available) {
    if (song.youtubeId && isFreshVerification(song)) {
      return { ...song, youtubeId: song.youtubeId }
    }

    if (attempts >= maxResolutionAttempts) {
      continue
    }

    attempts += 1
    const resolved = await resolveSongVideo(song)

    if (resolved) {
      return {
        ...song,
        youtubeId: resolved.youtubeId,
        startTime: resolved.startTime
      }
    }
  }

  return null
}

export function shouldInvalidateYouTubeVideo(errorCode: number): boolean {
  return INVALIDATING_ERROR_CODES.has(errorCode)
}

export async function invalidateSongYouTubeVideo(songId: number, youtubeId: string): Promise<void> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      youtubeId: true,
      youtubeRejectedIds: true
    }
  })

  if (!song || (song.youtubeId && song.youtubeId !== youtubeId)) {
    return
  }

  const rejected = parseRejectedIds(song.youtubeRejectedIds)

  if (youtubeId) {
    rejected.add(youtubeId)
  }

  await prisma.song.update({
    where: { id: song.id },
    data: {
      youtubeId: null,
      youtubeVerifiedAt: null,
      youtubeRejectedIds: serializeRejectedIds(rejected)
    }
  })

  negativeCache.set(song.id, Date.now() + NEGATIVE_CACHE_TTL_MS)
}

export function clearSongResolutionCache(songId: number): void {
  negativeCache.delete(songId)
}

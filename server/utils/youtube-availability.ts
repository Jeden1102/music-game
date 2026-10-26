const OEMBED_URL = 'https://www.youtube.com/oembed'
const CACHE_TTL_MS = 30 * 60 * 1000
const REQUEST_TIMEOUT_MS = 3500
const UNPLAYABLE_STATUSES = new Set([401, 404, 410])

export interface YouTubeOEmbedInfo {
  playable: boolean
  known: boolean
  title: string | null
  authorName: string | null
}

interface AvailabilityCacheEntry extends YouTubeOEmbedInfo {
  expiresAt: number
}

const availabilityCache = new Map<string, AvailabilityCacheEntry>()

function unknownAvailability(): YouTubeOEmbedInfo {
  return { playable: true, known: false, title: null, authorName: null }
}

export async function getYouTubeOEmbedInfo(youtubeId: string): Promise<YouTubeOEmbedInfo> {
  const cached = availabilityCache.get(youtubeId)

  if (cached && cached.expiresAt > Date.now()) {
    return {
      playable: cached.playable,
      known: cached.known,
      title: cached.title,
      authorName: cached.authorName
    }
  }

  const url = new URL(OEMBED_URL)
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${youtubeId}`)
  url.searchParams.set('format', 'json')

  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; Musicline/1.0)'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    if (response.ok) {
      const payload = await response.json().catch(() => null) as {
        title?: unknown
        author_name?: unknown
      } | null
      const info: YouTubeOEmbedInfo = {
        playable: true,
        known: true,
        title: typeof payload?.title === 'string' ? payload.title : null,
        authorName: typeof payload?.author_name === 'string' ? payload.author_name : null
      }

      availabilityCache.set(youtubeId, {
        ...info,
        expiresAt: Date.now() + CACHE_TTL_MS
      })

      return info
    }

    if (UNPLAYABLE_STATUSES.has(response.status)) {
      const info: YouTubeOEmbedInfo = {
        playable: false,
        known: true,
        title: null,
        authorName: null
      }

      availabilityCache.set(youtubeId, {
        ...info,
        expiresAt: Date.now() + CACHE_TTL_MS
      })

      return info
    }
  } catch {
    // A temporary network failure must not remove songs from the game.
  }

  return unknownAvailability()
}

export async function isYouTubeVideoPlayable(youtubeId: string): Promise<boolean> {
  return (await getYouTubeOEmbedInfo(youtubeId)).playable
}

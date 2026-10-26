import type { YouTubeApi } from '~/types/youtube'

const YOUTUBE_API_URL = 'https://www.youtube.com/iframe_api'

let youtubeApiPromise: Promise<YouTubeApi> | null = null

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (import.meta.server) {
    return Promise.reject(new Error('The YouTube IFrame API is only available in the browser.'))
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise
  }

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => {
      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        reject(new Error('The YouTube IFrame API is unavailable.'))
      }
    }

    const script = document.createElement('script')
    script.src = YOUTUBE_API_URL
    script.async = true
    script.onerror = () => {
      youtubeApiPromise = null
      reject(new Error('Failed to load the YouTube IFrame API.'))
    }
    document.head.appendChild(script)
  })

  return youtubeApiPromise
}

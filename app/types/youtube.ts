export interface YouTubePlayer {
  loadVideoById: (options: { videoId: string, startSeconds?: number }) => void
  cueVideoById: (options: { videoId: string, startSeconds?: number }) => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  getVideoUrl: () => string
  destroy: () => void
}

export interface YouTubePlayerEvent {
  target: YouTubePlayer
  data: number
}

export interface YouTubePlayerOptions {
  videoId?: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void
    onStateChange?: (event: YouTubePlayerEvent) => void
    onError?: (event: { data: number }) => void
  }
}

export interface YouTubeApi {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

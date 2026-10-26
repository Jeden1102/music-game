import type { ComputedRef, Ref } from 'vue'
import type { Song } from '~/types/song'
import type { YouTubeApi, YouTubePlayer, YouTubePlayerEvent } from '~/types/youtube'
import { CLIP_SECONDS, CLIP_TICK_MS, COUNTDOWN_START } from '~/utils/game'
import { loadYouTubeApi } from '~/utils/youtube'

interface UseSongGameOptions {
  clipSeconds?: number | Ref<number> | ComputedRef<number>
  onClipComplete?: () => void | Promise<void>
  onPlaybackUnavailable?: (errorCode: number, youtubeId?: string) => void | Promise<void>
}

export function useSongGame(options: UseSongGameOptions = {}) {
  const { t } = useI18n()
  const toast = useToast()

  const song = ref<Song | null>(null)
  const isLoading = ref(false)
  const isPreparing = ref(false)
  const isPlaying = ref(false)
  const revealed = ref(false)
  const secondsLeft = ref(CLIP_SECONDS)
  const countdown = ref<number | null>(null)
  const playerMount = ref<HTMLElement | null>(null)

  let player: YouTubePlayer | null = null
  let clipInterval: ReturnType<typeof setInterval> | null = null
  let countdownTimeout: ReturnType<typeof setTimeout> | null = null
  let countdownResolver: (() => void) | null = null
  let playbackFallback: ReturnType<typeof setTimeout> | null = null
  let readyResolver: (() => void) | null = null
  let destroyed = false
  let completionHandled = false
  let operationId = 0
  let playbackAllowed = false
  let lastMetricsUpdate = 0

  const playerState = ref<number | null>(null)
  const playerTime = ref(0)
  const playerDuration = ref(0)
  const playerErrorCode = ref<number | null>(null)
  const clipAnchor = ref<number | null>(null)
  const playbackEvents = ref<{ at: string, message: string }[]>([])

  const PLAYER_STATE_NAMES: Record<number, string> = {
    [-1]: 'UNSTARTED',
    0: 'ENDED',
    1: 'PLAYING',
    2: 'PAUSED',
    3: 'BUFFERING',
    5: 'CUED'
  }

  const playerStateLabel = computed(() => {
    const state = playerState.value
    return state === null ? '—' : (PLAYER_STATE_NAMES[state] ?? `STATE_${state}`)
  })

  const PLAYER_ERROR_HINTS: Record<number, string> = {
    2: 'invalid parameter',
    5: 'HTML5 player error',
    100: 'video not found',
    101: 'embedding disabled',
    150: 'embedding disabled',
    153: 'missing referrer / blocked'
  }

  const playerErrorLabel = computed(() => {
    const code = playerErrorCode.value
    return code === null ? '—' : (PLAYER_ERROR_HINTS[code] ?? `error ${code}`)
  })

  function logPlaybackEvent(message: string) {
    const now = new Date()
    const time = now.toLocaleTimeString('pl-PL', { hour12: false })
    playbackEvents.value.push({
      at: `${time}.${String(now.getMilliseconds()).padStart(3, '0')}`,
      message
    })

    if (playbackEvents.value.length > 40) {
      playbackEvents.value.splice(0, playbackEvents.value.length - 40)
    }
  }

  function refreshPlayerMetrics() {
    if (!player) {
      return
    }

    try {
      playerTime.value = player.getCurrentTime()
      playerDuration.value = player.getDuration()
      playerState.value = player.getPlayerState()
    } catch {
      // Metrics are best-effort diagnostics; playback must not depend on them.
    }
  }

  function getActiveVideoId(): string | null {
    if (!player) {
      return null
    }

    try {
      const url = player.getVideoUrl()
      return /[?&]v=([^&]+)/.exec(url)?.[1] ?? null
    } catch {
      return null
    }
  }

  const clipSeconds = computed(() => {
    const value = options.clipSeconds

    if (typeof value === 'number') {
      return value
    }

    return value?.value ?? CLIP_SECONDS
  })

  const progress = computed(() => {
    const total = clipSeconds.value

    return total > 0
      ? Math.round(((total - secondsLeft.value) / total) * 100)
      : 0
  })

  function showError(titleKey: string, description: string) {
    toast.add({
      title: t(titleKey),
      description,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }

  function handlePlaybackError(errorCode: number) {
    if (destroyed) {
      return
    }

    const activeVideoId = getActiveVideoId()
    const currentYoutubeId = song.value?.youtubeId ?? null

    if (activeVideoId && currentYoutubeId && activeVideoId !== currentYoutubeId) {
      logPlaybackEvent(
        `ERROR ignored stale code=${errorCode} playerYt=${activeVideoId} currentYt=${currentYoutubeId}`
      )
      return
    }

    operationId += 1
    refreshPlayerMetrics()
    playerErrorCode.value = errorCode
    playbackAllowed = false
    const failedYoutubeId = activeVideoId ?? currentYoutubeId ?? undefined
    logPlaybackEvent(
      `ERROR code=${errorCode} (${playerErrorLabel.value}) state=${playerStateLabel.value} time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)} start=${song.value?.startTime ?? '-'} yt=${failedYoutubeId ?? '-'}`
    )
    console.warn('[youtube] playback error', {
      errorCode,
      state: playerStateLabel.value,
      currentTime: playerTime.value,
      duration: playerDuration.value,
      youtubeId: failedYoutubeId,
      startTime: song.value?.startTime
    })

    stopClipTimer()
    clearPlaybackFallback()
    isPlaying.value = false
    isPreparing.value = false
    isLoading.value = false

    if (options.onPlaybackUnavailable) {
      void options.onPlaybackUnavailable(errorCode, failedYoutubeId)
      return
    }

    showError('play.playerErrorTitle', t('play.playerErrorDescription'))
  }

  function stopClipTimer() {
    if (clipInterval) {
      clearInterval(clipInterval)
      clipInterval = null
    }

    clipAnchor.value = null
  }

  function clearPlaybackFallback() {
    if (playbackFallback) {
      clearTimeout(playbackFallback)
      playbackFallback = null
    }
  }

  function finishCountdown() {
    if (countdownTimeout) {
      clearTimeout(countdownTimeout)
      countdownTimeout = null
    }

    countdown.value = null
    countdownResolver?.()
    countdownResolver = null
  }

  function stopCountdown() {
    finishCountdown()
  }

  async function notifyClipComplete() {
    if (completionHandled) {
      return
    }

    completionHandled = true
    revealed.value = true
    await options.onClipComplete?.()
  }

  function completeClip() {
    refreshPlayerMetrics()
    logPlaybackEvent(
      `CLIP COMPLETE time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)} anchor=${clipAnchor.value?.toFixed(2) ?? '-'} state=${playerStateLabel.value}`
    )
    player?.pauseVideo()
    isPlaying.value = false
    secondsLeft.value = 0
    stopClipTimer()
    void notifyClipComplete()
  }

  function startClipTimer() {
    stopClipTimer()
    secondsLeft.value = clipSeconds.value
    lastMetricsUpdate = 0
    logPlaybackEvent(
      `CLIP TIMER start left=${clipSeconds.value} time=${playerTime.value.toFixed(2)} start=${song.value?.startTime ?? '-'}`
    )

    clipInterval = setInterval(() => {
      const currentSong = song.value

      if (!player || !currentSong) {
        return
      }

      const clipDuration = clipSeconds.value
      const currentTime = player.getCurrentTime()
      const startTime = currentSong.startTime
      const now = performance.now()

      if (now - lastMetricsUpdate >= 250) {
        playerTime.value = currentTime
        playerDuration.value = player.getDuration()
        playerState.value = player.getPlayerState()
        lastMetricsUpdate = now
      }

      if (clipAnchor.value === null) {
        if (currentTime < startTime - 1) {
          return
        }

        clipAnchor.value = currentTime
        logPlaybackEvent('CLIP ANCHOR ' + currentTime.toFixed(2))
      }

      const elapsed = Math.max(0, currentTime - clipAnchor.value)
      secondsLeft.value = Math.max(0, Math.ceil(clipDuration - elapsed))

      if (elapsed >= clipDuration) {
        completeClip()
      }
    }, CLIP_TICK_MS)
  }

  function handleStateChange(event: YouTubePlayerEvent) {
    const playerStateValue = window.YT?.PlayerState

    playerState.value = event.data
    refreshPlayerMetrics()
    logPlaybackEvent(
      `STATE ${playerStateLabel.value} time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)}`
    )

    if (!playerStateValue) {
      return
    }

    if (event.data === playerStateValue.PLAYING) {
      if (!playbackAllowed) {
        logPlaybackEvent(
          `PLAYING blocked before countdown finished time=${playerTime.value.toFixed(2)}`
        )
        player?.pauseVideo()
        isPlaying.value = false
        stopClipTimer()
        return
      }

      isPlaying.value = true
      isPreparing.value = false
      clearPlaybackFallback()
      startClipTimer()
      return
    }

    if (event.data === playerStateValue.ENDED) {
      const activeVideoId = getActiveVideoId()
      const currentYoutubeId = song.value?.youtubeId ?? null

      if (activeVideoId && currentYoutubeId && activeVideoId !== currentYoutubeId) {
        logPlaybackEvent(
          `ENDED ignored stale playerYt=${activeVideoId} currentYt=${currentYoutubeId}`
        )
        return
      }

      isPlaying.value = false
      secondsLeft.value = 0
      stopClipTimer()

      if (song.value) {
        void notifyClipComplete()
      }

      return
    }

    if (event.data === playerStateValue.PAUSED) {
      isPlaying.value = false
      stopClipTimer()
    }
  }

  async function createPlayer(youtube: YouTubeApi, nextSong: Song): Promise<void> {
    const mountElement = playerMount.value

    if (!mountElement) {
      throw new Error('The player mount element is missing.')
    }

    mountElement.replaceChildren()

    const target = document.createElement('div')
    target.className = 'size-full'
    mountElement.appendChild(target)

    const readyPromise = new Promise<void>((resolve) => {
      readyResolver = resolve
    })

    const readyTimeout = setTimeout(() => {
      readyResolver?.()
      readyResolver = null
    }, 4000)

    player = new youtube.Player(target, {
      videoId: nextSong.youtubeId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        start: nextSong.startTime,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin,
        widget_referrer: window.location.href
      },
      events: {
        onReady: ({ target: readyPlayer }) => {
          playerState.value = readyPlayer.getPlayerState()
          playerTime.value = readyPlayer.getCurrentTime()
          playerDuration.value = readyPlayer.getDuration()
          logPlaybackEvent(
            `READY state=${playerStateLabel.value} time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)} yt=${nextSong.youtubeId}`
          )
          readyResolver?.()
          readyResolver = null
        },
        onStateChange: handleStateChange,
        onError: (event) => {
          handlePlaybackError(event.data)
        }
      }
    })

    const iframe = target.querySelector('iframe')

    if (iframe) {
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    }

    await readyPromise
    clearTimeout(readyTimeout)
  }

  async function prepareSong(nextSong: Song): Promise<void> {
    const youtube = await loadYouTubeApi()

    if (!player) {
      logPlaybackEvent(`CREATE yt=${nextSong.youtubeId} start=${nextSong.startTime}`)
      await createPlayer(youtube, nextSong)
      return
    }

    logPlaybackEvent(`CUE yt=${nextSong.youtubeId} start=${nextSong.startTime}`)
    player.pauseVideo()
    player.cueVideoById({
      videoId: nextSong.youtubeId,
      startSeconds: nextSong.startTime
    })
  }

  function runCountdown(): Promise<void> {
    stopCountdown()

    if (destroyed) {
      return Promise.resolve()
    }

    countdown.value = COUNTDOWN_START

    return new Promise<void>((resolve) => {
      countdownResolver = resolve
      let remaining = COUNTDOWN_START

      const tick = () => {
        if (destroyed) {
          finishCountdown()
          return
        }

        remaining -= 1

        if (remaining <= 0) {
          finishCountdown()
          return
        }

        countdown.value = remaining
        countdownTimeout = setTimeout(tick, 1000)
      }

      countdownTimeout = setTimeout(tick, 1000)
    })
  }

  function prepareRoundState() {
    clearPlaybackFallback()
    stopClipTimer()
    stopCountdown()
    playbackAllowed = false
    isPlaying.value = false
    isPreparing.value = true
    player?.pauseVideo()
  }

  function resetPlayback() {
    operationId += 1
    completionHandled = false
    playbackAllowed = false
    clearPlaybackFallback()
    stopClipTimer()
    stopCountdown()

    try {
      player?.pauseVideo()
      player?.destroy()
    } catch {
      // The iframe may already be gone; reset must still clear the local state.
    }

    player = null

    if (playerMount.value) {
      playerMount.value.replaceChildren()
    }

    song.value = null
    isLoading.value = false
    isPreparing.value = false
    isPlaying.value = false
    revealed.value = false
    secondsLeft.value = clipSeconds.value
    playerState.value = null
    playerTime.value = 0
    playerDuration.value = 0
    playerErrorCode.value = null
    clipAnchor.value = null
    logPlaybackEvent('RESET player and round state')
  }

  async function startSong(nextSong: Song, requestId = ++operationId) {
    song.value = nextSong
    revealed.value = false
    completionHandled = false
    secondsLeft.value = clipSeconds.value
    playerErrorCode.value = null
    playerState.value = null
    playerTime.value = 0
    playerDuration.value = 0
    playbackAllowed = false
    logPlaybackEvent(
      `START song=${nextSong.id} "${nextSong.title}" yt=${nextSong.youtubeId} start=${nextSong.startTime}`
    )

    await nextTick()

    if (destroyed || requestId !== operationId) {
      logPlaybackEvent('START aborted after nextTick')
      return
    }

    await prepareSong(nextSong)

    if (destroyed || requestId !== operationId) {
      logPlaybackEvent('START aborted after prepare')
      return
    }

    await runCountdown()

    if (destroyed || requestId !== operationId) {
      logPlaybackEvent('START aborted after countdown')
      return
    }

    refreshPlayerMetrics()
    playbackAllowed = true
    logPlaybackEvent(
      `PLAY requested state=${playerStateLabel.value} time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)}`
    )
    player?.playVideo()

    playbackFallback = setTimeout(() => {
      playbackFallback = null

      if (!destroyed && requestId === operationId && !isPlaying.value) {
        isPreparing.value = false
        refreshPlayerMetrics()
        logPlaybackEvent(
          `PLAY fallback state=${playerStateLabel.value} time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)}`
        )
      }
    }, 1200)
  }

  async function playSong(nextSong: Song) {
    if (isLoading.value) {
      return
    }

    const requestId = ++operationId
    isLoading.value = true
    prepareRoundState()

    try {
      await startSong(nextSong, requestId)
    } catch {
      if (requestId === operationId) {
        isPreparing.value = false
        showError('play.playerErrorTitle', t('play.playerErrorDescription'))
      }
    } finally {
      if (requestId === operationId) {
        isLoading.value = false
      }
    }
  }

  async function drawSong() {
    if (isLoading.value) {
      return
    }

    const requestId = ++operationId
    isLoading.value = true
    prepareRoundState()

    try {
      const nextSong = await $fetch<Song>('/api/songs/random')

      if (destroyed || requestId !== operationId) {
        return
      }

      await startSong(nextSong, requestId)
    } catch (error) {
      if (requestId !== operationId) {
        return
      }

      isPreparing.value = false
      const statusMessage = (error as { data?: { statusMessage?: string } }).data?.statusMessage

      showError(
        'play.errorTitle',
        statusMessage === 'NO_SONGS' ? t('errors.noSongs') : t('errors.draw')
      )
    } finally {
      if (requestId === operationId) {
        isLoading.value = false
      }
    }
  }

  function replayClip() {
    const currentSong = song.value

    if (!player || !currentSong || isLoading.value || countdown.value !== null) {
      return
    }

    logPlaybackEvent(`REPLAY yt=${currentSong.youtubeId} start=${currentSong.startTime}`)
    stopClipTimer()
    completionHandled = false
    revealed.value = false
    secondsLeft.value = clipSeconds.value
    playbackAllowed = true
    player.seekTo(currentSong.startTime, true)
    player.playVideo()
  }

  function debugPlay() {
    refreshPlayerMetrics()
    playbackAllowed = true
    logPlaybackEvent(
      `DEBUG play state=${playerStateLabel.value} time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)}`
    )
    player?.playVideo()
  }

  function debugPause() {
    refreshPlayerMetrics()
    logPlaybackEvent(
      `DEBUG pause state=${playerStateLabel.value} time=${playerTime.value.toFixed(2)}/${playerDuration.value.toFixed(2)}`
    )
    player?.pauseVideo()
  }

  function debugSeekStart() {
    const currentSong = song.value

    if (!currentSong) {
      return
    }

    logPlaybackEvent(`DEBUG seek ${currentSong.startTime} yt=${currentSong.youtubeId}`)
    player?.seekTo(currentSong.startTime, true)
  }

  function debugLoadCurrent() {
    const currentSong = song.value

    if (!currentSong) {
      return
    }

    logPlaybackEvent(`DEBUG load ${currentSong.youtubeId} start=${currentSong.startTime}`)
    playbackAllowed = true
    player?.loadVideoById({
      videoId: currentSong.youtubeId,
      startSeconds: currentSong.startTime
    })
  }

  onBeforeUnmount(() => {
    destroyed = true
    clearPlaybackFallback()
    stopClipTimer()
    stopCountdown()
    player?.destroy()
    player = null
  })

  return {
    song,
    isLoading,
    isPreparing,
    isPlaying,
    revealed,
    secondsLeft,
    countdown,
    playerMount,
    progress,
    clipSeconds,
    drawSong,
    playSong,
    resetPlayback,
    replayClip,
    playerState,
    playerStateLabel,
    playerTime,
    playerDuration,
    playerErrorCode,
    playerErrorLabel,
    clipAnchor,
    playbackEvents,
    logPlaybackEvent,
    debugPlay,
    debugPause,
    debugSeekStart,
    debugLoadCurrent
  }
}

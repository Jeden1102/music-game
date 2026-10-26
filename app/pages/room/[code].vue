<script setup lang="ts">
import type { Room, RoomPlayer, RoundSong } from '#shared/types/room'
import type { Song } from '~/types/song'
import { getPlayerInitials } from '#shared/utils/player'
import { isValidRoomCode, normalizeRoomCode } from '#shared/utils/room'

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const { session, clearSession } = usePlayerSession()

const roomCode = computed(() =>
  normalizeRoomCode(String(route.params.code ?? ''))
)
const validCode = computed(() => isValidRoomCode(roomCode.value))
const origin = useRequestURL().origin
const joinUrl = computed(() => `${origin}/join?code=${roomCode.value}`)

const currentSession = computed(() => {
  return session.value?.roomCode === roomCode.value ? session.value : null
})
const viewerId = computed(() => currentSession.value?.playerId ?? null)

const {
  data: room,
  status,
  error
} = await useFetch<Room>(() => `/api/rooms/${roomCode.value}`, {
  query: computed(() => (viewerId.value ? { playerId: viewerId.value } : {}))
})

const selfPlayer = computed<RoomPlayer | null>(() => {
  const playerId = currentSession.value?.playerId
  return room.value?.players.find(player => player.id === playerId) ?? null
})
const isHost = computed(() => selfPlayer.value?.isHost === true)
const currentPlayer = computed<RoomPlayer | null>(() => {
  const playerId = room.value?.currentPlayerId
  return room.value?.players.find(player => player.id === playerId) ?? null
})
const selectedPlayerId = ref<string | null>(null)
const selectedPlayer = computed<RoomPlayer | null>(() => {
  return (
    room.value?.players.find(
      player => player.id === selectedPlayerId.value
    )
    ?? currentPlayer.value
    ?? room.value?.players[0]
    ?? null
  )
})
const selectedIsCurrent = computed(() => {
  return (
    Boolean(room.value?.activeRound)
    && selectedPlayer.value?.id === room.value?.activeRound?.playerId
  )
})
const activeRound = computed(() => room.value?.activeRound ?? null)
const roundSong = computed<RoundSong | null>(
  () => activeRound.value?.song ?? null
)
const isAnswerVisible = computed(() => {
  return (
    activeRound.value?.phase === 'revealed'
    || activeRound.value?.phase === 'scored'
  )
})
const activeTurnPlayerId = computed(() => {
  return activeRound.value?.playerId ?? room.value?.currentPlayerId ?? null
})
const activeTurnPlayer = computed<RoomPlayer | null>(() => {
  const playerId = activeTurnPlayerId.value
  return room.value?.players.find(player => player.id === playerId) ?? null
})
const isMyTurn = computed(() => {
  return (
    Boolean(activeRound.value)
    && activeTurnPlayerId.value !== null
    && activeTurnPlayerId.value === viewerId.value
  )
})
const clipFinished = computed(() => Boolean(activeRound.value?.clipEndedAt))
const placement = computed(() => activeRound.value?.placement ?? null)
const canPlaceCard = computed(() => {
  return (
    activeRound.value?.phase === 'listening'
    && isMyTurn.value
    && placement.value === null
  )
})
const selfHasClaimed = computed(() => {
  const playerId = viewerId.value
  return Boolean(playerId && activeRound.value?.claims.includes(playerId))
})
const claimedPlayers = computed(() => {
  const players = room.value?.players ?? []
  return (activeRound.value?.claims ?? []).flatMap((playerId) => {
    const player = players.find(item => item.id === playerId)
    return player ? [player] : []
  })
})
const tokenCandidatePlayers = computed(() => {
  const activePlayer = activeTurnPlayer.value

  if (!activePlayer) {
    return claimedPlayers.value
  }

  return [
    activePlayer,
    ...claimedPlayers.value.filter(player => player.id !== activePlayer.id)
  ]
})
const showClaimList = computed(() => {
  return Boolean(
    activeRound.value && selfPlayer.value && room.value?.status === 'playing'
  )
})
const selfTokenPlacement = computed(() => {
  const playerId = viewerId.value

  if (!playerId) {
    return null
  }

  return activeRound.value?.tokenPlacements.find(
    item => item.playerId === playerId
  ) ?? null
})
const canPlaceToken = computed(() => {
  return Boolean(
    activeRound.value?.phase === 'listening'
    && selfPlayer.value
    && activeRound.value.playerId !== selfPlayer.value.id
    && selfPlayer.value.tokens > 0
    && !selfTokenPlacement.value
  )
})
const selfPendingDuelPosition = computed<number | null>(() => {
  const placement = selfTokenPlacement.value

  if (!placement || placement.yearGuessSubmitted) {
    return null
  }

  const placements = activeRound.value?.tokenPlacements ?? []
  const rivals = placements.filter((item) => {
    return item.position === placement.position && item.playerId !== placement.playerId
  })

  return rivals.length > 0 ? placement.position : null
})
const tokenYearValue = computed(() => Number(tokenYearInput.value))
const isTokenYearValid = computed(() => {
  return Number.isInteger(tokenYearValue.value)
    && tokenYearValue.value >= 1900
    && tokenYearValue.value <= 2100
})
const selectedPlacementPosition = ref<number | null>(null)
const isPlacing = ref(false)
const isClaiming = ref(false)
const isAwarding = ref(false)
const tokenAwardTargetId = ref<string | null>(null)
const isPlacingToken = ref(false)
const isTokenYearOpen = ref(false)
const isSubmittingTokenYear = ref(false)
const tokenYearInput = ref('')
const isSkipConfirmOpen = ref(false)

const selectedBoardPlacement = computed(() => {
  if (
    !selectedPlayer.value
    || !activeRound.value
    || selectedPlayer.value.id !== activeRound.value.playerId
  ) {
    return null
  }

  if (activeRound.value.phase === 'scored') {
    return null
  }

  return placement.value?.position ?? null
})
const selectedBoardPlacementActive = computed(() => {
  return (
    Boolean(selectedPlayer.value)
    && selectedPlayer.value?.id === activeRound.value?.playerId
    && canPlaceCard.value
  )
})
const placementCorrect = computed(
  () => activeRound.value?.placementCorrect ?? null
)
const rankedPlayers = computed(() => {
  return [...(room.value?.players ?? [])].sort((a, b) => {
    if (b.timeline.length !== a.timeline.length) {
      return b.timeline.length - a.timeline.length
    }

    return a.joinedAt.localeCompare(b.joinedAt)
  })
})
const selfRank = computed(() => {
  const playerId = selfPlayer.value?.id

  if (!playerId) {
    return 0
  }

  return rankedPlayers.value.findIndex(player => player.id === playerId) + 1
})
const timelineOpen = ref(false)
const isStarting = ref(false)
const isDrawing = ref(false)
const isActing = ref(false)
const leaveOpen = ref(false)
const isLeaving = ref(false)
const isRecoveringPlayback = ref(false)
const pendingPlaybackError = ref<{ code: number, youtubeId?: string } | null>(null)
const recoveryFailedYoutubeId = ref<string | null>(null)
const recoveryRoundId = ref<string | null>(null)
const playbackRecoveryAttempts = ref(0)
const playbackRecoveryExhausted = ref(false)
const MAX_PLAYBACK_RECOVERY_ATTEMPTS = 3

watch(
  activeTurnPlayerId,
  (playerId) => {
    if (playerId) {
      selectedPlayerId.value = playerId
    }
  },
  { immediate: true }
)

watch(
  () => activeRound.value?.id,
  (roundId, previousRoundId) => {
    selectedPlacementPosition.value = null
    tokenYearInput.value = ''
    isTokenYearOpen.value = false

    // When the host moves to the next player there is no round anymore.
    // Clear the previous song/iframe so the stage goes back to the idle
    // "draw a song" state instead of showing a stale "play the clip" cover.
    if (previousRoundId && !roundId) {
      resetPlayback()
    }
  }
)

watch(
  selfPendingDuelPosition,
  (position) => {
    if (position === null) {
      isTokenYearOpen.value = false
      return
    }

    openTokenYearDialog()
  },
  { immediate: true }
)

function toGameSong(song: RoundSong): Song {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    releaseYear: song.releaseYear,
    youtubeId: song.youtubeId,
    startTime: song.startTime,
    lastPlayed: null,
    categoryId: 0,
    category: { id: 0, name: song.categoryName }
  }
}

async function finishActiveClip() {
  if (!isHost.value || activeRound.value?.phase !== 'listening') {
    return
  }

  try {
    room.value = await roomAction('clip-ended')
  } catch {
    // Marking the clip as finished is best-effort; the host can still reveal the round.
  }
}

async function revealActiveRound() {
  if (
    !isHost.value
    || activeRound.value?.phase !== 'listening'
    || !placement.value
    || isActing.value
  ) {
    return
  }

  isActing.value = true

  try {
    const updatedRoom = await roomAction('reveal')
    room.value = updatedRoom

    if (updatedRoom.activeRound?.placementCorrect) {
      toast.add({
        title: t('room.autoScored'),
        description: t('room.autoScoredHint', {
          name: updatedRoom.activeRound.playerName
        }),
        color: 'success',
        icon: 'i-lucide-circle-check'
      })
    }
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isActing.value = false
  }
}

const clipSeconds = computed(() => room.value?.settings.clipSeconds ?? 15)
const isLocalDebugHost = ['localhost', '127.0.0.1', '[::1]'].includes(
  new URL(origin).hostname
)
const debugPlayer = computed(() => {
  if (route.query.debug !== '1') {
    return false
  }

  return import.meta.dev || isLocalDebugHost
})
const forceStageCover = computed(() => route.query.cover === '1')

const {
  song: localSong,
  isLoading: isPlaybackLoading,
  isPreparing,
  isPlaying,
  secondsLeft,
  countdown,
  playerMount,
  progress: playbackProgress,
  playSong,
  resetPlayback,
  replayClip,
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
} = useSongGame({
  clipSeconds,
  onClipComplete: finishActiveClip,
  onPlaybackUnavailable: recoverUnplayableSong
})

const { isConnected: isRoomSocketConnected } = useRoomSocket({
  code: roomCode,
  playerId: viewerId,
  onRoom: (updatedRoom) => {
    room.value = updatedRoom
  }
})

watch(room, (nextRoom, previousRoom) => {
  if (
    nextRoom
    && previousRoom
    && nextRoom.revision < previousRoom.revision
  ) {
    // An HTTP action response can arrive after a newer WebSocket snapshot.
    room.value = previousRoom
  }
})

watch(
  () => [
    activeRound.value?.id,
    activeRound.value?.phase,
    roundSong.value?.id,
    roundSong.value?.youtubeId,
    roundSong.value?.startTime
  ].join('|'),
  () => {
    logPlaybackEvent(
      `ROOM round=${activeRound.value?.id ?? '-'} phase=${activeRound.value?.phase ?? '-'} song=${roundSong.value?.id ?? '-'} yt=${roundSong.value?.youtubeId ?? '-'} start=${roundSong.value?.startTime ?? '-'}`
    )
  }
)

const debugVideoUrl = computed(() => {
  const currentSong = localSong.value

  return currentSong
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(currentSong.youtubeId)}&t=${currentSong.startTime}s`
    : ''
})

async function copyPlaybackLog() {
  const text = playbackEvents.value
    .map(event => `${event.at} ${event.message}`)
    .join('\n')

  try {
    await navigator.clipboard.writeText(text)
    toast.add({
      title: 'Debug log skopiowany',
      color: 'success',
      icon: 'i-lucide-clipboard-check'
    })
  } catch {
    toast.add({
      title: 'Nie udało się skopiować logu',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}

const stageCovered = computed(() => {
  return Boolean(
    activeRound.value
    && localSong.value
    && !isAnswerVisible.value
    && (forceStageCover.value || !debugPlayer.value)
  )
})

const turnHint = computed(() => {
  if (!room.value) {
    return ''
  }

  if (room.value.status === 'finished') {
    return t('room.winnerHint', { name: room.value.winnerName ?? '' })
  }

  if (room.value.status === 'lobby') {
    return t('room.waitingHostHint')
  }

  if (!activeRound.value) {
    return isHost.value ? t('room.drawHintHost') : t('room.waitingForHostDraw')
  }

  const round = activeRound.value

  if (round.phase === 'listening') {
    if (!clipFinished.value) {
      return isHost.value
        ? t('room.listenHintHost')
        : t('room.listenHintGuest')
    }

    if (isMyTurn.value) {
      return t('room.yourTurnHint')
    }

    if (isHost.value && placement.value) {
      return t('room.revealReadyHint')
    }

    return isHost.value
      ? t('room.hostWaitingPlacementHint', { name: round.playerName })
      : t('room.waitingPlacementHint', { name: round.playerName })
  }

  if (round.phase === 'revealed') {
    return isHost.value ? t('room.revealHintHost') : t('room.revealHint')
  }

  return t('room.scoredHint')
})

const stageMessage = computed(() => {
  if (!room.value) {
    return ''
  }

  if (room.value.status === 'finished') {
    return t('room.finishedStage', { name: room.value.winnerName ?? '' })
  }

  if (!activeRound.value) {
    return isHost.value ? t('room.stageIdleHost') : t('room.stageIdleGuest')
  }

  if (activeRound.value.phase === 'listening') {
    if (!clipFinished.value) {
      return t('room.stageListening')
    }

    return placement.value
      ? t('room.stagePlacementConfirmed', {
          name: activeRound.value.playerName
        })
      : t('room.stageGuessing', { name: activeRound.value.playerName })
  }

  return t('room.stageAnswer')
})

const clipStatus = computed(() => {
  if (!activeRound.value) {
    return ''
  }

  if (activeRound.value.phase === 'listening') {
    if (clipFinished.value) {
      return t('room.musicStopped')
    }

    return isHost.value
      ? t('play.secondsLeft', { seconds: secondsLeft.value })
      : t('room.musicPlaying')
  }

  return t('room.musicStopped')
})

const musicLive = computed(() => {
  return activeRound.value?.phase === 'listening' && !clipFinished.value
})

const musicLabel = computed(() => {
  if (!activeRound.value) {
    return t('room.musicIdle')
  }

  if (activeRound.value.phase === 'listening') {
    if (clipFinished.value) {
      return t('room.musicStopped')
    }

    return isHost.value ? t('room.musicPlaying') : t('room.hostMusicPlaying')
  }

  return t('room.musicStopped')
})

const stageFooterHint = computed(() => {
  if (!activeRound.value) {
    return t('room.clipHint', {
      seconds: room.value?.settings.clipSeconds ?? 15
    })
  }

  if (activeRound.value.phase === 'listening') {
    if (!clipFinished.value) {
      return t('room.clipHint', {
        seconds: room.value?.settings.clipSeconds ?? 15
      })
    }

    if (placement.value) {
      return isHost.value
        ? t('room.footerRevealHost')
        : t('room.footerRevealGuest')
    }

    return isHost.value
      ? t('room.footerWaitingPlacement', { name: activeRound.value.playerName })
      : t('room.footerWaitingPlacementGuest', {
          name: activeRound.value.playerName
        })
  }

  if (activeRound.value.phase === 'revealed') {
    return t('room.footerRevealHint')
  }

  return t('room.footerScoredHint')
})

async function roomAction(path: string): Promise<Room> {
  const playerId = currentSession.value?.playerId

  if (!playerId) {
    throw new Error('PLAYER_NOT_FOUND')
  }

  return await $fetch<Room>(`/api/rooms/${roomCode.value}/${path}`, {
    method: 'POST',
    body: { playerId }
  })
}

function notifyRoomError(requestError: unknown) {
  const statusMessage = (requestError as { data?: { statusMessage?: string } })
    .data?.statusMessage
  let description = t('errors.generic')

  if (statusMessage === 'NOT_HOST') {
    description = t('room.errors.hostOnly')
  } else if (statusMessage === 'ROUND_ACTIVE') {
    description = t('room.errors.roundActive')
  } else if (
    statusMessage === 'NO_SONGS'
    || statusMessage === 'NO_SONGS_LEFT'
  ) {
    description = t('room.errors.noSongsLeft')
  } else if (statusMessage === 'GAME_FINISHED') {
    description = t('room.errors.gameFinished')
  } else if (statusMessage === 'INVALID_STATE') {
    description = t('room.errors.invalidState')
  } else if (statusMessage === 'PLAYER_NOT_FOUND') {
    description = t('room.errors.playerNotFound')
  } else if (statusMessage === 'NOT_ACTIVE_PLAYER') {
    description = t('room.errors.notActivePlayer')
  } else if (statusMessage === 'ACTIVE_PLAYER_CANNOT_CLAIM') {
    description = t('room.errors.activePlayerCannotClaim')
  } else if (statusMessage === 'ALREADY_PLACED') {
    description = t('room.errors.alreadyPlaced')
  } else if (statusMessage === 'PLACEMENT_REQUIRED') {
    description = t('room.errors.placementRequired')
  } else if (statusMessage === 'TOKEN_ALREADY_AWARDED') {
    description = t('room.errors.tokenAlreadyAwarded')
  } else if (statusMessage === 'NO_TOKENS') {
    description = t('room.errors.noTokens')
  } else if (statusMessage === 'TOKEN_ALREADY_PLACED') {
    description = t('room.errors.tokenAlreadyPlaced')
  } else if (statusMessage === 'ACTIVE_PLAYER_CANNOT_BET') {
    description = t('room.errors.activePlayerCannotBet')
  } else if (statusMessage === 'TOKEN_YEAR_REQUIRED') {
    description = t('room.errors.tokenYearRequired')
  } else if (statusMessage === 'TOKEN_YEAR_ALREADY_SET') {
    description = t('room.errors.tokenYearAlreadySet')
  } else if (statusMessage === 'TOKEN_YEAR_INVALID') {
    description = t('room.errors.tokenYearInvalid')
  } else if (statusMessage === 'TOKEN_NOT_IN_DUEL') {
    description = t('room.errors.tokenNotInDuel')
  }

  toast.add({
    title: t('room.actionFailed'),
    description,
    color: 'error',
    icon: 'i-lucide-circle-alert'
  })
}

async function startGame() {
  if (!isHost.value || isStarting.value) {
    return
  }

  isStarting.value = true

  try {
    room.value = await roomAction('start')
    toast.add({
      title: t('room.gameStarted'),
      description: t('room.gameStartedHint'),
      color: 'success',
      icon: 'i-lucide-play'
    })
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isStarting.value = false
  }
}

async function drawCurrentSong() {
  if (
    !isHost.value
    || isDrawing.value
    || activeRound.value
    || room.value?.status !== 'playing'
  ) {
    return
  }

  isDrawing.value = true
  playbackRecoveryAttempts.value = 0
  playbackRecoveryExhausted.value = false
  pendingPlaybackError.value = null
  recoveryFailedYoutubeId.value = null
  recoveryRoundId.value = null

  try {
    const updatedRoom = await roomAction('draw')
    room.value = updatedRoom

    const nextSong = updatedRoom.activeRound?.song

    if (nextSong) {
      logPlaybackEvent(
        `DRAW round=${updatedRoom.activeRound?.id ?? '-'} song=${nextSong.id} yt=${nextSong.youtubeId} start=${nextSong.startTime}`
      )
      await playSong(toGameSong(nextSong))
    }
  } catch (requestError) {
    logPlaybackEvent(`DRAW failed ${String((requestError as Error)?.message ?? requestError)}`)
    notifyRoomError(requestError)
  } finally {
    isDrawing.value = false
  }
}

async function resumePlayback() {
  if (!roundSong.value || localSong.value) {
    return
  }

  await playSong(toGameSong(roundSong.value))
}

async function recoverUnplayableSong(
  errorCode: number,
  failedYoutubeId = localSong.value?.youtubeId
) {
  const roundId = activeRound.value?.id ?? null
  const failedVideo = failedYoutubeId ?? null

  logPlaybackEvent(
    `RECOVER requested code=${errorCode} round=${roundId ?? '-'} song=${localSong.value?.id ?? '-'} yt=${failedVideo ?? '-'}`
  )

  if (!isHost.value) {
    logPlaybackEvent('RECOVER ignored: not host')
    return
  }

  if (isRecoveringPlayback.value) {
    if (failedVideo && failedVideo === recoveryFailedYoutubeId.value) {
      logPlaybackEvent(
        `RECOVER ignored duplicate/stale yt=${failedVideo} code=${errorCode}`
      )
      return
    }

    pendingPlaybackError.value = { code: errorCode, youtubeId: failedVideo ?? undefined }
    logPlaybackEvent(
      `RECOVER queued code=${errorCode} yt=${failedVideo ?? '-'}`
    )
    return
  }

  if (roundId && recoveryRoundId.value === roundId) {
    logPlaybackEvent(
      `RECOVER ignored: round ${roundId} already handled`
    )
    return
  }

  if (errorCode === 153) {
    recoveryRoundId.value = roundId
    logPlaybackEvent('RECOVER stopped: referrer blocked (153)')

    if (!playbackRecoveryExhausted.value) {
      playbackRecoveryExhausted.value = true
      toast.add({
        title: t('play.playerErrorTitle'),
        description: t('room.errors.referrerBlocked'),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
    }

    return
  }

  if (
    playbackRecoveryExhausted.value
    || playbackRecoveryAttempts.value >= MAX_PLAYBACK_RECOVERY_ATTEMPTS
  ) {
    logPlaybackEvent('RECOVER stopped: attempts exhausted')

    if (!playbackRecoveryExhausted.value) {
      playbackRecoveryExhausted.value = true
      toast.add({
        title: t('play.playerErrorTitle'),
        description: t('play.playerErrorDescription'),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
    }

    return
  }

  const playerId = currentSession.value?.playerId

  if (!playerId) {
    logPlaybackEvent('RECOVER stopped: no playerId')
    return
  }

  isRecoveringPlayback.value = true
  playbackRecoveryAttempts.value += 1
  recoveryRoundId.value = roundId
  recoveryFailedYoutubeId.value = failedVideo
  logPlaybackEvent(
    `RECOVER attempt=${playbackRecoveryAttempts.value} code=${errorCode} yt=${failedVideo ?? '-'}`
  )

  if (playbackRecoveryAttempts.value === 1) {
    toast.add({
      title: t('play.recoveringTitle'),
      description: t('play.recoveringDescription'),
      icon: 'i-lucide-refresh-cw'
    })
  }

  try {
    const updatedRoom = await $fetch<Room>(
      `/api/rooms/${roomCode.value}/redraw`,
      {
        method: 'POST',
        body: {
          playerId,
          failedYoutubeId: failedVideo ?? localSong.value?.youtubeId,
          errorCode
        }
      }
    )
    room.value = updatedRoom

    const nextSong = updatedRoom.activeRound?.song

    logPlaybackEvent(
      `RECOVER round=${updatedRoom.activeRound?.id ?? '-'} song=${nextSong?.id ?? '-'} yt=${nextSong?.youtubeId ?? '-'} start=${nextSong?.startTime ?? '-'}`
    )

    if (nextSong) {
      // A failure from the new video must be queued separately, not confused
      // with late error callbacks from the video we just ditched.
      recoveryFailedYoutubeId.value = null
      await playSong(toGameSong(nextSong))
    }
  } catch (requestError) {
    playbackRecoveryExhausted.value = true
    logPlaybackEvent(
      `RECOVER failed ${String((requestError as Error)?.message ?? requestError)}`
    )
    notifyRoomError(requestError)
  } finally {
    isRecoveringPlayback.value = false

    const pendingError = pendingPlaybackError.value
    pendingPlaybackError.value = null

    if (pendingError !== null) {
      void recoverUnplayableSong(pendingError.code, pendingError.youtubeId)
    }
  }
}

function playerHasClaimed(playerId: string) {
  return activeRound.value?.claims.includes(playerId) ?? false
}

function playerGotToken(playerId: string) {
  return activeRound.value?.tokenAwards.includes(playerId) ?? false
}

async function claimSong() {
  if (
    !selfPlayer.value
    || !activeRound.value
    || selfHasClaimed.value
    || isMyTurn.value
    || clipFinished.value
    || isClaiming.value
  ) {
    return
  }

  isClaiming.value = true

  try {
    room.value = await roomAction('claim')
    toast.add({
      title: t('room.knowSongSent'),
      description: t('room.knowSongSentHint'),
      color: 'success',
      icon: 'i-lucide-hand'
    })
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isClaiming.value = false
  }
}

async function confirmPlacement() {
  const playerId = currentSession.value?.playerId
  const position = selectedPlacementPosition.value

  if (
    !playerId
    || position === null
    || !canPlaceCard.value
    || isPlacing.value
  ) {
    return
  }

  isPlacing.value = true

  try {
    room.value = await $fetch<Room>(`/api/rooms/${roomCode.value}/place`, {
      method: 'POST',
      body: { playerId, position }
    })
    selectedPlacementPosition.value = null
    toast.add({
      title: t('room.placementSent'),
      description: t('room.placementSentHint'),
      color: 'success',
      icon: 'i-lucide-map-pin-check'
    })
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isPlacing.value = false
  }
}

async function awardToken(targetPlayer: RoomPlayer) {
  const hostId = currentSession.value?.playerId

  if (
    !hostId
    || !isHost.value
    || isAwarding.value
    || playerGotToken(targetPlayer.id)
  ) {
    return
  }

  isAwarding.value = true
  tokenAwardTargetId.value = targetPlayer.id

  try {
    room.value = await $fetch<Room>(
      `/api/rooms/${roomCode.value}/award-token`,
      {
        method: 'POST',
        body: { playerId: hostId, targetPlayerId: targetPlayer.id }
      }
    )
    toast.add({
      title: t('room.tokenAwarded'),
      description: t('room.tokenAwardedHint', { name: targetPlayer.name }),
      color: 'success',
      icon: 'i-lucide-ticket'
    })
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isAwarding.value = false
    tokenAwardTargetId.value = null
  }
}

async function placeToken(position: number) {
  const playerId = viewerId.value

  if (!playerId || !canPlaceToken.value || isPlacingToken.value) {
    return
  }

  isPlacingToken.value = true

  try {
    room.value = await $fetch<Room>(
      `/api/rooms/${roomCode.value}/place-token`,
      {
        method: 'POST',
        body: { playerId, position }
      }
    )
    toast.add({
      title: t('room.tokenPlaced'),
      description: t('room.tokenPlacedHint', { position: position + 1 }),
      color: 'success',
      icon: 'i-lucide-ticket'
    })
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isPlacingToken.value = false
  }
}

function openTokenYearDialog() {
  if (selfPendingDuelPosition.value === null) {
    return
  }

  tokenYearInput.value = ''
  isTokenYearOpen.value = true
}

async function submitTokenYear() {
  const playerId = viewerId.value

  if (
    !playerId
    || selfPendingDuelPosition.value === null
    || isSubmittingTokenYear.value
  ) {
    return
  }

  if (!isTokenYearValid.value) {
    toast.add({
      title: t('room.actionFailed'),
      description: t('room.errors.tokenYearInvalid'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    return
  }

  isSubmittingTokenYear.value = true

  try {
    room.value = await $fetch<Room>(
      `/api/rooms/${roomCode.value}/token-year`,
      {
        method: 'POST',
        body: { playerId, year: tokenYearValue.value }
      }
    )
    isTokenYearOpen.value = false
    tokenYearInput.value = ''
    toast.add({
      title: t('room.tokenYearSubmitted'),
      description: t('room.tokenYearSubmittedHint'),
      color: 'success',
      icon: 'i-lucide-swords'
    })
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isSubmittingTokenYear.value = false
  }
}

async function scoreCurrentRound() {
  if (
    !isHost.value
    || activeRound.value?.phase !== 'revealed'
    || isActing.value
  ) {
    return
  }

  isActing.value = true

  try {
    room.value = await roomAction('score')
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isActing.value = false
  }
}

async function skipCurrentRound() {
  if (!isHost.value || !activeRound.value || isActing.value) {
    return
  }

  isSkipConfirmOpen.value = false
  isActing.value = true

  try {
    room.value = await roomAction('skip')
  } catch (requestError) {
    notifyRoomError(requestError)
  } finally {
    isActing.value = false
  }
}

function requestSkipCurrentRound() {
  if (!isHost.value || !activeRound.value || isActing.value) {
    return
  }

  if (activeRound.value.tokenAwards.length > 0) {
    void skipCurrentRound()
    return
  }

  isSkipConfirmOpen.value = true
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(roomCode.value)
    toast.add({
      title: t('room.copied'),
      color: 'success',
      icon: 'i-lucide-clipboard-check'
    })
  } catch {
    toast.add({
      title: t('room.copyError'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}

async function leaveCurrentRoom() {
  if (isLeaving.value) {
    return
  }

  const playerId = currentSession.value?.playerId
  isLeaving.value = true

  try {
    if (playerId) {
      await $fetch(`/api/rooms/${roomCode.value}/leave`, {
        method: 'POST',
        body: { playerId }
      })
    }
  } catch {
    // The local session should be cleared even if the room already expired.
  } finally {
    clearSession()
    timelineOpen.value = false
    leaveOpen.value = false
    isLeaving.value = false
    await navigateTo('/')
  }
}

const pageTitle = computed(() => {
  return room.value
    ? t('room.pageTitle', { code: room.value.code })
    : t('room.notFound')
})

useSeoMeta({
  title: () => pageTitle.value,
  description: () => (room.value ? turnHint.value : t('room.notFoundHint'))
})
</script>

<template>
  <UContainer class="py-6 pb-32 sm:py-8 sm:pb-32">
    <div class="mx-auto max-w-6xl">
      <UAlert
        v-if="!validCode"
        color="error"
        variant="subtle"
        :title="t('validation.roomCode')"
      />

      <UCard v-else-if="status === 'pending' && !room">
        <div class="flex items-center justify-center gap-3 py-12 text-muted">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-6 animate-spin"
          />
          {{ t("room.loading") }}
        </div>
      </UCard>

      <UAlert
        v-else-if="error && !room"
        color="error"
        variant="subtle"
        :title="t('room.notFound')"
        :description="t('room.notFoundHint')"
      />

      <div
        v-else-if="room"
        class="space-y-5"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-sun-400 shadow-lg dark:bg-sun-400 dark:text-navy-900"
            >
              <UIcon
                name="i-lucide-audio-lines"
                class="size-5"
              />
            </span>
            <div class="min-w-0">
              <p
                class="text-xs font-black uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300"
              >
                musicline
              </p>
              <h1
                class="truncate text-2xl font-black tracking-tight text-highlighted sm:text-3xl"
              >
                {{
                  room.status === "lobby"
                    ? t("room.lobbyTitle")
                    : t("room.gameTitle")
                }}
              </h1>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge
              :label="isRoomSocketConnected ? t('room.live') : t('room.reconnecting')"
              :icon="isRoomSocketConnected ? 'i-lucide-radio' : 'i-lucide-wifi-off'"
              :color="isRoomSocketConnected ? 'success' : 'warning'"
              variant="subtle"
              size="lg"
            />
            <UBadge
              :label="room.code"
              icon="i-lucide-key-round"
              color="primary"
              variant="solid"
              size="lg"
              class="font-mono tracking-widest"
            />
            <UBadge
              :label="`${room.settings.clipSeconds} s`"
              icon="i-lucide-timer"
              color="neutral"
              variant="subtle"
              size="lg"
            />
            <UBadge
              :label="room.settings.categoryName ?? t('create.allCategories')"
              icon="i-lucide-tags"
              color="neutral"
              variant="subtle"
              size="lg"
            />
            <UBadge
              :label="
                t('room.cardsToWin', { cards: room.settings.targetCards })
              "
              icon="i-lucide-trophy"
              color="warning"
              variant="subtle"
              size="lg"
            />
          </div>
        </div>

        <UAlert
          v-if="!currentSession"
          color="warning"
          variant="subtle"
          icon="i-lucide-user-round-x"
          :title="t('room.noSession')"
          :description="t('room.noSessionHint')"
        >
          <template #actions>
            <UButton
              :to="`/join?code=${roomCode}`"
              :label="t('room.joinThisRoom')"
              icon="i-lucide-log-in"
              size="sm"
            />
          </template>
        </UAlert>

        <RoomLobby
          v-if="room.status === 'lobby'"
          :room="room"
          :join-url="joinUrl"
          :is-host="isHost"
          :is-starting="isStarting"
          :self-id="currentSession?.playerId"
          @start="startGame"
          @copy="copyCode"
        />

        <template v-else>
          <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div class="min-w-0 space-y-5">
              <div
                class="relative overflow-hidden rounded-lg border bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-5 text-cream-100 shadow-xl transition sm:p-6"
                :class="
                  isMyTurn && room.status === 'playing'
                    ? 'border-brand-400 ring-2 ring-brand-500/50'
                    : 'border-white/10'
                "
              >
                <div
                  class="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full bg-brand-500/20 blur-3xl"
                />
                <div class="relative flex flex-wrap items-center gap-4">
                  <span
                    class="relative flex size-14 shrink-0 items-center justify-center rounded-lg bg-sun-400 text-lg font-black text-navy-900 shadow-lg"
                  >
                    <UIcon
                      v-if="room.status === 'finished'"
                      name="i-lucide-trophy"
                      class="size-7"
                    />
                    <template v-else-if="activeTurnPlayer">
                      {{ getPlayerInitials(activeTurnPlayer.name) }}
                    </template>
                    <UIcon
                      v-else
                      name="i-lucide-headphones"
                      class="size-7"
                    />
                    <span
                      v-if="room.status === 'playing' && activeRound"
                      class="absolute -right-0.5 -top-0.5 size-3.5 animate-pulse rounded-full border-2 border-navy-800 bg-brand-400"
                    />
                  </span>

                  <div class="min-w-0 flex-1">
                    <p
                      class="text-[11px] font-black uppercase tracking-[0.24em] text-sun-300"
                    >
                      {{
                        room.status === "finished"
                          ? t("room.winnerTitle", {
                            name: room.winnerName ?? ""
                          })
                          : activeRound
                            ? t("room.guessingNow")
                            : t("room.nextTurnLabel")
                      }}
                    </p>
                    <p
                      class="mt-1 truncate text-2xl font-black tracking-tight sm:text-3xl"
                    >
                      {{
                        room.status === "finished"
                          ? room.winnerName
                          : activeTurnPlayer?.name || room.currentPlayerName
                      }}
                    </p>
                    <p class="mt-1 text-sm font-semibold text-cream-200/80">
                      {{ turnHint }}
                    </p>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge
                      v-if="isMyTurn && room.status === 'playing'"
                      :label="t('room.yourTurnBadge')"
                      icon="i-lucide-sparkles"
                      color="success"
                      variant="solid"
                      size="lg"
                    />
                    <UBadge
                      v-if="isHost"
                      :label="t('room.hostControls')"
                      icon="i-lucide-crown"
                      color="warning"
                      variant="solid"
                      size="lg"
                    />
                  </div>
                </div>
              </div>

              <div
                v-if="showClaimList && activeRound"
                class="rounded-lg border-2 border-brand-500/40 bg-brand-500/10 p-4 shadow-sm"
              >
                <div
                  class="mb-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p class="text-sm font-black text-highlighted">
                      {{
                        clipFinished
                          ? t("room.claimsListTitle")
                          : t("room.knowSongTitle")
                      }}
                    </p>
                    <p class="text-xs font-semibold text-muted">
                      <template v-if="clipFinished">
                        {{
                          isHost
                            ? t("room.claimsListHostHint")
                            : t("room.claimsListGuestHint")
                        }}
                      </template>
                      <template v-else-if="isMyTurn">
                        {{ t("room.activePlayerCannotClaimHint") }}
                      </template>
                      <template v-else>
                        {{
                          selfHasClaimed
                            ? t("room.knowSongClaimedHint")
                            : t("room.knowSongHint")
                        }}
                      </template>
                    </p>
                  </div>
                  <UBadge
                    v-if="claimedPlayers.length > 0"
                    :label="
                      t('room.claimCount', { count: claimedPlayers.length })
                    "
                    icon="i-lucide-hand"
                    color="success"
                    variant="subtle"
                  />
                </div>

                <template v-if="!clipFinished">
                  <UAlert
                    v-if="isMyTurn"
                    color="warning"
                    variant="subtle"
                    icon="i-lucide-headphones"
                    :title="t('room.activePlayerCannotClaim')"
                    :description="t('room.activePlayerCannotClaimHint')"
                  />

                  <UButton
                    v-else
                    :label="
                      selfHasClaimed
                        ? t('room.knowSongClaimed')
                        : t('room.knowSong')
                    "
                    :icon="selfHasClaimed ? 'i-lucide-check' : 'i-lucide-hand'"
                    :color="selfHasClaimed ? 'success' : 'primary'"
                    size="xl"
                    block
                    :disabled="selfHasClaimed"
                    :loading="isClaiming"
                    @click="claimSong"
                  />

                  <div
                    v-if="claimedPlayers.length > 0"
                    class="mt-3 flex flex-wrap items-center gap-1.5"
                  >
                    <span
                      class="text-[11px] font-bold uppercase tracking-wide text-muted"
                    >
                      {{ t("room.claimsTitle") }}:
                    </span>
                    <UBadge
                      v-for="claimed in claimedPlayers"
                      :key="claimed.id"
                      :label="claimed.name"
                      color="success"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                </template>

                <template v-else>
                  <div class="space-y-2">
                    <div
                      v-for="(player, index) in tokenCandidatePlayers"
                      :key="`claim-${player.id}`"
                      class="flex flex-wrap items-center gap-3 rounded-lg border border-default bg-elevated px-3 py-2.5"
                    >
                      <span
                        class="w-4 shrink-0 text-center text-xs font-black text-muted"
                      >
                        {{ index + 1 }}
                      </span>
                      <span
                        class="flex size-9 shrink-0 items-center justify-center rounded-md bg-navy-800 text-[10px] font-black text-sun-400 dark:bg-sun-400 dark:text-navy-900"
                      >
                        {{ getPlayerInitials(player.name) }}
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <p
                            class="truncate text-sm font-black text-highlighted"
                          >
                            {{ player.name }}
                          </p>
                          <UBadge
                            v-if="player.id === activeTurnPlayerId"
                            :label="t('room.guessingNowBadge')"
                            color="warning"
                            variant="subtle"
                            size="sm"
                          />
                          <UBadge
                            v-if="playerHasClaimed(player.id)"
                            :label="t('room.claimedBadge')"
                            icon="i-lucide-hand"
                            color="success"
                            variant="subtle"
                            size="sm"
                          />
                        </div>
                        <p
                          class="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted"
                        >
                          <UIcon
                            name="i-lucide-ticket"
                            class="size-3 text-brand-500"
                          />
                          {{ t("room.tokensCount", { count: player.tokens }) }}
                        </p>
                      </div>
                      <UButton
                        v-if="isHost"
                        :label="
                          playerGotToken(player.id)
                            ? t('room.tokenAwardedShort')
                            : t('room.awardToken')
                        "
                        :icon="
                          playerGotToken(player.id)
                            ? 'i-lucide-check'
                            : 'i-lucide-ticket'
                        "
                        :color="
                          playerGotToken(player.id) ? 'success' : 'primary'
                        "
                        :variant="
                          playerGotToken(player.id) ? 'subtle' : 'solid'
                        "
                        size="sm"
                        :disabled="playerGotToken(player.id)"
                        :loading="
                          isAwarding && tokenAwardTargetId === player.id
                        "
                        @click="awardToken(player)"
                      />
                    </div>
                  </div>

                  <p class="mt-3 text-xs font-semibold text-muted">
                    {{
                      isHost
                        ? t("room.claimsAwardHint")
                        : t("room.claimsWaitingHostHint")
                    }}
                  </p>
                </template>
              </div>

              <div class="flex items-center justify-between gap-3">
                <p
                  class="text-sm font-black uppercase tracking-[0.16em] text-muted"
                >
                  {{ t("room.playerBoards") }}
                </p>
                <p class="text-xs font-semibold text-muted">
                  {{ t("room.previewHint") }}
                </p>
              </div>

              <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <button
                  v-for="player in room.players"
                  :key="player.id"
                  type="button"
                  class="flex min-w-max items-center gap-2 rounded-lg border px-3 py-2 text-left transition"
                  :class="
                    player.id === selectedPlayerId
                      ? 'border-brand-500 bg-brand-500/10 shadow-sm'
                      : 'border-default bg-elevated hover:border-brand-500/60'
                  "
                  @click="selectedPlayerId = player.id"
                >
                  <span
                    class="flex size-8 items-center justify-center rounded-md bg-navy-800 text-[10px] font-black text-sun-400 dark:bg-sun-400 dark:text-navy-900"
                  >
                    {{ getPlayerInitials(player.name) }}
                  </span>
                  <span class="min-w-0">
                    <span class="flex items-center gap-1">
                      <span
                        class="max-w-28 truncate text-sm font-black text-highlighted"
                      >{{ player.name }}</span>
                      <UIcon
                        v-if="player.isHost"
                        name="i-lucide-crown"
                        class="size-3 text-brand-500"
                      />
                    </span>
                    <span class="block text-[11px] font-semibold text-muted">
                      {{
                        t("room.cardsShort", { cards: player.timeline.length })
                      }}
                    </span>
                  </span>
                  <UBadge
                    v-if="activeRound && player.id === activeTurnPlayerId"
                    :label="t('room.guessingNowBadge')"
                    color="warning"
                    variant="solid"
                    size="sm"
                  />
                </button>
              </div>

              <TimelineBoard
                v-if="selectedPlayer"
                :player="selectedPlayer"
                :target-cards="room.settings.targetCards"
                :is-current="selectedIsCurrent"
                :is-self="selectedPlayer.id === currentSession?.playerId"
                :placement-active="selectedBoardPlacementActive"
                :submitted-position="selectedBoardPlacement"
                :selected-position="selectedPlacementPosition"
                :placement-pending="isPlacing"
                :placement-waiting="
                  selectedPlayer.id === activeRound?.playerId
                    && activeRound?.phase === 'listening'
                    && !placement
                "
                :has-claimed="playerHasClaimed(selectedPlayer.id)"
                @select-position="selectedPlacementPosition = $event"
                @confirm-placement="confirmPlacement"
              />

              <TokenGuessBoard
                v-if="activeRound && activeTurnPlayer"
                :round-id="activeRound.id"
                :player="activeTurnPlayer"
                :placements="activeRound.tokenPlacements"
                :duels="activeRound.tokenDuels"
                :results="activeRound.tokenResults"
                :self-player-id="viewerId"
                :self-tokens="selfPlayer?.tokens ?? 0"
                :can-place="canPlaceToken"
                :phase="activeRound.phase"
                :pending="isPlacingToken"
                @place="placeToken"
                @guess="openTokenYearDialog"
              />

              <UCard :ui="{ body: 'p-0 sm:p-0', footer: 'px-4 py-3 sm:px-6' }">
                <template #header>
                  <div
                    class="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="flex size-8 items-center justify-center rounded-md bg-navy-800 text-sun-400 dark:bg-sun-400 dark:text-navy-900"
                      >
                        <UIcon
                          name="i-lucide-radio"
                          class="size-4"
                        />
                      </span>
                      <div>
                        <p class="text-sm font-black text-highlighted">
                          {{ t("room.stageTitle") }}
                        </p>
                        <p class="text-xs font-semibold text-muted">
                          {{ stageMessage }}
                        </p>
                      </div>
                    </div>

                    <UBadge
                      v-if="roundSong"
                      :label="clipStatus"
                      :color="musicLive ? 'primary' : 'neutral'"
                      variant="subtle"
                    />
                  </div>
                </template>

                <div class="relative aspect-video overflow-hidden bg-navy-950">
                  <div
                    v-if="isHost"
                    ref="playerMount"
                    class="size-full"
                  />

                  <div
                    v-if="!isHost || !localSong"
                    class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-cream-100"
                  >
                    <div
                      class="relative flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-navy-700 to-navy-950 shadow-2xl"
                    >
                      <div
                        class="absolute inset-2 rounded-full border border-cream-200/15"
                      />
                      <div
                        class="absolute inset-5 rounded-full border border-cream-200/10"
                      />
                      <div
                        class="flex size-10 items-center justify-center rounded-full bg-brand-500 shadow-lg"
                      >
                        <UIcon
                          name="i-lucide-audio-lines"
                          class="size-5 text-white"
                        />
                      </div>
                      <span
                        class="absolute size-24 animate-[spin_7s_linear_infinite] rounded-full border-2 border-transparent border-t-sun-400/80"
                      />
                    </div>

                    <p class="max-w-sm text-sm font-semibold text-cream-200/75">
                      {{ stageMessage }}
                    </p>

                    <UButton
                      v-if="
                        isHost
                          && roundSong
                          && activeRound?.phase === 'listening'
                          && !localSong
                          && !isPlaybackLoading
                      "
                      :label="t('room.resumePlayback')"
                      icon="i-lucide-play"
                      @click="resumePlayback"
                    />
                  </div>

                  <div
                    v-if="stageCovered && isHost"
                    class="absolute inset-0 flex items-center justify-center bg-navy-950 px-6 text-center text-white"
                    data-stage-cover
                  >
                    <CountdownOverlay
                      v-if="countdown !== null"
                      :value="countdown ?? 0"
                    />

                    <div
                      v-else-if="isPreparing"
                      class="flex flex-col items-center gap-3"
                    >
                      <UIcon
                        name="i-lucide-loader-circle"
                        class="size-9 animate-spin"
                      />
                      <p class="text-sm">
                        {{ t("play.preparing") }}
                      </p>
                    </div>

                    <div
                      v-else-if="!isPlaying"
                      class="flex flex-col items-center gap-3"
                    >
                      <UIcon
                        :name="
                          clipFinished
                            ? 'i-lucide-circle-check'
                            : 'i-lucide-ear'
                        "
                        class="size-9 text-white/70"
                      />
                      <p class="text-sm text-white/70">
                        {{
                          clipFinished
                            ? placement
                              ? t("room.clipFinishedPlacedHost")
                              : t("room.clipFinishedHost")
                            : t("play.autoplayHint")
                        }}
                      </p>
                      <UButton
                        v-if="!clipFinished"
                        :label="t('play.playClip')"
                        icon="i-lucide-play"
                        @click="replayClip"
                      />
                    </div>

                    <div
                      v-else
                      class="flex flex-col items-center gap-3"
                    >
                      <UIcon
                        name="i-lucide-audio-lines"
                        class="size-10 animate-pulse text-brand-300"
                      />
                      <p class="text-sm font-semibold text-white/85">
                        {{ t("play.listen") }}
                      </p>
                      <p class="text-xs text-white/55">
                        {{ t("play.secondsLeft", { seconds: secondsLeft }) }}
                      </p>
                    </div>
                  </div>

                  <div
                    v-if="debugPlayer && isHost"
                    class="absolute left-2 top-2 z-20 w-[min(34rem,95%)] rounded-lg border border-lime-400/50 bg-black/85 p-2 font-mono text-[10px] leading-4 text-lime-200 shadow-2xl"
                  >
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        class="rounded bg-lime-400 px-1.5 py-0.5 font-black text-black"
                      >DEBUG DEV</span>
                      <span>state={{ playerStateLabel }}</span>
                      <span>
                        t={{ playerTime.toFixed(1) }}/{{ playerDuration.toFixed(1) }}s
                      </span>
                      <span>left={{ secondsLeft }}</span>
                      <span>anchor={{ clipAnchor?.toFixed(1) ?? "—" }}</span>
                      <span
                        :class="playerErrorCode === null ? 'text-lime-300' : 'font-black text-red-400'"
                      >
                        err={{ playerErrorCode ?? "—" }}
                        <span v-if="playerErrorCode !== null">({{ playerErrorLabel }})</span>
                      </span>
                    </div>

                    <div class="mt-1 break-all text-lime-100">
                      #{{ localSong?.id ?? "—" }} {{ localSong?.title ?? "—" }}
                      <span class="text-lime-400">yt={{ localSong?.youtubeId ?? "—" }}</span>
                      <span class="text-lime-400">start={{ localSong?.startTime ?? "—" }}</span>
                    </div>

                    <div class="break-all text-lime-300/80">
                      round={{ activeRound?.id ?? "—" }}
                      phase={{ activeRound?.phase ?? "—" }}
                      clipEnded={{ Boolean(activeRound?.clipEndedAt) }}
                      recovering={{ isRecoveringPlayback }}
                      attempts={{ playbackRecoveryAttempts }}
                      loading={{ isPlaybackLoading }}
                      preparing={{ isPreparing }}
                      playing={{ isPlaying }}
                    </div>

                    <div class="mt-1 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        class="rounded bg-lime-400 px-1.5 py-0.5 font-black text-black"
                        @click="debugPlay"
                      >
                        play
                      </button>
                      <button
                        type="button"
                        class="rounded bg-lime-400 px-1.5 py-0.5 font-black text-black"
                        @click="debugPause"
                      >
                        pause
                      </button>
                      <button
                        type="button"
                        class="rounded bg-lime-400 px-1.5 py-0.5 font-black text-black"
                        @click="debugSeekStart"
                      >
                        seek start
                      </button>
                      <button
                        type="button"
                        class="rounded bg-lime-400 px-1.5 py-0.5 font-black text-black"
                        @click="debugLoadCurrent"
                      >
                        load
                      </button>
                      <button
                        type="button"
                        class="rounded border border-lime-400/60 px-1.5 py-0.5"
                        @click="copyPlaybackLog"
                      >
                        kopiuj log
                      </button>
                      <a
                        v-if="debugVideoUrl"
                        :href="debugVideoUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="rounded border border-lime-400/60 px-1.5 py-0.5 underline"
                      >
                        YouTube ↗
                      </a>
                    </div>

                    <div
                      class="mt-1 max-h-32 overflow-y-auto border-t border-lime-400/20 pt-1"
                    >
                      <div
                        v-for="(debugEvent, debugIndex) in [...playbackEvents].reverse()"
                        :key="`${debugEvent.at}-${debugIndex}`"
                        class="whitespace-pre-wrap break-words"
                      >
                        {{ debugEvent.at }} {{ debugEvent.message }}
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="isHost && localSong && activeRound"
                    class="absolute inset-x-0 bottom-0"
                  >
                    <UProgress
                      :model-value="playbackProgress"
                      color="primary"
                      size="xs"
                    />
                  </div>
                </div>

                <div
                  v-if="isAnswerVisible && roundSong"
                  class="border-t border-default px-5 py-5 text-center"
                >
                  <p
                    class="text-[10px] font-black uppercase tracking-[0.24em] text-brand-600 dark:text-brand-300"
                  >
                    {{ t("play.answer") }}
                  </p>
                  <p
                    class="mt-2 text-2xl font-black tracking-tight text-highlighted sm:text-3xl"
                  >
                    {{ roundSong.title }}
                  </p>
                  <p class="mt-1 text-lg font-semibold text-muted">
                    {{ roundSong.artist }}
                  </p>
                  <div
                    class="mt-3 flex flex-wrap items-center justify-center gap-2"
                  >
                    <UBadge
                      :label="String(roundSong.releaseYear)"
                      color="primary"
                      variant="solid"
                      size="lg"
                    />
                    <UBadge
                      :label="roundSong.categoryName"
                      color="neutral"
                      variant="subtle"
                      size="lg"
                    />
                  </div>

                  <div
                    v-if="
                      activeRound?.placement
                        && (activeRound.phase === 'revealed'
                          || activeRound.phase === 'scored')
                    "
                    class="mt-4 flex flex-wrap items-center justify-center gap-2"
                  >
                    <UBadge
                      v-if="placementCorrect !== null"
                      :label="
                        placementCorrect
                          ? t('room.placementCorrect')
                          : t('room.placementIncorrect')
                      "
                      :icon="
                        placementCorrect
                          ? 'i-lucide-circle-check'
                          : 'i-lucide-circle-x'
                      "
                      :color="placementCorrect ? 'success' : 'error'"
                      variant="solid"
                      size="lg"
                    />
                    <span class="text-xs font-semibold text-muted">
                      {{
                        t("room.placementSummary", {
                          position: (activeRound.placement?.position ?? 0) + 1,
                          total:
                            (activeTurnPlayer?.timeline.length ?? 0)
                            + (activeRound.phase === "scored" ? 0 : 1)
                        })
                      }}
                    </span>
                  </div>
                </div>

                <template #footer>
                  <div
                    class="flex flex-wrap items-center justify-between gap-3"
                  >
                    <p class="max-w-md text-sm text-muted">
                      {{ stageFooterHint }}
                    </p>

                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        v-if="!isHost && activeRound?.phase === 'listening'"
                        :label="t('room.hostOnlyDraw')"
                        icon="i-lucide-lock"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        disabled
                      />

                      <UButton
                        v-if="
                          isHost && room.status === 'playing' && !activeRound
                        "
                        :label="t('room.drawSong')"
                        icon="i-lucide-shuffle"
                        :loading="isDrawing || isPlaybackLoading"
                        @click="drawCurrentSong"
                      />

                      <UButton
                        v-if="
                          isHost
                            && activeRound?.phase === 'listening'
                            && localSong
                        "
                        :label="t('play.replayClip')"
                        icon="i-lucide-rotate-ccw"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="countdown !== null || isPlaybackLoading"
                        @click="replayClip"
                      />

                      <UButton
                        v-if="isHost && activeRound?.phase === 'listening'"
                        :label="t('room.revealSong')"
                        icon="i-lucide-eye"
                        color="primary"
                        :disabled="!placement"
                        :loading="isActing"
                        @click="revealActiveRound"
                      />

                      <UButton
                        v-if="isHost && activeRound?.phase === 'revealed'"
                        :label="t('room.cardOverride')"
                        icon="i-lucide-check"
                        color="success"
                        :loading="isActing"
                        @click="scoreCurrentRound"
                      />

                      <UButton
                        v-if="
                          isHost
                            && (activeRound?.phase === 'revealed'
                              || activeRound?.phase === 'scored')
                            && room.status !== 'finished'
                        "
                        :label="
                          activeRound?.phase === 'scored'
                            ? t('room.nextPlayer')
                            : t('room.skipCard')
                        "
                        :icon="
                          activeRound?.phase === 'scored'
                            ? 'i-lucide-arrow-right'
                            : 'i-lucide-x'
                        "
                        :color="
                          activeRound?.phase === 'scored'
                            ? 'primary'
                            : 'neutral'
                        "
                        :variant="
                          activeRound?.phase === 'scored' ? 'solid' : 'ghost'
                        "
                        :loading="isActing"
                        @click="requestSkipCurrentRound"
                      />
                    </div>
                  </div>
                </template>
              </UCard>
            </div>

            <aside class="space-y-5">
              <UCard :ui="{ body: 'p-4 sm:p-5' }">
                <template #header>
                  <div class="flex items-center justify-between gap-2">
                    <h2 class="font-black text-highlighted">
                      {{ t("room.players") }}
                    </h2>
                    <UBadge
                      :label="`${room.players.length}/${room.maxPlayers}`"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                </template>

                <div class="space-y-2">
                  <button
                    v-for="(player, index) in rankedPlayers"
                    :key="player.id"
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition"
                    :class="
                      player.id === selectedPlayerId
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-transparent hover:border-default hover:bg-muted/40'
                    "
                    @click="selectedPlayerId = player.id"
                  >
                    <span
                      class="w-5 shrink-0 text-center text-xs font-black text-muted"
                    >
                      {{ index + 1 }}
                    </span>
                    <span
                      class="flex size-8 shrink-0 items-center justify-center rounded-md bg-navy-800 text-[10px] font-black text-sun-400 dark:bg-sun-400 dark:text-navy-900"
                    >
                      {{ getPlayerInitials(player.name) }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-1">
                        <span
                          class="truncate text-sm font-bold text-highlighted"
                        >{{ player.name }}</span>
                        <UIcon
                          v-if="player.isHost"
                          name="i-lucide-crown"
                          class="size-3 shrink-0 text-brand-500"
                        />
                        <UBadge
                          v-if="activeRound && player.id === activeTurnPlayerId"
                          :label="t('room.guessingNowBadge')"
                          color="warning"
                          variant="subtle"
                          size="sm"
                        />
                        <UBadge
                          v-if="playerHasClaimed(player.id)"
                          :label="t('room.claimedBadge')"
                          icon="i-lucide-hand"
                          color="success"
                          variant="subtle"
                          size="sm"
                        />
                      </span>
                      <span
                        class="flex items-center gap-2 text-[11px] font-semibold text-muted"
                      >
                        <span>{{
                          t("room.cardsShort", {
                            cards: player.timeline.length
                          })
                        }}</span>
                        <span class="inline-flex items-center gap-0.5">
                          <UIcon
                            name="i-lucide-ticket"
                            class="size-3 text-brand-500"
                          />
                          {{ player.tokens }}
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              </UCard>

              <UCard :ui="{ body: 'p-4 sm:p-5' }">
                <template #header>
                  <h2 class="font-black text-highlighted">
                    {{ t("room.gameInfo") }}
                  </h2>
                </template>

                <div class="space-y-3 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted">{{
                      t("create.clipDuration")
                    }}</span>
                    <span class="font-black text-highlighted">{{ room.settings.clipSeconds }} s</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted">{{ t("create.category") }}</span>
                    <span
                      class="truncate text-right font-black text-highlighted"
                    >{{
                      room.settings.categoryName ?? t("create.allCategories")
                    }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted">{{
                      t("create.targetCards")
                    }}</span>
                    <span class="font-black text-highlighted">{{
                      room.settings.targetCards
                    }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-muted">{{ t("room.host") }}</span>
                    <span
                      class="truncate text-right font-black text-highlighted"
                    >{{ room.hostName }}</span>
                  </div>
                </div>

                <UAlert
                  v-if="room.status === 'finished'"
                  class="mt-4"
                  color="success"
                  variant="subtle"
                  icon="i-lucide-trophy"
                  :title="
                    t('room.winnerTitle', { name: room.winnerName ?? '' })
                  "
                  :description="
                    t('room.winnerHint', { name: room.winnerName ?? '' })
                  "
                />

                <UButton
                  v-if="isHost && room.status === 'playing' && !activeRound"
                  class="mt-4"
                  :label="t('room.drawSong')"
                  icon="i-lucide-shuffle"
                  size="lg"
                  block
                  :loading="isDrawing || isPlaybackLoading"
                  @click="drawCurrentSong"
                />

                <p
                  v-if="isHost"
                  class="mt-3 text-xs font-semibold text-muted"
                >
                  {{ t("room.hostDrawInfo") }}
                </p>
              </UCard>

              <UCard :ui="{ body: 'p-4 sm:p-5' }">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p
                      class="text-[10px] font-black uppercase tracking-[0.2em] text-muted"
                    >
                      {{ t("room.code") }}
                    </p>
                    <p
                      class="mt-1 font-mono text-2xl font-black tracking-[0.22em] text-highlighted"
                    >
                      {{ room.code }}
                    </p>
                  </div>
                  <UButton
                    :aria-label="t('room.copy')"
                    icon="i-lucide-copy"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="copyCode"
                  />
                </div>
                <p class="mt-2 text-xs text-muted">
                  {{ t("room.lateJoinHint") }}
                </p>
              </UCard>
            </aside>
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="room?.status === 'playing' && currentSession"
      class="fixed bottom-24 right-3 z-30 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-default/80 bg-default/90 px-3 py-2 text-xs font-bold text-highlighted shadow-lg backdrop-blur-xl sm:right-5"
    >
      <span
        class="flex size-7 items-center justify-center rounded-full"
        :class="musicLive ? 'bg-brand-500 text-white' : 'bg-muted text-muted'"
      >
        <UIcon
          :name="musicLive ? 'i-lucide-audio-lines' : 'i-lucide-volume-x'"
          class="size-3.5"
          :class="musicLive ? 'animate-pulse' : ''"
        />
      </span>
      {{ musicLabel }}
    </div>

    <RoomBottomBar
      v-if="selfPlayer"
      :player="selfPlayer"
      :is-current="canPlaceCard"
      @open-timeline="timelineOpen = true"
      @leave="leaveOpen = true"
    />

    <MyTimelineDrawer
      v-model:open="timelineOpen"
      :player="selfPlayer"
      :target-cards="room?.settings.targetCards ?? 10"
      :rank="selfRank"
      :players-count="room?.players.length ?? 0"
    />

    <UModal
      v-model:open="isTokenYearOpen"
      :title="t('room.tokenYearTitle')"
      :description="t('room.tokenYearHint')"
    >
      <template #body>
        <label class="block text-xs font-bold text-muted">
          {{ t('room.tokenYearLabel') }}
          <UInput
            v-model="tokenYearInput"
            type="number"
            min="1900"
            max="2100"
            inputmode="numeric"
            :placeholder="t('room.tokenYearPlaceholder')"
            class="mt-1 w-full"
            autofocus
            @keydown.enter="submitTokenYear"
          />
        </label>
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            :label="t('room.leaveStay')"
            color="neutral"
            variant="ghost"
            :disabled="isSubmittingTokenYear"
            @click="isTokenYearOpen = false"
          />
          <UButton
            :label="t('room.tokenYearSubmit')"
            icon="i-lucide-swords"
            color="warning"
            :disabled="!isTokenYearValid || isSubmittingTokenYear"
            :loading="isSubmittingTokenYear"
            @click="submitTokenYear"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isSkipConfirmOpen"
      :title="t('room.noTokensTitle')"
      :description="t('room.noTokensHint')"
    >
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            :label="t('room.noTokensStay')"
            color="neutral"
            variant="ghost"
            :disabled="isActing"
            @click="isSkipConfirmOpen = false"
          />
          <UButton
            :label="t('room.noTokensConfirm')"
            icon="i-lucide-arrow-right"
            color="primary"
            :loading="isActing"
            @click="skipCurrentRound"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="leaveOpen"
      :title="t('room.leaveConfirmTitle')"
      :description="t('room.leaveConfirmHint')"
    >
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            :label="t('room.leaveStay')"
            color="neutral"
            variant="ghost"
            :disabled="isLeaving"
            @click="leaveOpen = false"
          />
          <UButton
            :label="t('room.leaveConfirm')"
            icon="i-lucide-log-out"
            color="error"
            :loading="isLeaving"
            @click="leaveCurrentRoom"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

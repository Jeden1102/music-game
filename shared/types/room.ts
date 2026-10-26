export const CLIP_SECONDS_OPTIONS = [5, 10, 15, 30] as const
export const TARGET_CARDS_OPTIONS = [5, 7, 10, 15] as const

export type ClipSeconds = (typeof CLIP_SECONDS_OPTIONS)[number]
export type TargetCards = (typeof TARGET_CARDS_OPTIONS)[number]
export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type RoundPhase = 'listening' | 'revealed' | 'scored'

export interface RoomSettings {
  clipSeconds: ClipSeconds
  categoryId: number | null
  categoryName: string | null
  targetCards: TargetCards
}

export interface RoomCategory {
  id: number
  name: string
  songCount: number
}

export interface TimelineCard {
  id: number
  title: string
  artist: string
  releaseYear: number
  categoryName: string
  addedAt: string
}

export interface RoundSong {
  id: number
  title: string
  artist: string
  releaseYear: number
  youtubeId: string
  startTime: number
  categoryName: string
}

export interface RoomPlayer {
  id: string
  name: string
  isHost: boolean
  joinedAt: string
  timeline: TimelineCard[]
  tokens: number
}

export interface RoundPlacement {
  playerId: string
  position: number
  submittedAt: string
}

export interface RoundTokenPlacement {
  playerId: string
  playerName: string
  position: number
  placedAt: string
  /** Own guesses are visible immediately; other guesses are hidden until the reveal. */
  yearGuess: number | null
  yearGuessSubmitted: boolean
}

export interface RoundTokenDuel {
  position: number
  winnerId: string
  winnerName: string
  cardWon: boolean
  guesses: Array<{
    playerId: string
    playerName: string
    year: number
  }>
}

export interface RoundTokenResult {
  playerId: string
  playerName: string
  position: number
  cardWon: boolean
  tokenWon: boolean
  duel: boolean
}

export interface ActiveRound {
  id: string
  phase: RoundPhase
  playerId: string
  playerName: string
  startedAt: string
  clipEndedAt: string | null
  revealedAt: string | null
  scoredAt: string | null
  /** Players who pressed “I know the song” during this round. */
  claims: string[]
  /** Players who already received a token for a correct artist/title guess. */
  tokenAwards: string[]
  /** Tokens wagered on slots of the active player's timeline. */
  tokenPlacements: RoundTokenPlacement[]
  /** Year duels caused by multiple tokens on the same slot. */
  tokenDuels: RoundTokenDuel[]
  /** Final outcome of every wagered token. */
  tokenResults: RoundTokenResult[]
  /** The slot chosen by the active player. The host may reveal only after it is confirmed. */
  placement: RoundPlacement | null
  /** Whether the confirmed slot matched the song's release year. Null until the round is revealed. */
  placementCorrect: boolean | null
  /**
   * The song is only sent to the host while the clip is playing.
   * Once the round is revealed, every player receives the metadata.
   */
  song: RoundSong | null
}

export interface Room {
  code: string
  hostName: string
  createdAt: string
  status: RoomStatus
  settings: RoomSettings
  players: RoomPlayer[]
  maxPlayers: number
  currentPlayerId: string | null
  currentPlayerName: string | null
  activeRound: ActiveRound | null
  winnerId: string | null
  winnerName: string | null
}

export interface RoomMembership {
  room: Room
  playerId: string
}

export interface CreateRoomInput {
  name: string
  clipSeconds?: number
  categoryId?: number | null
  targetCards?: number
}

export interface JoinRoomInput {
  name: string
}

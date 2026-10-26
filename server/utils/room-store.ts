import { randomInt, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../../lib/prisma'
import type {
  ActiveRound,
  Room,
  RoomMembership,
  RoomSettings,
  RoundSong,
  RoundTokenDuel,
  RoundTokenPlacement,
  RoundTokenResult,
  TimelineCard
} from '#shared/types/room'
import { isValidRoomCode, normalizeRoomCode } from '#shared/utils/room'

const ROOM_TTL_MS = 12 * 60 * 60 * 1000
const MAX_PLAYERS = 8
const STARTING_TOKENS = 0
const TRANSACTION_RETRIES = 3
const isMySql = (process.env.DATABASE_URL ?? '').startsWith('mysql')

interface PlayerRecord {
  id: string
  name: string
  isHost: boolean
  joinedAt: string
  seat: number
  timeline: TimelineCard[]
  tokens: number
}

interface TokenPlacementRecord {
  playerId: string
  position: number
  placedAt: string
  yearGuess: number | null
}

interface ActiveRoundRecord {
  id: string
  phase: ActiveRound['phase']
  playerId: string
  startedAt: string
  clipEndedAt: string | null
  revealedAt: string | null
  scoredAt: string | null
  claims: string[]
  tokenAwards: string[]
  tokenPlacements: TokenPlacementRecord[]
  tokenDuels: RoundTokenDuel[]
  tokenResults: RoundTokenResult[]
  placement: ActiveRound['placement']
  placementCorrect: boolean | null
  song: RoundSong
}

interface RoomRecord {
  code: string
  hostId: string
  hostName: string
  createdAt: string
  expiresAt: string
  revision: number
  status: Room['status']
  settings: RoomSettings
  players: PlayerRecord[]
  currentPlayerId: string
  activeRound: ActiveRoundRecord | null
  usedSongIds: Set<number>
  winnerId: string | null
}

interface JoinRoomSuccess {
  ok: true
  membership: RoomMembership
}

interface JoinRoomFailure {
  ok: false
  reason: 'ROOM_NOT_FOUND' | 'ROOM_FULL'
}

export type JoinRoomResult = JoinRoomSuccess | JoinRoomFailure

export type RoomActionFailureReason
  = | 'ROOM_NOT_FOUND'
    | 'PLAYER_NOT_FOUND'
    | 'NOT_HOST'
    | 'NOT_ACTIVE_PLAYER'
    | 'ACTIVE_PLAYER_CANNOT_CLAIM'
    | 'INVALID_STATE'
    | 'ROUND_ACTIVE'
    | 'GAME_FINISHED'
    | 'NO_SONG'
    | 'ALREADY_PLACED'
    | 'PLACEMENT_REQUIRED'
    | 'TOKEN_ALREADY_AWARDED'
    | 'NO_TOKENS'
    | 'TOKEN_ALREADY_PLACED'
    | 'ACTIVE_PLAYER_CANNOT_BET'
    | 'TOKEN_YEAR_REQUIRED'
    | 'TOKEN_YEAR_ALREADY_SET'
    | 'TOKEN_YEAR_INVALID'
    | 'TOKEN_NOT_IN_DUEL'

export type RoomActionResult
  = | { ok: true, room: Room }
    | { ok: false, reason: RoomActionFailureReason }

type DbClient = Prisma.TransactionClient | typeof prisma
type RoomMutation = (room: RoomRecord) => RoomActionFailureReason | null | undefined

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2034'
}

async function runSerializable<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000
      })
    } catch (error) {
      if (attempt < TRANSACTION_RETRIES - 1 && isRetryableTransactionError(error)) {
        continue
      }

      throw error
    }
  }

  throw new Error('The room transaction could not be completed.')
}

/**
 * Serialises read-modify-write cycles for one room. InnoDB locks the room row
 * until commit, so parallel token/claim requests cannot overwrite each other.
 */
async function lockRoom(tx: Prisma.TransactionClient, code: string): Promise<void> {
  if (!isMySql) {
    return
  }

  await tx.$queryRaw`SELECT code FROM Room WHERE code = ${code} FOR UPDATE`
}

function findPlayer(room: RoomRecord, playerId: string | null): PlayerRecord | null {
  return room.players.find(player => player.id === playerId) ?? null
}

function toPublicRoom(room: RoomRecord, viewerId?: string | null): Room {
  const viewerIsHost = viewerId === room.hostId
  const roundPlayer = room.activeRound
    ? findPlayer(room, room.activeRound.playerId)
    : null
  const currentPlayerId = room.activeRound?.playerId ?? room.currentPlayerId
  const currentPlayer = findPlayer(room, currentPlayerId)
  const winner = findPlayer(room, room.winnerId)

  const activeRound: ActiveRound | null = room.activeRound
    ? {
        id: room.activeRound.id,
        phase: room.activeRound.phase,
        playerId: room.activeRound.playerId,
        playerName: roundPlayer?.name ?? '',
        startedAt: room.activeRound.startedAt,
        clipEndedAt: room.activeRound.clipEndedAt,
        revealedAt: room.activeRound.revealedAt,
        scoredAt: room.activeRound.scoredAt,
        claims: [...room.activeRound.claims],
        tokenAwards: [...room.activeRound.tokenAwards],
        tokenPlacements: room.activeRound.tokenPlacements.map((placement) => {
          const placementPlayer = findPlayer(room, placement.playerId)
          const canSeeYear = placement.playerId === viewerId
            || room.activeRound?.phase !== 'listening'

          return {
            playerId: placement.playerId,
            playerName: placementPlayer?.name ?? '',
            position: placement.position,
            placedAt: placement.placedAt,
            yearGuess: canSeeYear ? placement.yearGuess : null,
            yearGuessSubmitted: placement.yearGuess !== null
          } satisfies RoundTokenPlacement
        }),
        tokenDuels: room.activeRound.phase === 'listening'
          ? []
          : room.activeRound.tokenDuels.map(duel => ({
              ...duel,
              guesses: duel.guesses.map(guess => ({ ...guess }))
            })),
        tokenResults: room.activeRound.phase === 'listening'
          ? []
          : room.activeRound.tokenResults.map(result => ({ ...result })),
        placement: room.activeRound.placement
          ? { ...room.activeRound.placement }
          : null,
        placementCorrect: room.activeRound.placementCorrect,
        song: viewerIsHost || room.activeRound.phase !== 'listening'
          ? { ...room.activeRound.song }
          : null
      }
    : null

  return {
    code: room.code,
    hostName: room.hostName,
    createdAt: room.createdAt,
    revision: room.revision,
    status: room.status,
    settings: { ...room.settings },
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      joinedAt: player.joinedAt,
      timeline: player.timeline.map(card => ({ ...card })),
      tokens: player.tokens
    })),
    maxPlayers: MAX_PLAYERS,
    currentPlayerId,
    currentPlayerName: currentPlayer?.name ?? null,
    activeRound,
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? null
  }
}

function getNextPlayerId(room: RoomRecord, playerId: string): string {
  const index = room.players.findIndex(player => player.id === playerId)

  if (index < 0) {
    return room.players[0]?.id ?? room.hostId
  }

  return room.players[(index + 1) % room.players.length]?.id ?? room.hostId
}

async function generateRoomCode(db: DbClient): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = String(randomInt(1000, 10000))
    const existing = await db.room.findUnique({
      where: { code },
      select: { code: true }
    })

    if (!existing) {
      return code
    }
  }

  throw new Error('No room code is available.')
}

function mapPlayerRecord(player: {
  id: string
  name: string
  isHost: boolean
  joinedAt: Date
  seat: number
  tokens: number
  timeline: Array<{
    songId: number
    title: string
    artist: string
    releaseYear: number
    categoryName: string
    addedAt: Date
  }>
}): PlayerRecord {
  return {
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    joinedAt: player.joinedAt.toISOString(),
    seat: player.seat,
    tokens: player.tokens,
    timeline: player.timeline.map(card => ({
      id: card.songId,
      title: card.title,
      artist: card.artist,
      releaseYear: card.releaseYear,
      categoryName: card.categoryName,
      addedAt: card.addedAt.toISOString()
    }))
  }
}

async function loadRoomRecord(db: DbClient, code: string): Promise<RoomRecord | null> {
  const room = await db.room.findUnique({
    where: { code },
    include: {
      players: {
        orderBy: { seat: 'asc' },
        include: {
          timeline: {
            orderBy: { position: 'asc' }
          }
        }
      },
      usedSongs: true
    }
  })

  if (!room || room.expiresAt.getTime() <= Date.now()) {
    return null
  }

  const players = room.players.map(mapPlayerRecord)
  const playerNames = new Map(players.map(player => [player.id, player.name]))
  const round = room.activeRoundId
    ? await db.roomRound.findUnique({
        where: { id: room.activeRoundId },
        include: {
          claims: { orderBy: { createdAt: 'asc' } },
          tokenAwards: { orderBy: { createdAt: 'asc' } },
          tokenPlacements: { orderBy: { sequence: 'asc' } },
          tokenDuels: {
            orderBy: { sequence: 'asc' },
            include: {
              guesses: { orderBy: { sequence: 'asc' } }
            }
          },
          tokenResults: { orderBy: { sequence: 'asc' } }
        }
      })
    : null

  const activeRound: ActiveRoundRecord | null = round
    ? {
        id: round.id,
        phase: round.phase as ActiveRound['phase'],
        playerId: round.playerId,
        startedAt: round.startedAt.toISOString(),
        clipEndedAt: round.clipEndedAt?.toISOString() ?? null,
        revealedAt: round.revealedAt?.toISOString() ?? null,
        scoredAt: round.scoredAt?.toISOString() ?? null,
        claims: round.claims.map(claim => claim.playerId),
        tokenAwards: round.tokenAwards.map(award => award.playerId),
        tokenPlacements: round.tokenPlacements.map(placement => ({
          playerId: placement.playerId,
          position: placement.position,
          placedAt: placement.placedAt.toISOString(),
          yearGuess: placement.yearGuess
        })),
        tokenDuels: round.tokenDuels.map(duel => ({
          position: duel.position,
          winnerId: duel.winnerId,
          winnerName: playerNames.get(duel.winnerId) ?? '',
          cardWon: duel.cardWon,
          guesses: duel.guesses.map(guess => ({
            playerId: guess.playerId,
            playerName: playerNames.get(guess.playerId) ?? '',
            year: guess.year
          }))
        })),
        tokenResults: round.tokenResults.map(result => ({
          playerId: result.playerId,
          playerName: playerNames.get(result.playerId) ?? '',
          position: result.position,
          cardWon: result.cardWon,
          tokenWon: result.tokenWon,
          duel: result.duel
        })),
        placement: round.placementPosition !== null && round.placementSubmittedAt
          ? {
              playerId: round.playerId,
              position: round.placementPosition,
              submittedAt: round.placementSubmittedAt.toISOString()
            }
          : null,
        placementCorrect: round.placementCorrect,
        song: {
          id: round.songId,
          title: round.songTitle,
          artist: round.songArtist,
          releaseYear: round.songReleaseYear,
          youtubeId: round.songYoutubeId,
          startTime: round.songStartTime,
          categoryName: round.songCategoryName
        }
      }
    : null

  return {
    code: room.code,
    hostId: room.hostId,
    hostName: room.hostName,
    createdAt: room.createdAt.toISOString(),
    expiresAt: room.expiresAt.toISOString(),
    revision: room.revision,
    status: room.status as Room['status'],
    settings: {
      clipSeconds: room.clipSeconds as RoomSettings['clipSeconds'],
      categoryId: room.categoryId,
      categoryName: room.categoryName,
      targetCards: room.targetCards as RoomSettings['targetCards']
    },
    players,
    currentPlayerId: room.currentPlayerId ?? room.hostId,
    activeRound,
    usedSongIds: new Set(room.usedSongs.map(item => item.songId)),
    winnerId: room.winnerId
  }
}

async function saveRoundRecord(
  db: Prisma.TransactionClient,
  roomCode: string,
  round: ActiveRoundRecord
): Promise<void> {
  const roundData = {
    roomCode,
    phase: round.phase,
    playerId: round.playerId,
    startedAt: new Date(round.startedAt),
    clipEndedAt: round.clipEndedAt ? new Date(round.clipEndedAt) : null,
    revealedAt: round.revealedAt ? new Date(round.revealedAt) : null,
    scoredAt: round.scoredAt ? new Date(round.scoredAt) : null,
    placementPosition: round.placement?.position ?? null,
    placementSubmittedAt: round.placement ? new Date(round.placement.submittedAt) : null,
    placementCorrect: round.placementCorrect,
    songId: round.song.id,
    songTitle: round.song.title,
    songArtist: round.song.artist,
    songReleaseYear: round.song.releaseYear,
    songYoutubeId: round.song.youtubeId,
    songStartTime: round.song.startTime,
    songCategoryName: round.song.categoryName
  }

  await db.roomRound.upsert({
    where: { id: round.id },
    create: { id: round.id, ...roundData },
    update: roundData
  })

  await db.roomRoundClaim.deleteMany({ where: { roundId: round.id } })
  await db.roomRoundTokenAward.deleteMany({ where: { roundId: round.id } })
  await db.roomRoundTokenPlacement.deleteMany({ where: { roundId: round.id } })
  await db.roomRoundTokenDuel.deleteMany({ where: { roundId: round.id } })
  await db.roomRoundTokenResult.deleteMany({ where: { roundId: round.id } })

  if (round.claims.length > 0) {
    await db.roomRoundClaim.createMany({
      data: round.claims.map(playerId => ({ roundId: round.id, playerId }))
    })
  }

  if (round.tokenAwards.length > 0) {
    await db.roomRoundTokenAward.createMany({
      data: round.tokenAwards.map(playerId => ({ roundId: round.id, playerId }))
    })
  }

  if (round.tokenPlacements.length > 0) {
    await db.roomRoundTokenPlacement.createMany({
      data: round.tokenPlacements.map((placement, sequence) => ({
        roundId: round.id,
        playerId: placement.playerId,
        position: placement.position,
        sequence,
        placedAt: new Date(placement.placedAt),
        yearGuess: placement.yearGuess
      }))
    })
  }

  for (const [sequence, duel] of round.tokenDuels.entries()) {
    await db.roomRoundTokenDuel.create({
      data: {
        id: randomUUID(),
        roundId: round.id,
        position: duel.position,
        sequence,
        winnerId: duel.winnerId,
        cardWon: duel.cardWon,
        guesses: {
          create: duel.guesses.map((guess, guessIndex) => ({
            playerId: guess.playerId,
            year: guess.year,
            sequence: guessIndex
          }))
        }
      }
    })
  }

  if (round.tokenResults.length > 0) {
    await db.roomRoundTokenResult.createMany({
      data: round.tokenResults.map((result, sequence) => ({
        roundId: round.id,
        playerId: result.playerId,
        position: result.position,
        sequence,
        cardWon: result.cardWon,
        tokenWon: result.tokenWon,
        duel: result.duel
      }))
    })
  }
}

async function saveRoomRecord(
  db: Prisma.TransactionClient,
  room: RoomRecord
): Promise<void> {
  const nextRevision = room.revision + 1
  const roomData = {
    hostId: room.hostId,
    hostName: room.hostName,
    expiresAt: new Date(room.expiresAt),
    revision: nextRevision,
    status: room.status,
    clipSeconds: room.settings.clipSeconds,
    categoryId: room.settings.categoryId,
    categoryName: room.settings.categoryName,
    targetCards: room.settings.targetCards,
    currentPlayerId: room.currentPlayerId,
    winnerId: room.winnerId,
    activeRoundId: room.activeRound?.id ?? null
  }

  await db.room.upsert({
    where: { code: room.code },
    create: {
      code: room.code,
      createdAt: new Date(room.createdAt),
      ...roomData
    },
    update: roomData
  })

  const playerIds = room.players.map(player => player.id)

  if (playerIds.length > 0) {
    await db.roomPlayer.deleteMany({
      where: {
        roomCode: room.code,
        id: { notIn: playerIds }
      }
    })
  } else {
    await db.roomPlayer.deleteMany({ where: { roomCode: room.code } })
  }

  for (const player of room.players) {
    const playerData = {
      roomCode: room.code,
      name: player.name,
      isHost: player.isHost,
      joinedAt: new Date(player.joinedAt),
      seat: player.seat,
      tokens: player.tokens
    }

    await db.roomPlayer.upsert({
      where: { id: player.id },
      create: { id: player.id, ...playerData },
      update: playerData
    })

    await db.timelineEntry.deleteMany({ where: { playerId: player.id } })

    if (player.timeline.length > 0) {
      await db.timelineEntry.createMany({
        data: player.timeline.map((card, position) => ({
          playerId: player.id,
          position,
          songId: card.id,
          title: card.title,
          artist: card.artist,
          releaseYear: card.releaseYear,
          categoryName: card.categoryName,
          addedAt: new Date(card.addedAt)
        }))
      })
    }
  }

  if (room.usedSongIds.size > 0) {
    const usedSongIds = [...room.usedSongIds]
    const existingSongs = await db.roomUsedSong.findMany({
      where: {
        roomCode: room.code,
        songId: { in: usedSongIds }
      },
      select: { songId: true }
    })
    const existingIds = new Set(existingSongs.map(item => item.songId))
    const missingIds = usedSongIds.filter(songId => !existingIds.has(songId))

    if (missingIds.length > 0) {
      await db.roomUsedSong.createMany({
        data: missingIds.map(songId => ({
          roomCode: room.code,
          songId
        }))
      })
    }
  }

  if (room.activeRound) {
    await saveRoundRecord(db, room.code, room.activeRound)
  }

  room.revision = nextRevision
}

async function mutateRoom(
  code: string,
  viewerId: string | null,
  mutation: RoomMutation
): Promise<RoomActionResult> {
  const normalizedCode = normalizeRoomCode(code)

  if (!isValidRoomCode(normalizedCode)) {
    return { ok: false, reason: 'ROOM_NOT_FOUND' }
  }

  return runSerializable(async (tx) => {
    await lockRoom(tx, normalizedCode)
    const room = await loadRoomRecord(tx, normalizedCode)

    if (!room) {
      return { ok: false, reason: 'ROOM_NOT_FOUND' }
    }

    const failure = mutation(room)

    if (failure) {
      return { ok: false, reason: failure }
    }

    await saveRoomRecord(tx, room)

    return { ok: true, room: toPublicRoom(room, viewerId) }
  })
}

export async function createRoom(
  hostName: string,
  settings: RoomSettings
): Promise<RoomMembership> {
  const now = new Date()
  const createdAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + ROOM_TTL_MS)
  const hostId = randomUUID()

  return runSerializable(async (tx) => {
    await tx.room.deleteMany({ where: { expiresAt: { lt: now } } })
    const code = await generateRoomCode(tx)
    const room: RoomRecord = {
      code,
      hostId,
      hostName,
      createdAt,
      expiresAt: expiresAt.toISOString(),
      revision: 0,
      status: 'lobby',
      settings: { ...settings },
      players: [
        {
          id: hostId,
          name: hostName,
          isHost: true,
          joinedAt: createdAt,
          seat: 0,
          timeline: [],
          tokens: STARTING_TOKENS
        }
      ],
      currentPlayerId: hostId,
      activeRound: null,
      usedSongIds: new Set(),
      winnerId: null
    }

    await saveRoomRecord(tx, room)

    return {
      room: toPublicRoom(room, hostId),
      playerId: hostId
    }
  })
}

export async function getRoom(
  code: string,
  viewerId?: string | null
): Promise<Room | null> {
  const normalizedCode = normalizeRoomCode(code)

  if (!isValidRoomCode(normalizedCode)) {
    return null
  }

  const room = await loadRoomRecord(prisma, normalizedCode)

  return room ? toPublicRoom(room, viewerId) : null
}

/**
 * Builds one room snapshot for many socket viewers from a single database
 * read. Each snapshot still applies the per-viewer visibility rules.
 */
export async function getRoomViews(
  code: string,
  viewerIds: Array<string | null>
): Promise<Room[]> {
  const normalizedCode = normalizeRoomCode(code)

  if (!isValidRoomCode(normalizedCode)) {
    return []
  }

  const room = await loadRoomRecord(prisma, normalizedCode)

  return room ? viewerIds.map(viewerId => toPublicRoom(room, viewerId)) : []
}

export async function getUsedSongIdsForHost(
  code: string,
  hostId: string
): Promise<Set<number> | null> {
  const normalizedCode = normalizeRoomCode(code)

  if (!isValidRoomCode(normalizedCode)) {
    return null
  }

  const room = await loadRoomRecord(prisma, normalizedCode)

  if (!room || room.hostId !== hostId) {
    return null
  }

  return new Set(room.usedSongIds)
}

export async function joinRoom(
  code: string,
  playerName: string
): Promise<JoinRoomResult> {
  const normalizedCode = normalizeRoomCode(code)

  if (!isValidRoomCode(normalizedCode)) {
    return { ok: false, reason: 'ROOM_NOT_FOUND' }
  }

  return runSerializable(async (tx) => {
    await lockRoom(tx, normalizedCode)
    const room = await loadRoomRecord(tx, normalizedCode)

    if (!room) {
      return { ok: false, reason: 'ROOM_NOT_FOUND' }
    }

    if (room.players.length >= MAX_PLAYERS) {
      return { ok: false, reason: 'ROOM_FULL' }
    }

    const playerId = randomUUID()
    const nextSeat = room.players.reduce(
      (highest, player) => Math.max(highest, player.seat),
      -1
    ) + 1

    room.players.push({
      id: playerId,
      name: playerName,
      isHost: false,
      joinedAt: new Date().toISOString(),
      seat: nextSeat,
      timeline: [],
      tokens: STARTING_TOKENS
    })

    await saveRoomRecord(tx, room)

    return {
      ok: true,
      membership: {
        room: toPublicRoom(room, playerId),
        playerId
      }
    }
  })
}

function createActiveRound(playerId: string, song: RoundSong): ActiveRoundRecord {
  return {
    id: randomUUID(),
    phase: 'listening',
    playerId,
    startedAt: new Date().toISOString(),
    clipEndedAt: null,
    revealedAt: null,
    scoredAt: null,
    claims: [],
    tokenAwards: [],
    tokenPlacements: [],
    tokenDuels: [],
    tokenResults: [],
    placement: null,
    placementCorrect: null,
    song: { ...song }
  }
}

function refundTokenPlacements(room: RoomRecord): void {
  for (const placement of room.activeRound?.tokenPlacements ?? []) {
    const player = findPlayer(room, placement.playerId)

    if (player) {
      player.tokens += 1
    }
  }
}

export async function startRoom(
  code: string,
  hostId: string,
  startingCards: TimelineCard[]
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (room.status !== 'lobby') {
      return 'INVALID_STATE'
    }

    room.players.forEach((player, index) => {
      const startingCard = startingCards[index]

      player.timeline = startingCard ? [{ ...startingCard }] : []
      player.tokens = STARTING_TOKENS
    })

    room.usedSongIds = new Set(
      room.players.flatMap(player => player.timeline.map(card => card.id))
    )
    room.status = 'playing'
    room.activeRound = null
    room.winnerId = null

    const firstPlayer = room.players[randomInt(room.players.length)]
    room.currentPlayerId = firstPlayer?.id ?? room.hostId
  })
}

export async function drawRound(
  code: string,
  hostId: string,
  candidates: RoundSong[]
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (room.status === 'finished') {
      return 'GAME_FINISHED'
    }

    if (room.status !== 'playing') {
      return 'INVALID_STATE'
    }

    if (room.activeRound) {
      return 'ROUND_ACTIVE'
    }

    const availableSongs = candidates.filter(song => !room.usedSongIds.has(song.id))

    if (availableSongs.length === 0) {
      return 'NO_SONG'
    }

    const song = availableSongs[randomInt(availableSongs.length)]!

    room.usedSongIds.add(song.id)
    room.activeRound = createActiveRound(room.currentPlayerId, song)
  })
}

export async function redrawRound(
  code: string,
  hostId: string,
  candidates: RoundSong[]
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (room.status === 'finished') {
      return 'GAME_FINISHED'
    }

    if (room.status !== 'playing' || !room.activeRound || room.activeRound.phase !== 'listening') {
      return 'INVALID_STATE'
    }

    if (
      room.activeRound.clipEndedAt
      || room.activeRound.claims.length > 0
      || room.activeRound.placement
    ) {
      return 'INVALID_STATE'
    }

    const availableSongs = candidates.filter(song => !room.usedSongIds.has(song.id))

    if (availableSongs.length === 0) {
      return 'NO_SONG'
    }

    const song = availableSongs[randomInt(availableSongs.length)]!

    room.usedSongIds.add(song.id)
    refundTokenPlacements(room)
    room.activeRound = createActiveRound(room.activeRound.playerId, song)
  })
}

export async function markClipEnded(
  code: string,
  hostId: string
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (!room.activeRound || room.activeRound.phase !== 'listening') {
      return 'INVALID_STATE'
    }

    if (!room.activeRound.clipEndedAt) {
      room.activeRound.clipEndedAt = new Date().toISOString()
    }
  })
}

export async function claimRoundSong(
  code: string,
  playerId: string
): Promise<RoomActionResult> {
  return mutateRoom(code, playerId, (room) => {
    if (!findPlayer(room, playerId)) {
      return 'PLAYER_NOT_FOUND'
    }

    if (room.status !== 'playing') {
      return room.status === 'finished' ? 'GAME_FINISHED' : 'INVALID_STATE'
    }

    if (!room.activeRound || room.activeRound.phase !== 'listening') {
      return 'INVALID_STATE'
    }

    if (room.activeRound.playerId === playerId) {
      return 'ACTIVE_PLAYER_CANNOT_CLAIM'
    }

    if (room.activeRound.clipEndedAt) {
      return 'INVALID_STATE'
    }

    if (!room.activeRound.claims.includes(playerId)) {
      room.activeRound.claims.push(playerId)
    }
  })
}

export async function placeRoundCard(
  code: string,
  playerId: string,
  position: number
): Promise<RoomActionResult> {
  return mutateRoom(code, playerId, (room) => {
    const player = findPlayer(room, playerId)

    if (!player) {
      return 'PLAYER_NOT_FOUND'
    }

    if (room.status !== 'playing') {
      return room.status === 'finished' ? 'GAME_FINISHED' : 'INVALID_STATE'
    }

    if (!room.activeRound || room.activeRound.phase !== 'listening') {
      return 'INVALID_STATE'
    }

    if (room.activeRound.playerId !== playerId) {
      return 'NOT_ACTIVE_PLAYER'
    }

    if (room.activeRound.placement) {
      return 'ALREADY_PLACED'
    }

    if (!Number.isInteger(position) || position < 0 || position > player.timeline.length) {
      return 'INVALID_STATE'
    }

    room.activeRound.placement = {
      playerId,
      position,
      submittedAt: new Date().toISOString()
    }
  })
}

export async function placeRoundToken(
  code: string,
  playerId: string,
  position: number
): Promise<RoomActionResult> {
  return mutateRoom(code, playerId, (room) => {
    const player = findPlayer(room, playerId)

    if (!player) {
      return 'PLAYER_NOT_FOUND'
    }

    if (room.status !== 'playing') {
      return room.status === 'finished' ? 'GAME_FINISHED' : 'INVALID_STATE'
    }

    const round = room.activeRound

    if (!round || round.phase !== 'listening') {
      return 'INVALID_STATE'
    }

    if (round.playerId === playerId) {
      return 'ACTIVE_PLAYER_CANNOT_BET'
    }

    if (player.tokens <= 0) {
      return 'NO_TOKENS'
    }

    if (round.tokenPlacements.some(placement => placement.playerId === playerId)) {
      return 'TOKEN_ALREADY_PLACED'
    }

    const activePlayer = findPlayer(room, round.playerId)

    if (
      !activePlayer
      || !Number.isInteger(position)
      || position < 0
      || position > activePlayer.timeline.length
    ) {
      return 'INVALID_STATE'
    }

    player.tokens -= 1
    round.tokenPlacements.push({
      playerId,
      position,
      placedAt: new Date().toISOString(),
      yearGuess: null
    })
  })
}

export async function submitTokenYear(
  code: string,
  playerId: string,
  year: number
): Promise<RoomActionResult> {
  return mutateRoom(code, playerId, (room) => {
    if (!findPlayer(room, playerId)) {
      return 'PLAYER_NOT_FOUND'
    }

    const round = room.activeRound

    if (room.status !== 'playing' || !round || round.phase !== 'listening') {
      return room.status === 'finished' ? 'GAME_FINISHED' : 'INVALID_STATE'
    }

    const placement = round.tokenPlacements.find(item => item.playerId === playerId)

    if (!placement) {
      return 'TOKEN_NOT_IN_DUEL'
    }

    const tokensOnSlot = round.tokenPlacements.filter(
      item => item.position === placement.position
    )

    if (tokensOnSlot.length < 2) {
      return 'TOKEN_NOT_IN_DUEL'
    }

    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return 'TOKEN_YEAR_INVALID'
    }

    if (placement.yearGuess !== null) {
      return 'TOKEN_YEAR_ALREADY_SET'
    }

    placement.yearGuess = year
  })
}

export async function awardRoundToken(
  code: string,
  hostId: string,
  targetPlayerId: string
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (room.status === 'finished') {
      return 'GAME_FINISHED'
    }

    const targetPlayer = findPlayer(room, targetPlayerId)

    if (!targetPlayer) {
      return 'PLAYER_NOT_FOUND'
    }

    if (!room.activeRound) {
      return 'INVALID_STATE'
    }

    if (room.activeRound.phase === 'listening' && !room.activeRound.clipEndedAt) {
      return 'INVALID_STATE'
    }

    const isTokenCandidate = targetPlayerId === room.activeRound.playerId
      || room.activeRound.claims.includes(targetPlayerId)

    if (!isTokenCandidate) {
      return 'INVALID_STATE'
    }

    if (room.activeRound.tokenAwards.includes(targetPlayerId)) {
      return 'TOKEN_ALREADY_AWARDED'
    }

    targetPlayer.tokens += 1
    room.activeRound.tokenAwards.push(targetPlayerId)
  })
}

function isPlacementCorrect(player: PlayerRecord, song: RoundSong, position: number): boolean {
  const before = player.timeline[position - 1]
  const after = player.timeline[position]
  const year = song.releaseYear

  return (!before || before.releaseYear <= year) && (!after || year <= after.releaseYear)
}

function createRoundCard(song: RoundSong): TimelineCard {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    releaseYear: song.releaseYear,
    categoryName: song.categoryName,
    addedAt: new Date().toISOString()
  }
}

function insertSongCard(
  room: RoomRecord,
  player: PlayerRecord,
  song: RoundSong,
  position: number
): void {
  const safePosition = Math.min(Math.max(position, 0), player.timeline.length)

  player.timeline = [
    ...player.timeline.slice(0, safePosition),
    createRoundCard(song),
    ...player.timeline.slice(safePosition)
  ]

  if (
    room.status !== 'finished'
    && player.timeline.length >= room.settings.targetCards
  ) {
    room.status = 'finished'
    room.winnerId = player.id
  }
}

function findTimelinePosition(player: PlayerRecord, song: RoundSong): number {
  for (let position = 0; position <= player.timeline.length; position += 1) {
    if (isPlacementCorrect(player, song, position)) {
      return position
    }
  }

  return player.timeline.length
}

function applyRoundScore(room: RoomRecord, player: PlayerRecord, position: number): void {
  const round = room.activeRound

  if (!round) {
    return
  }

  insertSongCard(room, player, round.song, position)

  round.phase = 'scored'
  round.scoredAt = new Date().toISOString()
}

function findCorrectPositions(player: PlayerRecord, song: RoundSong): Set<number> {
  const positions = new Set<number>()

  for (let position = 0; position <= player.timeline.length; position += 1) {
    if (isPlacementCorrect(player, song, position)) {
      positions.add(position)
    }
  }

  return positions
}

function resolveTokenPlacements(
  room: RoomRecord,
  round: ActiveRoundRecord,
  correctPositions: Set<number>
): void {
  const placementsByPosition = new Map<number, TokenPlacementRecord[]>()

  for (const placement of round.tokenPlacements) {
    const placements = placementsByPosition.get(placement.position) ?? []

    placements.push(placement)
    placementsByPosition.set(placement.position, placements)
  }

  round.tokenDuels = []
  round.tokenResults = []

  for (const [position, placements] of placementsByPosition) {
    const correct = correctPositions.has(position)

    if (placements.length === 1) {
      const placement = placements[0]!
      const player = findPlayer(room, placement.playerId)

      if (correct && player) {
        insertSongCard(room, player, round.song, findTimelinePosition(player, round.song))
      }

      round.tokenResults.push({
        playerId: placement.playerId,
        playerName: player?.name ?? '',
        position,
        cardWon: Boolean(correct && player),
        tokenWon: false,
        duel: false
      })
      continue
    }

    const rankedPlacements = placements
      .map((placement, index) => ({ placement, index }))
      .sort((a, b) => {
        const distanceA = Math.abs((a.placement.yearGuess ?? 0) - round.song.releaseYear)
        const distanceB = Math.abs((b.placement.yearGuess ?? 0) - round.song.releaseYear)

        if (distanceA !== distanceB) {
          return distanceA - distanceB
        }

        const placedAtOrder = a.placement.placedAt.localeCompare(b.placement.placedAt)

        return placedAtOrder !== 0 ? placedAtOrder : a.index - b.index
      })
    const winnerPlacement = rankedPlacements[0]!.placement
    const winner = findPlayer(room, winnerPlacement.playerId)

    if (winner) {
      winner.tokens += 1

      if (correct) {
        insertSongCard(room, winner, round.song, findTimelinePosition(winner, round.song))
      }
    }

    round.tokenDuels.push({
      position,
      winnerId: winnerPlacement.playerId,
      winnerName: winner?.name ?? '',
      cardWon: Boolean(correct && winner),
      guesses: placements.flatMap((placement) => {
        const player = findPlayer(room, placement.playerId)

        return placement.yearGuess === null
          ? []
          : [{
              playerId: placement.playerId,
              playerName: player?.name ?? '',
              year: placement.yearGuess
            }]
      })
    })

    for (const placement of placements) {
      const player = findPlayer(room, placement.playerId)
      const wonDuel = placement.playerId === winnerPlacement.playerId

      round.tokenResults.push({
        playerId: placement.playerId,
        playerName: player?.name ?? '',
        position,
        cardWon: Boolean(wonDuel && correct && winner),
        tokenWon: Boolean(wonDuel && winner),
        duel: true
      })
    }
  }
}

function hasPendingTokenYearGuesses(round: ActiveRoundRecord): boolean {
  const placementsByPosition = new Map<number, TokenPlacementRecord[]>()

  for (const placement of round.tokenPlacements) {
    const placements = placementsByPosition.get(placement.position) ?? []

    placements.push(placement)
    placementsByPosition.set(placement.position, placements)
  }

  return [...placementsByPosition.values()].some((placements) => {
    return placements.length > 1
      && placements.some(placement => placement.yearGuess === null)
  })
}

export async function revealRound(
  code: string,
  hostId: string
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (!room.activeRound || room.activeRound.phase !== 'listening') {
      return 'INVALID_STATE'
    }

    const placement = room.activeRound.placement

    if (!placement) {
      return 'PLACEMENT_REQUIRED'
    }

    const player = findPlayer(room, room.activeRound.playerId)

    if (!player) {
      return 'PLAYER_NOT_FOUND'
    }

    if (hasPendingTokenYearGuesses(room.activeRound)) {
      return 'TOKEN_YEAR_REQUIRED'
    }

    // Snapshot which slots were correct before the active player's card is
    // inserted. Otherwise a token on the neighbouring slot can become
    // "correct" retroactively once the timeline grows during scoring.
    const correctPositions = findCorrectPositions(player, room.activeRound.song)
    const correct = correctPositions.has(placement.position)

    room.activeRound.placementCorrect = correct
    room.activeRound.phase = 'revealed'
    room.activeRound.revealedAt = new Date().toISOString()

    if (correct) {
      applyRoundScore(room, player, placement.position)
    }

    resolveTokenPlacements(room, room.activeRound, correctPositions)
  })
}

export async function scoreRound(
  code: string,
  hostId: string
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (!room.activeRound || room.activeRound.phase !== 'revealed') {
      return 'INVALID_STATE'
    }

    if (room.status === 'finished') {
      return 'GAME_FINISHED'
    }

    const player = findPlayer(room, room.activeRound.playerId)

    if (!player) {
      return 'PLAYER_NOT_FOUND'
    }

    applyRoundScore(room, player, room.activeRound.placement?.position ?? 0)
  })
}

export async function skipRound(
  code: string,
  hostId: string
): Promise<RoomActionResult> {
  return mutateRoom(code, hostId, (room) => {
    if (room.hostId !== hostId) {
      return 'NOT_HOST'
    }

    if (!room.activeRound || room.activeRound.phase === 'listening') {
      return 'INVALID_STATE'
    }

    if (room.status === 'finished') {
      return 'GAME_FINISHED'
    }

    room.currentPlayerId = getNextPlayerId(room, room.activeRound.playerId)
    room.activeRound = null
  })
}

export async function leaveRoom(code: string, playerId: string): Promise<boolean> {
  const normalizedCode = normalizeRoomCode(code)

  if (!isValidRoomCode(normalizedCode)) {
    return false
  }

  return runSerializable(async (tx) => {
    await lockRoom(tx, normalizedCode)
    const room = await loadRoomRecord(tx, normalizedCode)

    if (!room) {
      return false
    }

    const player = findPlayer(room, playerId)

    if (!player) {
      return false
    }

    if (room.activeRound?.playerId === playerId) {
      // Refund pending wagers only. Once the round is revealed the wagers have
      // already been resolved (tokens and cards awarded), so refunding them
      // here would duplicate the payouts.
      if (room.activeRound.phase === 'listening') {
        refundTokenPlacements(room)
      }
    } else if (room.activeRound) {
      room.activeRound.tokenPlacements = room.activeRound.tokenPlacements.filter(
        placement => placement.playerId !== playerId
      )
    }

    room.players = room.players.filter(item => item.id !== playerId)

    if (room.activeRound?.playerId === playerId) {
      room.activeRound = null
    }

    if (room.players.length === 0) {
      await tx.room.delete({ where: { code: room.code } })
      return true
    }

    if (room.hostId === playerId) {
      const nextHost = room.players[0]!

      nextHost.isHost = true
      room.hostId = nextHost.id
      room.hostName = nextHost.name
    }

    if (!findPlayer(room, room.currentPlayerId)) {
      room.currentPlayerId = room.players[0]!.id
    }

    await saveRoomRecord(tx, room)

    return true
  })
}

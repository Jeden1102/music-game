import type { RoomActionFailureReason } from './room-store'

const ERROR_MAP: Record<
  RoomActionFailureReason,
  { statusCode: number, statusMessage: string, message: string }
> = {
  ROOM_NOT_FOUND: {
    statusCode: 404,
    statusMessage: 'ROOM_NOT_FOUND',
    message: 'The room does not exist or has expired.'
  },
  PLAYER_NOT_FOUND: {
    statusCode: 404,
    statusMessage: 'PLAYER_NOT_FOUND',
    message: 'The player is not part of this room.'
  },
  NOT_HOST: {
    statusCode: 403,
    statusMessage: 'NOT_HOST',
    message: 'Only the host can perform this action.'
  },
  NOT_ACTIVE_PLAYER: {
    statusCode: 403,
    statusMessage: 'NOT_ACTIVE_PLAYER',
    message: 'Only the player whose turn it is can place the card.'
  },
  ACTIVE_PLAYER_CANNOT_CLAIM: {
    statusCode: 409,
    statusMessage: 'ACTIVE_PLAYER_CANNOT_CLAIM',
    message: 'The active player cannot claim the song; they must place the card.'
  },
  INVALID_STATE: {
    statusCode: 409,
    statusMessage: 'INVALID_STATE',
    message: 'This action is not available right now.'
  },
  ROUND_ACTIVE: {
    statusCode: 409,
    statusMessage: 'ROUND_ACTIVE',
    message: 'Finish the current round first.'
  },
  GAME_FINISHED: {
    statusCode: 409,
    statusMessage: 'GAME_FINISHED',
    message: 'The game has already finished.'
  },
  NO_SONG: {
    statusCode: 409,
    statusMessage: 'NO_SONGS_LEFT',
    message: 'There are no more songs available in this category.'
  },
  ALREADY_PLACED: {
    statusCode: 409,
    statusMessage: 'ALREADY_PLACED',
    message: 'The active player has already confirmed a slot.'
  },
  PLACEMENT_REQUIRED: {
    statusCode: 409,
    statusMessage: 'PLACEMENT_REQUIRED',
    message: 'The active player must confirm a slot before the song is revealed.'
  },
  TOKEN_ALREADY_AWARDED: {
    statusCode: 409,
    statusMessage: 'TOKEN_ALREADY_AWARDED',
    message: 'This player has already received a token for this round.'
  },
  NO_TOKENS: {
    statusCode: 409,
    statusMessage: 'NO_TOKENS',
    message: 'This player has no tokens to place.'
  },
  TOKEN_ALREADY_PLACED: {
    statusCode: 409,
    statusMessage: 'TOKEN_ALREADY_PLACED',
    message: 'This player has already placed a token this round.'
  },
  ACTIVE_PLAYER_CANNOT_BET: {
    statusCode: 409,
    statusMessage: 'ACTIVE_PLAYER_CANNOT_BET',
    message: 'The active player places a card, not a token.'
  },
  TOKEN_YEAR_REQUIRED: {
    statusCode: 409,
    statusMessage: 'TOKEN_YEAR_REQUIRED',
    message: 'Every tied token duelist must submit a year before the reveal.'
  },
  TOKEN_YEAR_ALREADY_SET: {
    statusCode: 409,
    statusMessage: 'TOKEN_YEAR_ALREADY_SET',
    message: 'The year has already been submitted for this token.'
  },
  TOKEN_YEAR_INVALID: {
    statusCode: 422,
    statusMessage: 'TOKEN_YEAR_INVALID',
    message: 'The year must be a number between 1900 and 2100.'
  },
  TOKEN_NOT_IN_DUEL: {
    statusCode: 409,
    statusMessage: 'TOKEN_NOT_IN_DUEL',
    message: 'This token is not part of a year duel.'
  }
}

export function throwRoomActionError(reason: RoomActionFailureReason): never {
  throw createError(ERROR_MAP[reason])
}

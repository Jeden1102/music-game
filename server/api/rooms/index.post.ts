import type { CreateRoomInput, RoomSettings } from '#shared/types/room'
import { isValidPlayerName, normalizePlayerName } from '#shared/utils/player'
import {
  DEFAULT_CLIP_SECONDS,
  DEFAULT_TARGET_CARDS,
  normalizeClipSeconds,
  normalizeTargetCards
} from '#shared/utils/room'
import { findCategory } from '../../utils/game-songs'
import { createRoom } from '../../utils/room-store'

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<CreateRoomInput> | null>(event)
  const name = normalizePlayerName(typeof body?.name === 'string' ? body.name : '')

  if (!isValidPlayerName(name)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'INVALID_NAME',
      message: 'The nickname must be between 2 and 20 characters.'
    })
  }

  const clipSeconds = body?.clipSeconds === undefined
    ? DEFAULT_CLIP_SECONDS
    : normalizeClipSeconds(body.clipSeconds)
  const targetCards = body?.targetCards === undefined
    ? DEFAULT_TARGET_CARDS
    : normalizeTargetCards(body.targetCards)

  if (!clipSeconds || !targetCards) {
    throw createError({
      statusCode: 422,
      statusMessage: 'INVALID_SETTINGS',
      message: 'The room settings are invalid.'
    })
  }

  const requestedCategoryId = Number(body?.categoryId ?? 0)
  const categoryId = Number.isInteger(requestedCategoryId) && requestedCategoryId > 0
    ? requestedCategoryId
    : null
  let categoryName: string | null = null

  if (categoryId) {
    const category = await findCategory(categoryId)

    if (!category) {
      throw createError({
        statusCode: 422,
        statusMessage: 'CATEGORY_NOT_FOUND',
        message: 'The selected category does not exist.'
      })
    }

    categoryName = category.name
  }

  const settings: RoomSettings = {
    clipSeconds,
    categoryId,
    categoryName,
    targetCards
  }

  return createRoom(name, settings)
})

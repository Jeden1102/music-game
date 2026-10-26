import type { ClipSeconds, TargetCards } from '../types/room'
import { CLIP_SECONDS_OPTIONS, TARGET_CARDS_OPTIONS } from '../types/room'

export const ROOM_CODE_LENGTH = 4
export const DEFAULT_CLIP_SECONDS: ClipSeconds = 15
export const DEFAULT_TARGET_CARDS: TargetCards = 10

export function normalizeRoomCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH)
}

export function isValidRoomCode(value: string): boolean {
  return new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(value)
}

export function normalizeClipSeconds(value: unknown): ClipSeconds | null {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return CLIP_SECONDS_OPTIONS.find(option => option === numericValue) ?? null
}

export function normalizeTargetCards(value: unknown): TargetCards | null {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return TARGET_CARDS_OPTIONS.find(option => option === numericValue) ?? null
}

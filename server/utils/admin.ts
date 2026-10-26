import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)

  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
}

export function assertAdmin(event: H3Event): void {
  const expectedSecret = useRuntimeConfig(event).adminSecret
    || process.env.ADMIN_SECRET
    || process.env.NUXT_ADMIN_SECRET
    || ''
  const headerSecret = getHeader(event, 'x-admin-secret')
  const querySecret = getQuery(event).secret
  const providedSecret = headerSecret ?? (typeof querySecret === 'string' ? querySecret : '')

  if (!expectedSecret || !providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'ADMIN_UNAUTHORIZED',
      message: 'A valid admin secret is required.'
    })
  }
}

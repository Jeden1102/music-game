import { assertAdmin } from '../../utils/admin'

export default defineEventHandler((event) => {
  assertAdmin(event)

  return { ok: true }
})

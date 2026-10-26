import type { SongImportResult } from '#shared/types/song-import'
import { assertAdmin } from '../../../utils/admin'
import { importSongs, parseSongImport } from '../../../utils/song-import'

interface ImportRequestBody {
  json?: unknown
}

export default defineEventHandler(async (event): Promise<SongImportResult> => {
  assertAdmin(event)

  const body = await readBody<ImportRequestBody | null>(event)

  if (!body || typeof body.json !== 'string' || !body.json.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'INVALID_BODY',
      message: 'The request body must contain a JSON string in the "json" field.'
    })
  }

  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(body.json)
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'INVALID_JSON',
      message: 'The provided text is not valid JSON.'
    })
  }

  const songs = parseSongImport(parsedJson)
  return importSongs(songs)
})

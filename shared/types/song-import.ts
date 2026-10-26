export interface SongImportItem {
  title: string
  artist: string
  releaseYear: number
  /** Optional. Leave empty to let the server resolve an embeddable video on first play. */
  youtubeId?: string | null
  startTime: number
  category: string
}

export interface SongImportPayload {
  songs: SongImportItem[]
}

export interface SongImportResult {
  imported: number
  categories: string[]
}

export interface SongCategory {
  id: number
  name: string
}

export interface Song {
  id: number
  title: string
  artist: string
  releaseYear: number
  youtubeId: string
  startTime: number
  lastPlayed: string | null
  categoryId: number
  category: SongCategory
}

import type { SongImportPayload } from '#shared/types/song-import'

export const SONG_IMPORT_PLACEHOLDER = `{
  "songs": [
    {
      "title": "Title",
      "artist": "Artist",
      "releaseYear": 2024,
      "startTime": 0,
      "category": "Hity"
    }
  ]
}`

export const SONG_IMPORT_SAMPLE: SongImportPayload = {
  songs: [
    {
      title: 'One More Time',
      artist: 'Daft Punk',
      releaseYear: 2001,
      startTime: 20,
      category: 'Hity'
    }
  ]
}

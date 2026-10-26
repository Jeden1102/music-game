import prisma from '../lib/prisma'

const categories = [
  {
    name: 'Hity',
    songs: [
      { title: 'Billie Jean', artist: 'Michael Jackson', releaseYear: 1982, youtubeId: 'Zi_XLOBDo_Y', startTime: 48 },
      { title: 'Dancing Queen', artist: 'ABBA', releaseYear: 1976, youtubeId: 'xFrGuyw1V8s', startTime: 17 },
      { title: 'Bohemian Rhapsody', artist: 'Queen', releaseYear: 1975, youtubeId: 'fJ9rUzIMcZQ', startTime: 16 },
      { title: 'Never Gonna Give You Up', artist: 'Rick Astley', releaseYear: 1987, youtubeId: 'dQw4w9WgXcQ', startTime: 18 },
      { title: 'Smells Like Teen Spirit', artist: 'Nirvana', releaseYear: 1991, youtubeId: 'hTWKbfoikeg', startTime: 25 },
      { title: 'Get Lucky', artist: 'Daft Punk', releaseYear: 2013, youtubeId: '5NV6Rdv1a3I', startTime: 30 }
    ]
  },
  {
    name: 'Polski Rap',
    songs: [
      { title: 'Jestem Bogiem', artist: 'Paktofonika', releaseYear: 2000, youtubeId: 'u3HeJFr01T0', startTime: 20 },
      { title: 'Patointeligencja', artist: 'Mata', releaseYear: 2019, youtubeId: 'wTAibxp37vE', startTime: 15 },
      { title: 'Deszcz na betonie', artist: 'Taco Hemingway', releaseYear: 2016, youtubeId: 'PCQs3vSJ6xA', startTime: 13 },
      { title: 'W aucie', artist: 'Sokół feat. Pono, Fred & Franek Kimono', releaseYear: 2007, youtubeId: 'b6Gdg9hhOas', startTime: 10 },
      { title: 'Disney', artist: 'Kizo', releaseYear: 2021, youtubeId: '_29dLT6OMTU', startTime: 14 }
    ]
  }
]

async function main() {
  for (const category of categories) {
    const categoryRecord = await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: { name: category.name }
    })

    for (const song of category.songs) {
      const existing = await prisma.song.findFirst({
        where: {
          title: song.title,
          artist: song.artist,
          releaseYear: song.releaseYear
        },
        select: { id: true }
      })

      if (existing) {
        await prisma.song.update({
          where: { id: existing.id },
          data: {
            startTime: song.startTime,
            categoryId: categoryRecord.id
          }
        })
        continue
      }

      await prisma.song.create({
        data: {
          ...song,
          categoryId: categoryRecord.id
        }
      })
    }
  }

  const songCount = await prisma.song.count()
  console.log(`Seed zakończony: ${songCount} utworów w ${categories.length} kategoriach.`)
}

main()
  .catch((error) => {
    console.error('Seed nie powiódł się:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

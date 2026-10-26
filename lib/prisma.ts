import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'

// Nuxt reloads modules in development, so keep the client on globalThis
// to avoid opening a new connection on every hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl?.startsWith('file:./')) {
    return databaseUrl
  }

  // Prisma resolves relative SQLite paths against schema.prisma, which lives
  // in .output after a build, so point the file at the project directory.
  return `file:${resolve(process.cwd(), 'prisma', databaseUrl.slice('file:./'.length))}`
}

const databaseUrl = resolveDatabaseUrl()

const prisma = globalForPrisma.prisma ?? new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
)

globalForPrisma.prisma = prisma

export default prisma

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { validateDatabaseUrl } from '@/lib/database-url'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  const connectionString = validateDatabaseUrl(process.env.DATABASE_URL)
  try {
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log: ['error', 'warn'],
    })
  } catch {
    throw new Error('Database configuration is invalid; unable to initialize the database client.')
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

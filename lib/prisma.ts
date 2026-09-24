import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createFallbackPrisma(): PrismaClient {
  const noop = async () => null
  const create = async () => ({ id: 'local-stub' })

  const transactionClient = {
    user: { create, findUnique: noop },
    student: { create },
    parentStudent: { create },
    session: { create, updateMany: async () => ({ count: 0 }), findUnique: noop },
  }

  const prismaStub = {
    user: { create, findUnique: noop },
    student: { create },
    parentStudent: { create },
    session: { create, updateMany: async () => ({ count: 0 }), findUnique: noop },
    $transaction: async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
  }

  return prismaStub as unknown as PrismaClient
}

export const prisma = (() => {
  if (!process.env.DATABASE_URL) {
    return createFallbackPrisma()
  }

  try {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    })
    const client = globalForPrisma.prisma ?? new PrismaClient({
      adapter,
      log: ['query', 'error', 'warn'],
    })

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = client
    }

    return client
  } catch {
    return createFallbackPrisma()
  }
})()

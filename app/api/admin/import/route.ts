import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdminRole, normalizeAdminUsername } from '@/lib/admin-auth'

type ImportAccount = {
  adminId: string
  name: string
  username: string
  email: string
  mobile: string
  role: string
  passwordHash: string
  createdAt: string
  updatedAt?: string
}

function parseAccount(value: unknown): ImportAccount | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  const adminId = typeof candidate.adminId === 'string' ? candidate.adminId : candidate.id
  const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : ''
  const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : createdAt

  if (
    typeof adminId !== 'string' || !adminId.trim() ||
    typeof candidate.name !== 'string' || !candidate.name.trim() ||
    typeof candidate.username !== 'string' || !candidate.username.trim() ||
    typeof candidate.email !== 'string' || !candidate.email.trim() ||
    typeof candidate.mobile !== 'string' || !candidate.mobile.trim() ||
    typeof candidate.role !== 'string' || !isAdminRole(candidate.role) ||
    typeof candidate.passwordHash !== 'string' || !candidate.passwordHash ||
    !createdAt || Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))
  ) {
    return null
  }

  return {
    adminId: adminId.trim(),
    name: candidate.name.trim(),
    username: normalizeAdminUsername(candidate.username),
    email: candidate.email.trim().toLowerCase(),
    mobile: candidate.mobile.trim(),
    role: candidate.role,
    passwordHash: candidate.passwordHash,
    createdAt,
    updatedAt,
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const rawAccounts = typeof body === 'object' && body !== null && 'accounts' in body ? body.accounts : null
  if (!Array.isArray(rawAccounts)) {
    return NextResponse.json({ error: 'Accounts are required.' }, { status: 400 })
  }

  const accounts = rawAccounts.map(parseAccount)
  if (accounts.some((account) => account === null) || accounts.length === 0) {
    return NextResponse.json({ error: 'Invalid admin account data.' }, { status: 400 })
  }

  const validAccounts = accounts as ImportAccount[]
  const uniqueIds = new Set(validAccounts.map((account) => account.adminId))
  if (uniqueIds.size !== validAccounts.length) {
    return NextResponse.json({ error: 'Duplicate admin IDs are not allowed.' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.adminAccount.count()
      if (existingCount > 0) {
        return { imported: 0, skipped: true }
      }

      for (const account of validAccounts) {
        await tx.adminAccount.create({
          data: {
            adminId: account.adminId,
            name: account.name,
            username: account.username,
            email: account.email,
            mobile: account.mobile,
            role: account.role as never,
            passwordHash: account.passwordHash,
            createdAt: new Date(account.createdAt),
            updatedAt: new Date(account.updatedAt ?? account.createdAt),
          },
        })
      }

      return { imported: validAccounts.length, skipped: false }
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Unable to import admin accounts.' }, { status: 500 })
  }
}

import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { verifyPassword } from '@/lib/password'
import { AdminRole, type AdminAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const ADMIN_SESSION_COOKIE = 'helios_admin_session'
const ADMIN_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

export type SafeAdminAccount = Pick<
  AdminAccount,
  'adminId' | 'name' | 'username' | 'email' | 'mobile' | 'role' | 'isActive' | 'createdAt' | 'updatedAt'
>

export type CurrentAdmin = {
  account: SafeAdminAccount
  session: {
    adminId: string
    role: AdminRole
    createdAt: Date
  }
}

export function normalizeAdminUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

export async function verifyAdminPassword(password: string, passwordHash: string): Promise<boolean> {
  if (passwordHash.startsWith('$2')) {
    return verifyPassword(password, passwordHash)
  }

  return createHash('sha256').update(password).digest('hex') === passwordHash
}

export function toSafeAdmin(account: AdminAccount): SafeAdminAccount {
  return {
    adminId: account.adminId,
    name: account.name,
    username: account.username,
    email: account.email,
    mobile: account.mobile,
    role: account.role,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function cookieOptions(expires?: Date, rememberMe = true) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...(expires ? { expires } : {}),
    ...(rememberMe ? { maxAge: Math.floor(ADMIN_SESSION_LIFETIME_MS / 1000) } : {}),
  }
}

export async function createAdminSession(adminId: string, rememberMe: boolean): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_LIFETIME_MS)

  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  })

  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, token, cookieOptions(rememberMe ? expiresAt : undefined, rememberMe))
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, '', cookieOptions(new Date(0), true))
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value

  if (!token) return null

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { admin: true },
  })

  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.admin.isActive) {
    await clearAdminSessionCookie()
    return null
  }

  return {
    account: toSafeAdmin(session.admin),
    session: {
      adminId: session.adminId,
      role: session.admin.role,
      createdAt: session.createdAt,
    },
  }
}

export async function revokeCurrentAdminSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value

  if (token) {
    await prisma.adminSession.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  await clearAdminSessionCookie()
}

export function isAdminRole(value: unknown): value is AdminRole {
  return Object.values(AdminRole).includes(value as AdminRole)
}

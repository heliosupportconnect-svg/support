import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { Prisma, Role, type User } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const SESSION_COOKIE_NAME = 'helios_session'
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

type SafeUser = Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role'>
type ParentWithStudent = Prisma.UserGetPayload<{
  include: { studentLinks: { include: { student: true } } }
}>

export type SafeParent = {
  id: string
  name: string
  email: string
  phone: string
  emergencyPhone?: string
  relationship?: string
  role: 'PARENT'
  createdAt: string
  student: {
    admissionNumber: string
    name: string
    className: string
    section: string
    rollNumber: string
    house: string
    relationship: string
    modeOfTransport?: 'Self Transport' | 'School Bus'
    busNumber?: string
    busRoute?: string
  }
}

export class AuthError extends Error {
  status: 401 | 403

  constructor(status: 401 | 403, message: string) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
  }
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  }
}

export function toSafeParent(user: ParentWithStudent): SafeParent {
  const link = user.studentLinks[0]
  const student = link?.student
  const relationship = link?.relationshipType === 'OTHER' ? 'Other' : 'Parent/Guardian'
  return {
    id: user.id,
    name: user.name ?? '',
    email: user.email,
    phone: user.phone ?? '',
    emergencyPhone: user.emergencyPhone ?? undefined,
    relationship,
    role: 'PARENT',
    createdAt: user.createdAt.toISOString(),
    student: {
      admissionNumber: student?.admissionNumber ?? '',
      name: student ? `${student.firstName} ${student.lastName}`.trim() : '',
      className: student?.className ?? '',
      section: student?.section ?? '',
      rollNumber: student?.rollNumber ?? '',
      house: student?.house ?? '',
      relationship,
      modeOfTransport: student?.modeOfTransport === 'School Bus' ? 'School Bus' : student?.modeOfTransport === 'Self Transport' ? 'Self Transport' : undefined,
      busNumber: student?.busNumber ?? undefined,
      busRoute: student?.busRoute ?? undefined,
    },
  }
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS)

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  })

  const cookieStore = await cookies()
  cookieStore.set(
    SESSION_COOKIE_NAME,
    token,
    cookieOptions(expiresAt),
  )
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(
    SESSION_COOKIE_NAME,
    '',
    cookieOptions(new Date(0)),
  )
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  })

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date() ||
    !session.user.isActive
  ) {
    await clearSessionCookie()
    return null
  }

  return toSafeUser(session.user)
}

export async function getCurrentParent(): Promise<SafeParent | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { studentLinks: { include: { student: true } } } } },
  })

  if (!session || session.revokedAt !== null || session.expiresAt <= new Date() || !session.user.isActive || session.user.role !== Role.PARENT) {
    await clearSessionCookie()
    return null
  }

  return toSafeParent(session.user)
}

export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser()

  if (!user) {
    throw new AuthError(401, 'Unauthorized.')
  }

  return user
}

export async function requireRole(
  role: Role,
): Promise<SafeUser> {
  const user = await requireUser()

  if (user.role !== role) {
    throw new AuthError(403, 'Forbidden.')
  }

  return user
}

export const requireParent = () => requireRole(Role.PARENT)
export const requireAdmin = () => requireRole(Role.ADMIN)
export const requireStaff = () => requireRole(Role.STAFF)

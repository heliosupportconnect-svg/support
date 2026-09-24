import { NextResponse } from 'next/server'
import { createAdminSession, normalizeAdminUsername, toSafeAdmin, verifyAdminPassword } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const identifier = typeof body === 'object' && body !== null && 'username' in body && typeof body.username === 'string'
    ? body.username
    : ''
  const password = typeof body === 'object' && body !== null && 'password' in body && typeof body.password === 'string'
    ? body.password
    : ''
  const rememberMe = typeof body === 'object' && body !== null && 'rememberMe' in body && body.rememberMe === true

  if (!identifier.trim() || !password) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  try {
    const account = await prisma.adminAccount.findUnique({
      where: { username: normalizeAdminUsername(identifier) },
    })
    const validPassword = account ? await verifyAdminPassword(password, account.passwordHash) : false

    if (!account || !validPassword || !account.isActive) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 })
    }

    await createAdminSession(account.adminId, rememberMe)
    return NextResponse.json({ account: toSafeAdmin(account) })
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

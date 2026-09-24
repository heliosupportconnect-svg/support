import { NextResponse } from 'next/server'
import { createSession, toSafeParent } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const phone =
    typeof body === 'object' && body !== null && 'phone' in body && typeof body.phone === 'string'
      ? body.phone.trim()
      : ''
  const password =
    typeof body === 'object' && body !== null && 'password' in body && typeof body.password === 'string'
      ? body.password
      : ''

  if (!phone || !password) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  try {
    const user = await prisma.user.findUnique({ where: { phone } })
    const validPassword = user
      ? await verifyPassword(password, user.passwordHash)
      : false

    if (!user || !validPassword || !user.isActive) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 })
    }

    await createSession(user.id)
    const parent = await prisma.user.findUnique({
      where: { id: user.id },
      include: { studentLinks: { include: { student: true } } },
    })

    return NextResponse.json({ parent: parent ? toSafeParent(parent) : null })
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

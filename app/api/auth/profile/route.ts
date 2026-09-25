import { NextResponse } from 'next/server'
import { getCurrentParent, toSafeParent } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? body[key].trim() : ''
}

export async function PATCH(request: Request) {
  const current = await getCurrentParent()
  if (!current) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const name = stringField(input, 'name')
  const email = stringField(input, 'email').toLowerCase()
  const phone = stringField(input, 'phone')
  const emergencyPhone = stringField(input, 'emergencyPhone')
  if (!name || !email || !phone) {
    return NextResponse.json({ error: 'Required profile fields are missing.' }, { status: 400 })
  }

  try {
    const updated = await prisma.user.update({
      where: { id: current.id },
      data: { name, email, phone, emergencyPhone: emergencyPhone || null },
    })
    const parent = await prisma.user.findUnique({
      where: { id: updated.id },
      include: { studentLinks: { include: { student: true } } },
    })
    return NextResponse.json({ parent: parent ? toSafeParent(parent) : null })
  } catch {
    return NextResponse.json({ error: 'Unable to update profile.' }, { status: 409 })
  }
}

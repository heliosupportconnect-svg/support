import { NextResponse } from 'next/server'
import { getCurrentAdmin, normalizeAdminUsername, toSafeAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request) {
  const current = await getCurrentAdmin()
  if (!current) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const getString = (key: string) =>
    typeof body === 'object' && body !== null && key in body && typeof body[key as keyof typeof body] === 'string'
      ? (body[key as keyof typeof body] as string).trim()
      : ''

  const name = getString('name')
  const username = normalizeAdminUsername(getString('username'))
  const email = getString('email').toLowerCase()
  const mobile = getString('mobile')

  if (!name || !username) {
    return NextResponse.json({ error: 'Name and username are required.' }, { status: 400 })
  }

  try {
    const account = await prisma.adminAccount.update({
      where: { adminId: current.account.adminId },
      data: { name, username, email: email || null, mobile: mobile || null },
    })
    return NextResponse.json({ account: toSafeAdmin(account) })
  } catch {
    return NextResponse.json({ error: 'Another admin account already uses that username, email, or mobile.' }, { status: 409 })
  }
}

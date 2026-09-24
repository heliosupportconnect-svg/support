import { NextResponse } from 'next/server'
import { hashPassword } from '@/lib/password'
import { getCurrentAdmin, verifyAdminPassword } from '@/lib/admin-auth'
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
      ? (body[key as keyof typeof body] as string)
      : ''

  const currentPassword = getString('currentPassword')
  const newPassword = getString('newPassword').trim()
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new passwords are required.' }, { status: 400 })
  }

  const account = await prisma.adminAccount.findUnique({ where: { adminId: current.account.adminId } })
  if (!account || !(await verifyAdminPassword(currentPassword, account.passwordHash))) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })
  }

  try {
    await prisma.adminAccount.update({
      where: { adminId: current.account.adminId },
      data: { passwordHash: await hashPassword(newPassword) },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unable to update password.' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getCurrentAdmin, toSafeAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const current = await getCurrentAdmin()
    if (!current) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

    const accounts = await prisma.adminAccount.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ accounts: accounts.map(toSafeAdmin) })
  } catch {
    return NextResponse.json({ error: 'Unable to load admin accounts.' }, { status: 500 })
  }
}

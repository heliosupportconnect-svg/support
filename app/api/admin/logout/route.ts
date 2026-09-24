import { NextResponse } from 'next/server'
import { revokeCurrentAdminSession } from '@/lib/admin-auth'

export async function POST() {
  try {
    await revokeCurrentAdminSession()
  } catch {
    return NextResponse.json({ error: 'Unable to log out.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

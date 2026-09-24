import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/admin-auth'

export async function GET() {
  try {
    const current = await getCurrentAdmin()
    if (!current) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      account: current.account,
      session: current.session,
    })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}

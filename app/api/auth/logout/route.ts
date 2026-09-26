import { NextResponse } from 'next/server'
import { revokeCurrentParentSession } from '@/lib/auth'

export async function POST() {
  try {
    await revokeCurrentParentSession()
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

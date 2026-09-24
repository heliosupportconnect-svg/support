import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  clearSessionCookie,
  revokeSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (token) {
      await revokeSession(token)
    }

    await clearSessionCookie()
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

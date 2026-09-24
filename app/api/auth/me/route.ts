import { NextResponse } from 'next/server'
import { getCurrentParent } from '@/lib/auth'

export async function GET() {
  try {
    const parent = await getCurrentParent()

    if (!parent) {
      return NextResponse.json({ authenticated: false, parent: null })
    }

    return NextResponse.json({ authenticated: true, parent })
  } catch {
    return NextResponse.json({ authenticated: false, user: null })
  }
}

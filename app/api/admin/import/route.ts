import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Admin account import is disabled.' }, { status: 410 })
}

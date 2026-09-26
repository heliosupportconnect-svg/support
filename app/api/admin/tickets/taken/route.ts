import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { mapTicket } from '@/app/api/tickets/route'
import { getAdminTakenTicketWhere } from '@/lib/admin-ticket-access'
import { prisma } from '@/lib/prisma'

const includeTicket = {
  student: true,
  activities: { include: { actor: true }, orderBy: { createdAt: 'asc' as const } },
  notes: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
  attachments: { orderBy: { uploadedAt: 'asc' as const } },
}

export async function GET() {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 })

  try {
    const tickets = await prisma.ticket.findMany({
      where: getAdminTakenTicketWhere(admin.account),
      include: includeTicket,
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ tickets: tickets.map((ticket) => mapTicket(ticket, 'admin')) })
  } catch {
    return NextResponse.json({ error: 'Unable to load claimed tickets.' }, { status: 503 })
  }
}
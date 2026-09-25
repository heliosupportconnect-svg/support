import { NextResponse } from 'next/server'
import { getCurrentParent } from '@/lib/auth'
import { mapTicket } from '@/app/api/tickets/route'
import { isParentTicketOwner } from '@/lib/ticket-access'
import { parseParentReplyMessage } from '@/lib/parent-reply'
import { prisma } from '@/lib/prisma'
import { parseLegacyTicketNumber, parseTicketNumber } from '@/lib/ticket-number'

const includeTicket = {
  student: true,
  activities: { include: { actor: true }, orderBy: { createdAt: 'asc' as const } },
  notes: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
  attachments: { orderBy: { uploadedAt: 'asc' as const } },
}

export async function POST(request: Request, context: { params: Promise<{ ticketNumber: string }> }) {
  const parent = await getCurrentParent()
  if (!parent) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const { ticketNumber } = await context.params
  const publicTicketNumber = parseTicketNumber(ticketNumber)
  const legacyTicketNumber = publicTicketNumber === null ? parseLegacyTicketNumber(ticketNumber) : null
  if (publicTicketNumber === null && legacyTicketNumber === null) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid reply.' }, { status: 400 })
  }
  const message = parseParentReplyMessage(body)
  if (!message) return NextResponse.json({ error: 'Reply must be between 1 and 5000 characters.' }, { status: 400 })

  try {
    const ticket = await prisma.ticket.findUnique({
      where: publicTicketNumber !== null ? { ticketNumber: publicTicketNumber } : { legacyTicketNumber: legacyTicketNumber! },
      include: includeTicket,
    })
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    if (!isParentTicketOwner(parent.id, ticket.reporterId)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })

    await prisma.ticketActivity.create({
      data: { ticketId: ticket.id, actorId: parent.id, type: 'COMMENTED', message },
    })
    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: includeTicket })
    return NextResponse.json({ ticket: updated ? mapTicket(updated, 'parent') : null })
  } catch {
    return NextResponse.json({ error: 'Unable to save your reply.' }, { status: 503 })
  }
}
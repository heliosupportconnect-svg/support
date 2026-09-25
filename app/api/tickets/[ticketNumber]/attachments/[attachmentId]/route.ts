import { NextResponse } from 'next/server'
import { getCurrentParent } from '@/lib/auth'
import { createSignedObjectUrl, TICKET_ATTACHMENTS_BUCKET } from '@/lib/object-storage'
import { prisma } from '@/lib/prisma'
import { parseLegacyTicketNumber, parseTicketNumber } from '@/lib/ticket-number'
import { isParentTicketOwner } from '@/lib/ticket-access'

export async function GET(_request: Request, context: { params: Promise<{ ticketNumber: string; attachmentId: string }> }) {
  const parent = await getCurrentParent()
  if (!parent) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  const { ticketNumber, attachmentId } = await context.params
  const publicTicketNumber = parseTicketNumber(ticketNumber)
  const legacyTicketNumber = publicTicketNumber === null ? parseLegacyTicketNumber(ticketNumber) : null
  if (publicTicketNumber === null && legacyTicketNumber === null) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })

  try {
    const attachment = await prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        ticket: publicTicketNumber !== null ? { ticketNumber: publicTicketNumber } : { legacyTicketNumber: legacyTicketNumber! },
      },
      include: { ticket: { select: { reporterId: true, studentSnapshot: true, student: true } } },
    })
    if (!attachment) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    if (!isParentTicketOwner(parent.id, attachment.ticket.reporterId)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    if (!attachment.storageKey) return NextResponse.json({ error: 'Attachment storage reference is missing.' }, { status: 503 })
    return NextResponse.redirect(await createSignedObjectUrl(TICKET_ATTACHMENTS_BUCKET, attachment.storageKey))
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve attachment.' }, { status: 503 })
  }
}

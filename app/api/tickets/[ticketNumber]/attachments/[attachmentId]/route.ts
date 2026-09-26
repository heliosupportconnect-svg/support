import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { getCurrentParent } from '@/lib/auth'
import { createSignedObjectUrl, TICKET_ATTACHMENTS_BUCKET } from '@/lib/object-storage'
import { prisma } from '@/lib/prisma'
import { parseLegacyTicketNumber, parseTicketNumber } from '@/lib/ticket-number'
import { isParentTicketOwner, resolveTicketAudience } from '@/lib/ticket-access'
import { parseParentAttachmentOrdinal } from '@/lib/parent-attachment'

export async function GET(_request: Request, context: { params: Promise<{ ticketNumber: string; attachmentId: string }> }) {
  const admin = await getCurrentAdmin()
  const parent = await getCurrentParent()
  const audience = resolveTicketAudience(Boolean(admin), Boolean(parent))
  if (audience === 'ambiguous') return NextResponse.json({ error: 'Ambiguous authentication.' }, { status: 403 })
  if (audience !== 'parent' || !parent) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  const { ticketNumber, attachmentId } = await context.params
  const publicTicketNumber = parseTicketNumber(ticketNumber)
  const legacyTicketNumber = publicTicketNumber === null ? parseLegacyTicketNumber(ticketNumber) : null
  const ordinal = parseParentAttachmentOrdinal(attachmentId)
  if ((publicTicketNumber === null && legacyTicketNumber === null) || ordinal === null) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })

  try {
    const ticket = await prisma.ticket.findUnique({
      where: publicTicketNumber !== null ? { ticketNumber: publicTicketNumber } : { legacyTicketNumber: legacyTicketNumber! },
      select: { id: true, reporterId: true },
    })
    if (!ticket) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    if (!isParentTicketOwner(parent.id, ticket.reporterId)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    const [attachment] = await prisma.attachment.findMany({
      where: { ticketId: ticket.id },
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
      skip: ordinal - 1,
      take: 1,
    })
    if (!attachment) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    if (!attachment.storageKey) return NextResponse.json({ error: 'Attachment storage reference is missing.' }, { status: 503 })

    const download = new URL(_request.url).searchParams.get('download') === '1'
    const signedUrl = await createSignedObjectUrl(
      TICKET_ATTACHMENTS_BUCKET,
      attachment.storageKey,
      300,
      download ? { downloadFileName: attachment.fileName, contentType: attachment.mimeType } : {},
    )
    return NextResponse.redirect(signedUrl)
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve attachment.' }, { status: 503 })
  }
}

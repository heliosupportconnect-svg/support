import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { getCurrentParent } from '@/lib/auth'
import { createSignedObjectUrl, TICKET_ATTACHMENTS_BUCKET } from '@/lib/object-storage'
import { prisma } from '@/lib/prisma'

export async function GET(_request: Request, context: { params: Promise<{ ticketNumber: string; attachmentId: string }> }) {
  const admin = await getCurrentAdmin()
  const parent = admin ? null : await getCurrentParent()
  if (!admin && !parent) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  const { ticketNumber, attachmentId } = await context.params

  try {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticket: { ticketNumber: decodeURIComponent(ticketNumber) } },
      include: { ticket: { select: { reporterId: true, studentSnapshot: true, student: true } } },
    })
    if (!attachment) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    if (parent && attachment.ticket.reporterId !== parent.id) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    if (admin && attachment.ticket.studentSnapshot && !['PRINCIPAL', 'DIRECTOR', 'VP_PRIMARY', 'VP_SECONDARY'].includes(admin.account.role)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    if (!attachment.storageKey) return NextResponse.json({ error: 'Attachment storage reference is missing.' }, { status: 503 })
    return NextResponse.redirect(await createSignedObjectUrl(TICKET_ATTACHMENTS_BUCKET, attachment.storageKey))
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve attachment.' }, { status: 503 })
  }
}

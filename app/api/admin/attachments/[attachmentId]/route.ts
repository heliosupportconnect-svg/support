import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { canAccessAdminTicket } from '@/lib/admin-ticket-access'
import { createSignedObjectUrl, TICKET_ATTACHMENTS_BUCKET } from '@/lib/object-storage'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 })

  const { attachmentId } = await context.params
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        ticket: {
          select: {
            studentSnapshot: true,
            student: { select: { className: true } },
            escalatedTo: true,
            takenUpByAdminIds: true,
            resolvedBy: true,
          },
        },
      },
    })
    if (!attachment) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    if (!canAccessAdminTicket(admin.account, attachment.ticket)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    if (!attachment.storageKey) return NextResponse.json({ error: 'Attachment storage reference is missing.' }, { status: 503 })

    const download = new URL(request.url).searchParams.get('download') === '1'
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
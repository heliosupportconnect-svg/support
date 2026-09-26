import { NextResponse } from 'next/server'
import type { Prisma, TicketCategory } from '@prisma/client'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { getCurrentParent } from '@/lib/auth'
import { getAdminTicketVisibilityWhere } from '@/lib/admin-ticket-access'
import { prisma } from '@/lib/prisma'
import { findParentOwnedStudentLink } from '@/lib/parent-student-access'
import { createStorageKey, deleteObject, TICKET_ATTACHMENTS_BUCKET, uploadObject } from '@/lib/object-storage'
import { formatTicketIdentifier } from '@/lib/ticket-number'
import { selectTicketHistory } from '@/lib/ticket-history'
import { normalizeStudentClass, normalizeStudentSection } from '@/lib/ticket-policy'
import { createParentTicketInTransaction, ParentTicketOwnershipError } from '@/lib/parent-ticket'
import { resolveTicketAudience } from '@/lib/ticket-access'
import { mapParentAttachment } from '@/lib/parent-attachment'
import type { LocalTicket, TicketProfileSnapshot } from '@/lib/local-tickets'

function localStatus(status: string): LocalTicket['status'] {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'RESOLVED'
  if (status === 'IN_REVIEW' || status === 'ESCALATED') return 'IN_PROGRESS'
  return 'SUBMITTED'
}

function databaseCategory(category: string): string {
  if (category === 'Bus/Transport') return 'TRANSPORT'
  if (category === 'Fees & Accounts') return 'FINANCIAL'
  if (category === 'Disciplinary') return 'SAFETY'
  if (category === 'Admin Desk' || category === 'Administration') return 'OTHER'
  return category.toUpperCase() === 'ACADEMIC' ? 'ACADEMIC' : 'OTHER'
}

function ticketSnapshot(value: unknown): TicketProfileSnapshot | undefined {
  return typeof value === 'object' && value !== null ? value as TicketProfileSnapshot : undefined
}

const includeTicket = {
  student: true,
  activities: { include: { actor: true }, orderBy: { createdAt: 'asc' as const } },
  notes: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
  attachments: { orderBy: [{ uploadedAt: 'asc' as const }, { id: 'asc' as const }] },
}

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof includeTicket }>

export function mapTicket(ticket: TicketWithRelations, audience: 'parent' | 'admin'): LocalTicket {
  const history = selectTicketHistory(ticket.activities, ticket.notes, audience, ticket.reporterId)
  const activities = [
    ...(history.activities ?? []).map((activity) => ({
    title: activity.type === 'NOTE_ADDED' ? 'Internal Note Added' : activity.type === 'FILE_UPLOADED' ? 'Attachment Uploaded' : activity.type === 'STATUS_CHANGED' ? 'Ticket Status Updated' : activity.type === 'ASSIGNED' ? 'Ticket Assigned' : activity.type === 'COMMENTED' ? 'Comment Added' : 'Ticket Updated',
    description: activity.message,
    createdAt: activity.createdAt.toISOString(),
    actor: activity.actor?.name ?? activity.actorAdminId ?? undefined,
    })),
    ...(history.notes ?? []).map((note) => ({
      title: 'Internal Note Added',
      description: note.body,
      createdAt: note.createdAt.toISOString(),
      actor: note.author?.name ?? note.authorAdminId ?? undefined,
    })),
  ].sort((first, second) => first.createdAt.localeCompare(second.createdAt))
  const mapped: LocalTicket = {
    ticketNumber: formatTicketIdentifier(ticket.ticketNumber),
    studentId: ticket.student?.admissionNumber ?? '',
    category: ticket.category,
    subject: ticket.title,
    description: ticket.description,
    status: localStatus(ticket.status),
    priority: ticket.priority === 'URGENT' ? 'URGENT' : ticket.priority === 'HIGH' ? 'HIGH' : 'NORMAL',
    parentSnapshot: ticketSnapshot(ticket.parentSnapshot),
    studentSnapshot: ticketSnapshot(ticket.studentSnapshot),
    escalatedTo: Array.isArray(ticket.escalatedTo) ? ticket.escalatedTo as string[] : undefined,
    escalatedAt: ticket.escalatedAt?.toISOString(),
    attachmentNames: (ticket.attachments ?? []).map((attachment) => attachment.fileName),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    activities,
    attachments: (ticket.attachments ?? []).map((attachment, index) => audience === 'parent'
      ? mapParentAttachment(formatTicketIdentifier(ticket.ticketNumber), attachment, index)
      : {
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          url: `/api/tickets/${encodeURIComponent(formatTicketIdentifier(ticket.ticketNumber))}/attachments/${encodeURIComponent(attachment.id)}`,
        }),
  }
  if (audience === 'admin') {
    Object.assign(mapped, {
      parentId: ticket.reporterId,
      assignedTo: ticket.schoolName ?? undefined,
      assignedBy: ticket.assignedAdminId ?? undefined,
      assignedAdminId: ticket.assignedAdminId ?? undefined,
      assignedAdminRole: ticket.assignedAdminRole ?? undefined,
      takenUpBy: ticket.takenUpBy ?? undefined,
      takenUpAt: ticket.takenUpAt?.toISOString(),
      takenUpByAdminIds: Array.isArray(ticket.takenUpByAdminIds) ? ticket.takenUpByAdminIds as string[] : undefined,
      takenUpAtByAdmin: typeof ticket.takenUpAtByAdmin === 'object' && ticket.takenUpAtByAdmin ? ticket.takenUpAtByAdmin as Record<string, string> : undefined,
      resolvedBy: ticket.resolvedBy ?? undefined,
      resolvedAt: ticket.resolvedAt?.toISOString(),
    })
  }
  return mapped
}

async function getVisibleTickets() {
  const admin = await getCurrentAdmin()
  const parent = await getCurrentParent()
  const audience = resolveTicketAudience(Boolean(admin), Boolean(parent))
  if (audience === 'ambiguous') return 'ambiguous' as const
  if (audience === 'admin' && admin) {
    const tickets = await prisma.ticket.findMany({ where: getAdminTicketVisibilityWhere(admin.account), include: includeTicket, orderBy: { createdAt: 'desc' } })
    return { tickets, audience: 'admin' as const }
  }
  if (audience !== 'parent' || !parent) return null
  const tickets = await prisma.ticket.findMany({
    where: { reporterId: parent.id },
    include: includeTicket,
    orderBy: { createdAt: 'desc' },
  })
  return { tickets, audience: 'parent' as const }
}

export async function GET() {
  try {
    const result = await getVisibleTickets()
    if (result === 'ambiguous') return NextResponse.json({ error: 'Ambiguous authentication.' }, { status: 403 })
    if (!result) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    return NextResponse.json({ tickets: result.tickets.map((ticket) => mapTicket(ticket, result.audience)) })
  } catch {
    return NextResponse.json({ error: 'Unable to load tickets from Neon.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin()
  const parent = await getCurrentParent()
  const audience = resolveTicketAudience(Boolean(admin), Boolean(parent))
  if (audience === 'ambiguous') return NextResponse.json({ error: 'Ambiguous authentication.' }, { status: 403 })
  if (audience !== 'parent' || !parent) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  let payload: Record<string, unknown>
  let files: File[] = []
  try {
    const form = await request.formData()
    const rawPayload = form.get('payload')
    payload = JSON.parse(typeof rawPayload === 'string' ? rawPayload : '{}') as Record<string, unknown>
    files = form.getAll('attachments').filter((value): value is File => value instanceof File)
  } catch {
    return NextResponse.json({ error: 'Invalid ticket request.' }, { status: 400 })
  }

  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
  const description = typeof payload.description === 'string' ? payload.description.trim() : ''
  const category = typeof payload.category === 'string' ? payload.category.trim() : 'Academic'
  if (!subject || !description) {
    return NextResponse.json({ error: 'Subject and description are required.' }, { status: 400 })
  }

  const requestedStudentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : ''
  if (!requestedStudentId) return NextResponse.json({ error: 'A linked student must be selected.' }, { status: 400 })
  const className = normalizeStudentClass(typeof payload.className === 'string' ? payload.className : '')
  const section = normalizeStudentSection(typeof payload.section === 'string' ? payload.section : '')
  if (!className || !section) return NextResponse.json({ error: 'A valid class and section must be selected.' }, { status: 400 })
  const studentLink = await findParentOwnedStudentLink(prisma.parentStudent, parent.id, requestedStudentId)
  if (!studentLink) {
    return NextResponse.json({ error: 'The selected student is not linked to this parent account.' }, { status: 403 })
  }
  const storageItems: { key: string; file: File }[] = []
  for (const file of files) {
    if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Attachments must be PNG, JPG, or PDF files smaller than 10 MB.' }, { status: 400 })
    }
    storageItems.push({ key: createStorageKey(`tickets/${parent.id}`, file.name), file })
  }

  const uploadedKeys: string[] = []
  try {
    for (const item of storageItems) {
      await uploadObject(TICKET_ATTACHMENTS_BUCKET, item.key, Buffer.from(await item.file.arrayBuffer()), item.file.type)
      uploadedKeys.push(item.key)
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const ownedLink = await findParentOwnedStudentLink(tx.parentStudent, parent.id, requestedStudentId)
      if (!ownedLink) throw new ParentTicketOwnershipError()
      const ticketId = await createParentTicketInTransaction(tx, {
        parent,
        studentLink: ownedLink,
        className,
        section,
        title: subject,
        description,
        category: databaseCategory(category) as TicketCategory,
        attachments: storageItems.map(({ key, file }) => ({
          fileName: file.name,
          storageKey: key,
          mimeType: file.type,
          sizeBytes: file.size,
        })),
      })
      return tx.ticket.findUnique({ where: { id: ticketId }, include: includeTicket })
    })

    return NextResponse.json({ ticket: ticket ? mapTicket(ticket, 'parent') : null }, { status: 201 })
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => deleteObject(TICKET_ATTACHMENTS_BUCKET, key).catch(() => undefined)))
    if (error instanceof ParentTicketOwnershipError) return NextResponse.json({ error: 'The selected student is not linked to this parent account.' }, { status: 403 })
    return NextResponse.json({ error: 'Unable to save the ticket to Neon.' }, { status: 503 })
  }
}

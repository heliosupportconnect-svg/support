import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { getCurrentParent } from '@/lib/auth'
import { getAdminTicketVisibilityWhere } from '@/lib/admin-ticket-access'
import { prisma } from '@/lib/prisma'
import { createStorageKey, deleteObject, TICKET_ATTACHMENTS_BUCKET, uploadObject } from '@/lib/object-storage'
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
  attachments: { orderBy: { uploadedAt: 'asc' as const } },
}

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof includeTicket }>

export function mapTicket(ticket: TicketWithRelations): LocalTicket {
  const activities = [
    ...(ticket.activities ?? []).map((activity) => ({
    title: activity.type === 'NOTE_ADDED' ? 'Internal Note Added' : activity.type === 'FILE_UPLOADED' ? 'Attachment Uploaded' : activity.type === 'STATUS_CHANGED' ? 'Ticket Status Updated' : activity.type === 'ASSIGNED' ? 'Ticket Assigned' : activity.type === 'COMMENTED' ? 'Comment Added' : 'Ticket Updated',
    description: activity.message,
    createdAt: activity.createdAt.toISOString(),
    actor: activity.actor?.name ?? activity.actorAdminId ?? undefined,
    })),
    ...(ticket.notes ?? []).map((note) => ({
      title: 'Internal Note Added',
      description: note.body,
      createdAt: note.createdAt.toISOString(),
      actor: note.author?.name ?? note.authorAdminId ?? undefined,
    })),
  ].sort((first, second) => first.createdAt.localeCompare(second.createdAt))
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    parentId: ticket.reporterId,
    studentId: ticket.studentId ?? ticket.student?.admissionNumber ?? '',
    category: ticket.category,
    subject: ticket.title,
    description: ticket.description,
    status: localStatus(ticket.status),
    priority: ticket.priority === 'URGENT' ? 'URGENT' : ticket.priority === 'HIGH' ? 'HIGH' : 'NORMAL',
    parentSnapshot: ticketSnapshot(ticket.parentSnapshot),
    studentSnapshot: ticketSnapshot(ticket.studentSnapshot),
    assignedTo: ticket.schoolName ?? undefined,
    assignedBy: ticket.assignedAdminId ?? undefined,
    assignedAdminId: ticket.assignedAdminId ?? undefined,
    assignedAdminRole: ticket.assignedAdminRole ?? undefined,
    escalatedTo: Array.isArray(ticket.escalatedTo) ? ticket.escalatedTo as string[] : undefined,
    escalatedAt: ticket.escalatedAt?.toISOString(),
    takenUpBy: ticket.takenUpBy ?? undefined,
    takenUpAt: ticket.takenUpAt?.toISOString(),
    takenUpByAdminIds: Array.isArray(ticket.takenUpByAdminIds) ? ticket.takenUpByAdminIds as string[] : undefined,
    takenUpAtByAdmin: typeof ticket.takenUpAtByAdmin === 'object' && ticket.takenUpAtByAdmin ? ticket.takenUpAtByAdmin as Record<string, string> : undefined,
    resolvedBy: ticket.resolvedBy ?? undefined,
    resolvedAt: ticket.resolvedAt?.toISOString(),
    attachmentNames: (ticket.attachments ?? []).map((attachment) => attachment.fileName),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    activities,
    attachments: (ticket.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: `/api/tickets/${encodeURIComponent(ticket.ticketNumber)}/attachments/${encodeURIComponent(attachment.id)}`,
    })),
  } as LocalTicket
}

async function getVisibleTickets() {
  const admin = await getCurrentAdmin()
  if (admin) {
    return prisma.ticket.findMany({ where: getAdminTicketVisibilityWhere(admin.account), include: includeTicket, orderBy: { createdAt: 'desc' } })
  }
  const parent = await getCurrentParent()
  if (!parent) return null
  return prisma.ticket.findMany({
    where: { reporterId: parent.id },
    include: includeTicket,
    orderBy: { createdAt: 'desc' },
  })
}

export async function GET() {
  try {
    const tickets = await getVisibleTickets()
    if (!tickets) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    return NextResponse.json({ tickets: tickets.map(mapTicket) })
  } catch {
    return NextResponse.json({ error: 'Unable to load tickets from Neon.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const parent = await getCurrentParent()
  if (!parent) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

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
  const className = typeof payload.className === 'string' ? payload.className.trim() : parent.student.className
  const section = typeof payload.section === 'string' ? payload.section.trim() : parent.student.section
  if (!subject || !description || !className || !section) {
    return NextResponse.json({ error: 'Subject, description, class, and section are required.' }, { status: 400 })
  }

  const requestedStudentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : ''
  const studentLink = await prisma.parentStudent.findFirst({
    where: {
      userId: parent.id,
      ...(requestedStudentId
        ? {
            OR: [
              { studentId: requestedStudentId },
              { student: { admissionNumber: requestedStudentId } },
            ],
          }
        : {}),
    },
    include: { student: true },
  })
  if (!studentLink) {
    return NextResponse.json({ error: 'The selected student is not linked to this parent account.' }, { status: 403 })
  }

  const parentSnapshot = {
    parentName: parent.name, email: parent.email, phone: parent.phone, emergencyPhone: parent.emergencyPhone,
    relationship: parent.relationship, studentName: parent.student.name, admissionNumber: parent.student.admissionNumber,
    className, section, rollNumber: parent.student.rollNumber, house: parent.student.house,
    modeOfTransport: parent.student.modeOfTransport, busNumber: parent.student.busNumber, busRoute: parent.student.busRoute,
  }
  const studentSnapshot = { ...parentSnapshot }
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
      const created = await tx.ticket.create({
        data: {
          title: subject,
          description,
          category: databaseCategory(category) as never,
          ticketNumber: `HEL-${Date.now().toString(36).toUpperCase()}`,
          reporterId: parent.id,
          studentId: studentLink.student.id,
          parentSnapshot,
          studentSnapshot,
        },
      })
      await tx.ticketActivity.create({
        data: { ticketId: created.id, type: 'STATUS_CHANGED', message: 'Your concern was submitted through the Helios Parent Support Desk.' },
      })
      for (const item of storageItems) {
        await tx.attachment.create({
          data: { ticketId: created.id, fileName: item.file.name, storageKey: item.key, mimeType: item.file.type, sizeBytes: item.file.size },
        })
      }
      return tx.ticket.findUnique({ where: { id: created.id }, include: includeTicket })
    })

    return NextResponse.json({ ticket: ticket ? mapTicket(ticket) : null }, { status: 201 })
  } catch {
    await Promise.all(uploadedKeys.map((key) => deleteObject(TICKET_ATTACHMENTS_BUCKET, key).catch(() => undefined)))
    return NextResponse.json({ error: 'Unable to save the ticket to Neon.' }, { status: 503 })
  }
}

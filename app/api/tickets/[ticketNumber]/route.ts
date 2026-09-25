import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { getCurrentParent } from '@/lib/auth'
import { canAccessAdminTicket } from '@/lib/admin-ticket-access'
import { prisma } from '@/lib/prisma'
import { mapTicket } from '@/app/api/tickets/route'
import { parseLegacyTicketNumber, parseTicketNumber } from '@/lib/ticket-number'

const includeTicket = {
  student: true,
  activities: { include: { actor: true }, orderBy: { createdAt: 'asc' as const } },
  notes: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
  attachments: { orderBy: { uploadedAt: 'asc' as const } },
}

function databaseStatus(status: unknown): string | undefined {
  if (status === 'IN_PROGRESS') return 'IN_REVIEW'
  if (status === 'RESOLVED' || status === 'CLOSED') return 'RESOLVED'
  if (status === 'SUBMITTED') return 'OPEN'
  return undefined
}

function databasePriority(priority: unknown): string | undefined {
  if (priority === 'HIGH') return 'HIGH'
  if (priority === 'URGENT') return 'URGENT'
  if (priority === 'NORMAL') return 'MEDIUM'
  return undefined
}

function activityType(title: unknown): 'STATUS_CHANGED' | 'NOTE_ADDED' | 'ASSIGNED' | 'COMMENTED' | 'FILE_UPLOADED' {
  if (title === 'Internal Note Added') return 'NOTE_ADDED'
  if (title === 'Ticket Assigned' || title === 'Ticket Taken Up') return 'ASSIGNED'
  if (title === 'Comment Added') return 'COMMENTED'
  if (title === 'Attachment Uploaded') return 'FILE_UPLOADED'
  return 'STATUS_CHANGED'
}

export async function GET(_request: Request, context: { params: Promise<{ ticketNumber: string }> }) {
  const { ticketNumber } = await context.params
  const publicTicketNumber = parseTicketNumber(ticketNumber)
  const legacyTicketNumber = publicTicketNumber === null ? parseLegacyTicketNumber(ticketNumber) : null
  if (publicTicketNumber === null && legacyTicketNumber === null) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
  const admin = await getCurrentAdmin()
  const parent = admin ? null : await getCurrentParent()
  if (!admin && !parent) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  try {
    const ticket = await prisma.ticket.findUnique({
      where: publicTicketNumber !== null ? { ticketNumber: publicTicketNumber } : { legacyTicketNumber: legacyTicketNumber! },
      include: includeTicket,
    })
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    if (parent && ticket.reporterId !== parent.id) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    if (admin && !canAccessAdminTicket(admin.account, ticket)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    return NextResponse.json({ ticket: mapTicket(ticket) })
  } catch {
    return NextResponse.json({ error: 'Unable to load ticket from Neon.' }, { status: 503 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ ticketNumber: string }> }) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 })
  const { ticketNumber } = await context.params
  const publicTicketNumber = parseTicketNumber(ticketNumber)
  const legacyTicketNumber = publicTicketNumber === null ? parseLegacyTicketNumber(ticketNumber) : null
  if (publicTicketNumber === null && legacyTicketNumber === null) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  try {
    const existing = await prisma.ticket.findUnique({
      where: publicTicketNumber !== null ? { ticketNumber: publicTicketNumber } : { legacyTicketNumber: legacyTicketNumber! },
      include: { student: true },
    })
    if (!existing) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    if (!canAccessAdminTicket(admin.account, existing)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    if ((admin.account.role === 'VP_PRIMARY' || admin.account.role === 'VP_SECONDARY') && Array.isArray(existing.escalatedTo) && existing.escalatedTo.some((target) => target === 'PRINCIPAL' || target === 'DIRECTOR')) {
      return NextResponse.json({ error: 'This ticket is read-only after escalation.' }, { status: 403 })
    }

    const status = databaseStatus(body.status)
    const priority = databasePriority(body.priority)
    const update: Record<string, unknown> = {}
    if (status) update.status = status
    if (priority) update.priority = priority
    if (typeof body.assignedTo === 'string') update.schoolName = body.assignedTo
    if (typeof body.assignedAdminId === 'string') update.assignedAdminId = body.assignedAdminId
    if (typeof body.assignedAdminRole === 'string') update.assignedAdminRole = body.assignedAdminRole
    if (typeof body.takenUpBy === 'string') update.takenUpBy = body.takenUpBy
    if (typeof body.takenUpAt === 'string') update.takenUpAt = new Date(body.takenUpAt)
    if (Array.isArray(body.takenUpByAdminIds)) update.takenUpByAdminIds = body.takenUpByAdminIds
    if (body.takenUpAtByAdmin && typeof body.takenUpAtByAdmin === 'object') update.takenUpAtByAdmin = body.takenUpAtByAdmin
    if (Array.isArray(body.escalatedTo)) update.escalatedTo = body.escalatedTo
    if (typeof body.escalatedAt === 'string') update.escalatedAt = new Date(body.escalatedAt)
    if (status === 'RESOLVED') {
      update.resolvedBy = admin.account.adminId
      update.resolvedAt = new Date()
    }

    const activity = typeof body.activity === 'object' && body.activity !== null ? body.activity as Record<string, unknown> : null
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const ticket = await prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: existing.id }, data: update })
      if (activity) {
        await tx.ticketActivity.create({
          data: {
            ticketId: existing.id,
            actorAdminId: admin.account.adminId,
            actorAdminRole: admin.account.role,
            type: activityType(activity.title),
            message: typeof activity.description === 'string' ? activity.description : 'Ticket updated.',
          },
        })
      }
      if (note) {
        await tx.ticketNote.create({ data: { ticketId: existing.id, authorAdminId: admin.account.adminId, body: note, isInternal: true } })
      }
      return tx.ticket.findUnique({ where: { id: existing.id }, include: includeTicket })
    })
    return NextResponse.json({ ticket: ticket ? mapTicket(ticket) : null })
  } catch {
    return NextResponse.json({ error: 'Unable to save the ticket to Neon.' }, { status: 503 })
  }
}

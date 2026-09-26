import { Prisma, type Prisma as PrismaTypes } from '@prisma/client'

type AdminIdentity = { adminId: string; role: string }
type AdminTicket = { studentSnapshot: unknown; student: { className: string } | null; escalatedTo?: unknown; takenUpByAdminIds?: unknown; resolvedBy?: string | null }

function getClassNumber(ticket: Pick<AdminTicket, 'studentSnapshot' | 'student'>): number | null {
  const snapshot = typeof ticket.studentSnapshot === 'object' && ticket.studentSnapshot !== null
    ? ticket.studentSnapshot as Record<string, unknown>
    : null
  const className = typeof snapshot?.className === 'string' ? snapshot.className : ticket.student?.className ?? ''
  const match = className.match(/(\d+)/)
  return match ? Number(match[1]) : null
}

function getClassNames(minimum: number, maximum: number): string[] {
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => `Class ${minimum + index}`)
}

function getClassVisibilityWhere(minimum: number, maximum: number): PrismaTypes.TicketWhereInput {
  const classNames = getClassNames(minimum, maximum)
  return {
    OR: [
      ...classNames.map((className) => ({ studentSnapshot: { path: ['className'], equals: className } })),
      {
        AND: [
          { studentSnapshot: { equals: Prisma.DbNull } },
          { student: { className: { in: classNames } } },
        ],
      },
    ],
  }
}

export function getAdminTicketVisibilityWhere(admin: AdminIdentity): PrismaTypes.TicketWhereInput {
  if (admin.role === 'VP_PRIMARY') return getClassVisibilityWhere(1, 5)
  if (admin.role === 'VP_SECONDARY') return getClassVisibilityWhere(6, 10)
  if (admin.role === 'PRINCIPAL' || admin.role === 'DIRECTOR') {
    return {
      OR: [
        getClassVisibilityWhere(1, 10),
        { escalatedTo: { array_contains: [admin.role] } },
        { takenUpByAdminIds: { array_contains: [admin.adminId] } },
        { resolvedBy: admin.adminId },
      ],
    }
  }
  return { id: '__no_admin_visibility__' }
}

export function canAccessAdminTicket(admin: AdminIdentity, ticket: AdminTicket): boolean {
  const classNumber = getClassNumber(ticket)
  if (admin.role === 'VP_PRIMARY') return classNumber !== null && classNumber >= 1 && classNumber <= 5
  if (admin.role === 'VP_SECONDARY') return classNumber !== null && classNumber >= 6 && classNumber <= 10
  if (admin.role !== 'PRINCIPAL' && admin.role !== 'DIRECTOR') return false

  if (classNumber !== null && classNumber >= 1 && classNumber <= 10) return true

  const escalatedTo = Array.isArray(ticket.escalatedTo) ? ticket.escalatedTo : []
  const takenUpByAdminIds = Array.isArray(ticket.takenUpByAdminIds) ? ticket.takenUpByAdminIds : []
  if (escalatedTo.includes(admin.role)) return true
  if (takenUpByAdminIds.includes(admin.adminId)) return true
  if (ticket.resolvedBy === admin.adminId) return true
  return false
}

export function canMutateAdminTicket(admin: AdminIdentity, ticket: AdminTicket): boolean {
  const classNumber = getClassNumber(ticket)
  const escalatedTo = Array.isArray(ticket.escalatedTo) ? ticket.escalatedTo : []
  const takenUpByAdminIds = Array.isArray(ticket.takenUpByAdminIds) ? ticket.takenUpByAdminIds : []

  if (admin.role === 'VP_PRIMARY') {
    const isOwnQueueTicket = classNumber !== null && classNumber >= 1 && classNumber <= 5
    return isOwnQueueTicket && !escalatedTo.some((target) => target === 'PRINCIPAL' || target === 'DIRECTOR')
  }
  if (admin.role === 'VP_SECONDARY') {
    const isOwnQueueTicket = classNumber !== null && classNumber >= 6 && classNumber <= 10
    return isOwnQueueTicket && !escalatedTo.some((target) => target === 'PRINCIPAL' || target === 'DIRECTOR')
  }
  if (admin.role !== 'PRINCIPAL' && admin.role !== 'DIRECTOR') return false

  if (escalatedTo.includes(admin.role)) return true
  if (takenUpByAdminIds.includes(admin.adminId)) return true
  if (ticket.resolvedBy === admin.adminId) return true
  return false
}
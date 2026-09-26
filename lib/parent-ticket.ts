import type { Prisma, TicketCategory } from '@prisma/client'

type ParentTicketTransaction = Pick<Prisma.TransactionClient, 'student' | 'ticket' | 'ticketActivity' | 'attachment'>
type TicketStudent = {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
  className: string
  section: string
  rollNumber: string
  house: string
  modeOfTransport: string | null
  busNumber: string | null
  busRoute: string | null
}

type ParentTicketInput = {
  parent: { id: string; name: string; email: string; phone: string; emergencyPhone?: string }
  studentLink: { relationshipType: string; student: TicketStudent }
  className: string
  section: string
  title: string
  description: string
  category: TicketCategory
  attachments: Array<{ fileName: string; storageKey: string; mimeType: string; sizeBytes: number }>
}

export class ParentTicketOwnershipError extends Error {}

export async function createParentTicketInTransaction(
  tx: ParentTicketTransaction,
  input: ParentTicketInput,
): Promise<string> {
  const student = await tx.student.update({
    where: { id: input.studentLink.student.id },
    data: { className: input.className, section: input.section },
  })
  const studentName = `${student.firstName} ${student.lastName}`.trim()
  const relationship = input.studentLink.relationshipType === 'OTHER' ? 'Other' : 'Parent/Guardian'
  const snapshot = {
    parentName: input.parent.name,
    email: input.parent.email,
    phone: input.parent.phone,
    emergencyPhone: input.parent.emergencyPhone,
    relationship,
    studentName,
    admissionNumber: student.admissionNumber,
    className: student.className,
    section: student.section,
    rollNumber: student.rollNumber,
    house: student.house,
    modeOfTransport: student.modeOfTransport,
    busNumber: student.busNumber,
    busRoute: student.busRoute,
  }

  const ticket = await tx.ticket.create({
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      reporterId: input.parent.id,
      studentId: student.id,
      parentSnapshot: snapshot,
      studentSnapshot: { ...snapshot },
    },
  })
  await tx.ticketActivity.create({
    data: {
      ticketId: ticket.id,
      type: 'STATUS_CHANGED',
      message: 'Your concern was submitted through the Helios Parent Support Desk.',
    },
  })
  for (const attachment of input.attachments) {
    await tx.attachment.create({ data: { ticketId: ticket.id, ...attachment } })
  }

  return ticket.id
}
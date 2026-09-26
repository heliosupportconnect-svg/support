import type { Prisma } from '@prisma/client'

type StudentRegistrationDetails = {
  name: string
  className: string
  section: string
  rollNumber: string
  house: string
}

type ExistingStudent = {
  firstName: string
  lastName: string
  className: string
  section: string
  rollNumber: string
  house: string
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function splitStudentName(value: string): { firstName: string; lastName: string } {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  const [firstName = '', ...lastNameParts] = normalized.split(' ')
  return { firstName, lastName: lastNameParts.join(' ') }
}

export function matchesExistingStudent(details: StudentRegistrationDetails, student: ExistingStudent): boolean {
  return normalize(details.name) === normalize(`${student.firstName} ${student.lastName}`) &&
    normalize(details.className) === normalize(student.className) &&
    normalize(details.section) === normalize(student.section) &&
    normalize(details.rollNumber) === normalize(student.rollNumber) &&
    normalize(details.house) === normalize(student.house)
}

type RegistrationStudent = {
  admissionNumber: string
  name: string
  className: string
  section: string
  rollNumber: string
  house: string
  modeOfTransport?: 'Self Transport' | 'School Bus' | ''
  busNumber?: string
  busRoute?: string
}

export type ParentRegistrationRecord = {
  name: string
  email: string
  phone: string
  emergencyPhone: string
  passwordHash: string
  relationship: string
  student: RegistrationStudent
}

type RegistrationTransaction = Pick<Prisma.TransactionClient, 'student' | 'user' | 'parentStudent'>

export class ExistingParentAccountError extends Error {}
export class StudentAdmissionConflictError extends Error {}

export async function createParentRegistration(
  transaction: RegistrationTransaction,
  input: ParentRegistrationRecord,
): Promise<{ id: string }> {
  const existingAccount = await transaction.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
    select: { id: true },
  })
  if (existingAccount) throw new ExistingParentAccountError()

  const existingStudent = await transaction.student.findUnique({
    where: { admissionNumber: input.student.admissionNumber },
    include: { parentLinks: { select: { userId: true } } },
  })

  let studentId: string
  if (existingStudent) {
    if (existingStudent.parentLinks.length > 0 || !matchesExistingStudent(input.student, existingStudent)) {
      throw new StudentAdmissionConflictError()
    }
    studentId = existingStudent.id
  } else {
    const { firstName, lastName } = splitStudentName(input.student.name)
    const student = await transaction.student.create({
      data: {
        admissionNumber: input.student.admissionNumber,
        firstName,
        lastName,
        className: input.student.className,
        section: input.student.section,
        rollNumber: input.student.rollNumber,
        house: input.student.house,
        modeOfTransport: input.student.modeOfTransport || null,
        busNumber: input.student.busNumber || null,
        busRoute: input.student.busRoute || null,
      },
    })
    studentId = student.id
  }

  const user = await transaction.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      emergencyPhone: input.emergencyPhone || null,
      passwordHash: input.passwordHash,
      role: 'PARENT',
    },
  })

  await transaction.parentStudent.create({
    data: {
      userId: user.id,
      studentId,
      relationshipType: input.relationship.toLowerCase() === 'other' ? 'OTHER' : 'PARENT_GUARDIAN',
    },
  })

  return { id: user.id }
}

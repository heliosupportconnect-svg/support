import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { createSession, toSafeParent } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { prisma } from '@/lib/prisma'
import { matchesExistingStudent } from '@/lib/registration-student'

type RegistrationInput = {
  name: string
  email: string
  phone: string
  emergencyPhone: string
  password: string
  relationship: string
  student: {
    admissionNumber: string
    name: string
    className: string
    section: string
    rollNumber: string
    house: string
    busNumber?: string
    busRoute?: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseRegistrationInput(value: unknown): RegistrationInput | null {
  if (!isRecord(value) || !isRecord(value.student)) return null

  const input: RegistrationInput = {
    name: readString(value.name),
    email: readString(value.email).toLowerCase(),
    phone: readString(value.phone),
    emergencyPhone: readString(value.emergencyPhone),
    password: typeof value.password === 'string' ? value.password : '',
    relationship: readString(value.relationship),
    student: {
      admissionNumber: readString(value.student.admissionNumber),
      name: readString(value.student.name),
      className: readString(value.student.className),
      section: readString(value.student.section),
      rollNumber: readString(value.student.rollNumber),
      house: readString(value.student.house),
      busNumber: readString(value.student.busNumber),
      busRoute: readString(value.student.busRoute),
    },
  }

  if (
    !input.name ||
    !input.email ||
    !input.phone ||
    !input.password ||
    !input.relationship ||
    !input.student.admissionNumber ||
    !input.student.name ||
    !input.student.className ||
    !input.student.section ||
    !input.student.rollNumber ||
    !input.student.house ||
    (input.student.busNumber && input.student.busNumber.length > 80) ||
    (input.student.busRoute && input.student.busRoute.length > 160)
  ) {
    return null
  }

  return input
}

export async function POST(request: Request) {
  let input: RegistrationInput | null

  try {
    input = parseRegistrationInput(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!input || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.password.length < 8) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  try {
    const student = await prisma.student.findUnique({ where: { admissionNumber: input.student.admissionNumber } })
    if (!student || !matchesExistingStudent(input.student, student)) {
      return NextResponse.json({ error: 'Student details could not be verified. Contact school administration.' }, { status: 403 })
    }

    const passwordHash = await hashPassword(input.password)
    const relationshipType = input.relationship.toLowerCase() === 'other'
      ? 'OTHER'
      : 'PARENT_GUARDIAN'

    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          emergencyPhone: input.emergencyPhone || null,
          passwordHash,
          role: 'PARENT',
        },
      })

      await transaction.parentStudent.create({
        data: {
          userId: createdUser.id,
          studentId: student.id,
          relationshipType,
        },
      })

      return createdUser
    })

    await createSession(user.id)

    const parent = await prisma.user.findUnique({
      where: { id: user.id },
      include: { studentLinks: { include: { student: true } } },
    })
    return NextResponse.json({ parent: parent ? toSafeParent(parent) : null }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'An account with this information already exists.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isParentTicketOwner, resolveTicketAudience } from '../lib/ticket-access.ts'
import { splitStudentName, createParentRegistration, ExistingParentAccountError, StudentAdmissionConflictError } from '../lib/registration-student.ts'
import { findParentOwnedStudentLink } from '../lib/parent-student-access.ts'
import { formatTicketIdentifier, parseTicketNumber } from '../lib/ticket-number.ts'
import { parseParentReplyMessage } from '../lib/parent-reply.ts'
import { createHash } from 'node:crypto'
import { getParentAttachmentUrl, mapParentAttachment, parseParentAttachmentOrdinal } from '../lib/parent-attachment.ts'
import { deriveResolutionOwnership, deriveTakeUpOwnership, getAvailableTicketStatuses, getQueueForStudentClass, normalizeStudentClass, normalizeStudentSection, validateAssignmentMutation, validateEscalationMutation, validateStatusTransition, canReorderDashboardSlides } from '../lib/ticket-policy.ts'
import { parseDashboardSlidePayload } from '../lib/dashboard-slide-input.ts'
import { canAccessAdminTicket, canMutateAdminTicket, getAdminTakenTicketWhere, getAdminTicketVisibilityWhere } from '../lib/admin-ticket-access.ts'
import { createParentTicketInTransaction } from '../lib/parent-ticket.ts'
import { deleteDashboardObject, replaceDashboardObject } from '../lib/dashboard-storage-lifecycle.ts'
import { ADMIN_ROLES } from '../lib/client-admin-auth.ts'
import { verifyAdminPassword } from '../lib/password.ts'

const ticketForClass = (className) => ({ studentSnapshot: { className }, student: null })

test('parent access requires the ticket reporter identity', () => {
  assert.equal(isParentTicketOwner('parent-a', 'parent-a'), true)
  assert.equal(isParentTicketOwner('parent-a', 'parent-b'), false)
})

test('parent attachment DTO hides database IDs and exposes secure view/download URLs', async () => {
  const dto = mapParentAttachment('HL-000042', { id: 'internal-attachment-secret', fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 123 }, 0)
  assert.equal(JSON.stringify(dto).includes('internal-attachment-secret'), false)
  assert.deepEqual(dto, {
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    url: '/api/tickets/HL-000042/attachments/1',
  })
  assert.equal(getParentAttachmentUrl('HL-000042', 1), '/api/tickets/HL-000042/attachments/1')
  assert.equal(getParentAttachmentUrl('HL-000042', 1, true), '/api/tickets/HL-000042/attachments/1?download=1')
  assert.equal(parseParentAttachmentOrdinal('1'), 1)
  assert.equal(parseParentAttachmentOrdinal('0'), null)
  assert.equal(parseParentAttachmentOrdinal('internal-attachment-secret'), null)

  const route = await readFile(new URL('../app/api/tickets/[ticketNumber]/attachments/[attachmentId]/route.ts', import.meta.url), 'utf8')
  const ticketRoute = await readFile(new URL('../app/api/tickets/route.ts', import.meta.url), 'utf8')
  const parentPage = await readFile(new URL('../app/parent/tickets/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(ticketRoute, /audience === 'parent'\s*\? mapParentAttachment/)
  assert.equal(parentPage.includes("href={attachment.url ?? '#'}"), true)
  assert.equal(parentPage.includes("${attachment.url ?? '#'}?download=1"), true)
  assert.ok(route.indexOf('isParentTicketOwner(parent.id, ticket.reporterId)') < route.indexOf('prisma.attachment.findMany'))
  assert.ok(route.indexOf('isParentTicketOwner(parent.id, ticket.reporterId)') < route.indexOf('createSignedObjectUrl('))
  assert.match(route, /searchParams\.get\('download'\) === '1'/)
  assert.equal(isParentTicketOwner('parent-b', 'parent-a'), false)
})

test('ticket audience rejects simultaneous valid parent and admin sessions', () => {
  assert.equal(resolveTicketAudience(false, false), null)
  assert.equal(resolveTicketAudience(false, true), 'parent')
  assert.equal(resolveTicketAudience(true, false), 'admin')
  assert.equal(resolveTicketAudience(true, true), 'ambiguous')
})

test('parent ticket handlers fail closed on simultaneous parent and admin sessions', async () => {
  const routePaths = [
    '../app/api/tickets/route.ts',
    '../app/api/tickets/[ticketNumber]/route.ts',
    '../app/api/tickets/[ticketNumber]/reply/route.ts',
    '../app/api/tickets/[ticketNumber]/attachments/[attachmentId]/route.ts',
  ]
  const sources = await Promise.all(routePaths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  for (const source of sources) {
    assert.match(source, /resolveTicketAudience\(Boolean\(admin\), Boolean\(parent\)\)/)
    assert.match(source, /audience === 'ambiguous'/)
  }
})

test('VP class access is disjoint and Principal/Director can inspect both queues', () => {
  for (let classNumber = 1; classNumber <= 5; classNumber++) {
    assert.equal(canAccessAdminTicket({ adminId: 'primary', role: 'VP_PRIMARY' }, ticketForClass(`Class ${classNumber}`)), true)
    assert.equal(canAccessAdminTicket({ adminId: 'secondary', role: 'VP_SECONDARY' }, ticketForClass(`Class ${classNumber}`)), false)
    assert.equal(canAccessAdminTicket({ adminId: 'principal', role: 'PRINCIPAL' }, ticketForClass(`Class ${classNumber}`)), true)
    assert.equal(canAccessAdminTicket({ adminId: 'director', role: 'DIRECTOR' }, ticketForClass(`Class ${classNumber}`)), true)
  }
  for (let classNumber = 6; classNumber <= 10; classNumber++) {
    assert.equal(canAccessAdminTicket({ adminId: 'primary', role: 'VP_PRIMARY' }, ticketForClass(`Class ${classNumber}`)), false)
    assert.equal(canAccessAdminTicket({ adminId: 'secondary', role: 'VP_SECONDARY' }, ticketForClass(`Class ${classNumber}`)), true)
    assert.equal(canAccessAdminTicket({ adminId: 'principal', role: 'PRINCIPAL' }, ticketForClass(`Class ${classNumber}`)), true)
    assert.equal(canAccessAdminTicket({ adminId: 'director', role: 'DIRECTOR' }, ticketForClass(`Class ${classNumber}`)), true)
  }
  assert.equal(canAccessAdminTicket({ adminId: 'primary', role: 'VP_PRIMARY' }, ticketForClass('LKG')), false)
  assert.equal(canAccessAdminTicket({ adminId: 'secondary', role: 'VP_SECONDARY' }, ticketForClass('UKG')), false)
})

test('student placement maps only configured classes to the intended VP queue', () => {
  assert.equal(normalizeStudentClass('lkg'), 'LKG')
  assert.equal(normalizeStudentClass('UKG'), 'UKG')
  assert.equal(getQueueForStudentClass('LKG'), null)
  assert.equal(getQueueForStudentClass('UKG'), null)
  assert.equal(getQueueForStudentClass('Class 5'), 'VP_PRIMARY')
  assert.equal(getQueueForStudentClass('Class 6'), 'VP_SECONDARY')
  assert.equal(getQueueForStudentClass('Class 11'), null)
  assert.equal(normalizeStudentSection('section b'), 'Section B')
  for (const value of ['LKG', 'UKG', ...Array.from({ length: 10 }, (_, index) => `${index + 1}`), ...Array.from({ length: 10 }, (_, index) => `Class ${index + 1}`)]) {
    assert.notEqual(normalizeStudentClass(value), null)
  }
  assert.equal(normalizeStudentClass('Class 11'), null)
  assert.equal(normalizeStudentClass(''), null)
  assert.equal(normalizeStudentClass('Grade Three'), null)
  assert.equal(normalizeStudentSection(''), null)
  assert.equal(normalizeStudentSection('Section C'), null)
  assert.equal(normalizeStudentSection('A'), 'Section A')
  assert.equal(normalizeStudentSection('B'), 'Section B')
})

test('VPs cannot mutate assignment fields in ticket PATCH payloads', () => {
  for (const role of ['VP_PRIMARY', 'VP_SECONDARY', 'PRINCIPAL', 'DIRECTOR']) {
    for (const field of ['assignedAdminId', 'assignedAdminRole', 'assignedTo']) {
      assert.equal(validateAssignmentMutation({ [field]: `attacker-${role}` }), 403)
    }
  }
  assert.equal(validateAssignmentMutation({ status: 'IN_PROGRESS' }), null)
})

test('Principal, Director, and VP assignment metadata is always server-derived', async () => {
  const route = await readFile(new URL('../app/api/tickets/[ticketNumber]/route.ts', import.meta.url), 'utf8')
  assert.match(route, /validateAssignmentMutation\(body\)/)
  assert.match(route, /Assignment metadata is server-managed/)
  assert.doesNotMatch(route, /update\.assignedAdminId = body\.assignedAdminId/)
  assert.doesNotMatch(route, /update\.assignedAdminRole = body\.assignedAdminRole/)
  assert.doesNotMatch(route, /update\.schoolName = body\.assignedTo/)
})

test('take-up and resolution ownership are derived from the authenticated admin ID', () => {
  const now = new Date('2026-09-26T12:00:00.000Z')
  for (const admin of [{ id: 'principal-auth', role: 'PRINCIPAL' }, { id: 'director-auth', role: 'DIRECTOR' }]) {
    const takeUp = deriveTakeUpOwnership({ takenUpBy: null, takenUpAt: null, takenUpByAdminIds: [], takenUpAtByAdmin: {} }, admin.id, now)
    assert.equal(takeUp.takenUpBy, admin.id)
    assert.deepEqual(takeUp.takenUpByAdminIds, [admin.id])
    assert.equal(takeUp.takenUpAt, now)
    assert.equal(takeUp.takenUpAtByAdmin[admin.id], now.toISOString())
    assert.deepEqual(deriveResolutionOwnership(admin.id, now), { resolvedBy: admin.id, resolvedAt: now })
  }
})

test('VP queue access never falls back to current student placement for snapshotless tickets', () => {
  const snapshotless = { studentSnapshot: null, student: { className: 'Class 3' }, escalatedTo: [], takenUpByAdminIds: [], resolvedBy: null }
  assert.equal(canAccessAdminTicket({ adminId: 'primary', role: 'VP_PRIMARY' }, snapshotless), false)
  assert.equal(canAccessAdminTicket({ adminId: 'secondary', role: 'VP_SECONDARY' }, snapshotless), false)
  const primaryWhere = getAdminTicketVisibilityWhere({ adminId: 'primary', role: 'VP_PRIMARY' })
  assert.equal(primaryWhere.OR.some((clause) => 'student' in clause), false)
})

test('claimed ticket queries are scoped to both status and authenticated admin identity', () => {
  for (const admin of [{ adminId: 'principal-a', role: 'PRINCIPAL' }, { adminId: 'director-a', role: 'DIRECTOR' }]) {
    const where = getAdminTakenTicketWhere(admin)
    assert.equal(where.AND[1].status, 'IN_REVIEW')
    assert.deepEqual(where.AND[2].OR, [
      { takenUpBy: admin.adminId },
      { takenUpByAdminIds: { array_contains: [admin.adminId] } },
    ])
  }
})

test('claimed-ticket page uses the authenticated admin-scoped API', async () => {
  const route = await readFile(new URL('../app/api/admin/tickets/taken/route.ts', import.meta.url), 'utf8')
  const page = await readFile(new URL('../app/admin/taken/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /getCurrentAdmin\(\)/)
  assert.match(route, /getAdminTakenTicketWhere\(admin\.account\)/)
  assert.match(page, /loadTakenUpTickets\(\)/)
  assert.doesNotMatch(page, /loadTickets\(\)/)
})

const registrationInput = {
  name: 'Parent Example',
  email: 'parent@example.test',
  phone: '9999990001',
  emergencyPhone: '9999990002',
  passwordHash: 'test-hash',
  relationship: 'Mother',
  student: {
    admissionNumber: 'HL-TEST-1',
    name: 'Asha Rao',
    className: 'Class 4',
    section: 'Section A',
    rollNumber: '12',
    house: 'Sun',
    modeOfTransport: 'School Bus',
    busNumber: 'Bus 5',
    busRoute: 'North route',
  },
}

function createRegistrationTransaction({ existingStudent = null, existingParentLinks = [], existingAccounts = [] } = {}) {
  const state = {
    students: existingStudent ? [{ id: 'student-existing', ...existingStudent }] : [],
    users: [],
    links: existingParentLinks.map((userId) => ({ userId, studentId: 'student-existing' })),
  }
  const transaction = {
    student: {
      findUnique: async ({ where }) => {
        const student = state.students.find((candidate) => candidate.admissionNumber === where.admissionNumber)
        return student ? { ...student, parentLinks: state.links.filter((link) => link.studentId === student.id) } : null
      },
      create: async ({ data }) => {
        if (state.students.some((student) => student.admissionNumber === data.admissionNumber)) {
          throw Object.assign(new Error('unique admission'), { code: 'P2002' })
        }
        const student = { id: `student-${state.students.length + 1}`, ...data }
        state.students.push(student)
        return student
      },
    },
    user: {
      findFirst: async ({ where }) => existingAccounts.find((account) => where.OR.some((item) =>
        ('email' in item && item.email === account.email) || ('phone' in item && item.phone === account.phone))) ?? null,
      create: async ({ data }) => {
        const user = { id: `parent-${state.users.length + 1}`, ...data }
        state.users.push(user)
        return user
      },
    },
    parentStudent: {
      create: async ({ data }) => {
        const link = { id: `link-${state.links.length + 1}`, ...data }
        state.links.push(link)
        return link
      },
    },
  }
  return { transaction, state }
}

test('new parent registration creates a Student, User, and ParentStudent link together', async () => {
  const { transaction, state } = createRegistrationTransaction()
  const parent = await createParentRegistration(transaction, registrationInput)

  assert.equal(state.students.length, 1)
  assert.deepEqual(
    { firstName: state.students[0].firstName, lastName: state.students[0].lastName },
    splitStudentName(registrationInput.student.name),
  )
  assert.equal(state.students[0].admissionNumber, registrationInput.student.admissionNumber)
  assert.equal(state.students[0].className, registrationInput.student.className)
  assert.equal(state.students[0].section, registrationInput.student.section)
  assert.equal(state.students[0].modeOfTransport, 'School Bus')
  assert.equal(state.students[0].busNumber, 'Bus 5')
  assert.equal(state.users.length, 1)
  assert.equal(state.links.length, 1)
  assert.deepEqual(state.links[0], {
    id: 'link-1', userId: parent.id, studentId: state.students[0].id, relationshipType: 'PARENT_GUARDIAN',
  })
})

test('registration rejects an admission number already linked to another parent without creating duplicates', async () => {
  const existing = { admissionNumber: 'HL-TEST-1', firstName: 'Asha', lastName: 'Rao', className: 'Class 4', section: 'Section A', rollNumber: '12', house: 'Sun' }
  const { transaction, state } = createRegistrationTransaction({ existingStudent: existing, existingParentLinks: ['existing-parent'] })

  await assert.rejects(createParentRegistration(transaction, registrationInput), StudentAdmissionConflictError)
  assert.equal(state.students.length, 1)
  assert.equal(state.users.length, 0)
  assert.equal(state.links.length, 1)
})

test('registration reuses a matching unlinked student and rejects inconsistent admission data', async () => {
  const existing = { admissionNumber: 'HL-TEST-1', firstName: 'Asha', lastName: 'Rao', className: 'Class 4', section: 'Section A', rollNumber: '12', house: 'Sun' }
  const available = createRegistrationTransaction({ existingStudent: existing })
  await createParentRegistration(available.transaction, registrationInput)
  assert.equal(available.state.students.length, 1)
  assert.equal(available.state.links.length, 1)

  const conflicting = createRegistrationTransaction({ existingStudent: { ...existing, className: 'Class 5' } })
  await assert.rejects(createParentRegistration(conflicting.transaction, registrationInput), StudentAdmissionConflictError)
  assert.equal(conflicting.state.students.length, 1)
  assert.equal(conflicting.state.users.length, 0)
  assert.equal(conflicting.state.links.length, 0)
})

test('registration rejects duplicate parent contact information before creating a student', async () => {
  const { transaction, state } = createRegistrationTransaction({ existingAccounts: [{ id: 'existing-parent', phone: registrationInput.phone }] })
  await assert.rejects(createParentRegistration(transaction, registrationInput), ExistingParentAccountError)
  assert.equal(state.students.length, 0)
  assert.equal(state.users.length, 0)
  assert.equal(state.links.length, 0)
})

test('ticket student lookup is scoped to the authenticated parent and uses stored student placement', async () => {
  const links = [
    { userId: 'parent-a', studentId: 'student-a', student: { id: 'student-a', admissionNumber: 'HL-A', className: 'Class 6', section: 'Section B' } },
    { userId: 'parent-b', studentId: 'student-b', student: { id: 'student-b', admissionNumber: 'HL-B', className: 'Class 2', section: 'Section A' } },
  ]
  const parentStudent = {
    findFirst: async ({ where }) => links.find((link) => link.userId === where.userId && where.OR.some((selector) =>
      selector.studentId === link.studentId || selector.student?.admissionNumber === link.student.admissionNumber)) ?? null,
  }
  const ownedLink = await findParentOwnedStudentLink(parentStudent, 'parent-a', 'HL-A')
  assert.equal(ownedLink.student.className, 'Class 6')
  assert.equal(getQueueForStudentClass(ownedLink.student.className), 'VP_SECONDARY')
  assert.equal(await findParentOwnedStudentLink(parentStudent, 'parent-a', 'HL-B'), null)
  assert.equal(await findParentOwnedStudentLink(parentStudent, 'parent-b', 'HL-A'), null)
})

test('ticket route snapshots stored linked-student placement rather than client class fields', async () => {
  const ticketRoute = await readFile(new URL('../app/api/tickets/route.ts', import.meta.url), 'utf8')
  const ticketHelper = await readFile(new URL('../lib/parent-ticket.ts', import.meta.url), 'utf8')
  assert.match(ticketRoute, /findParentOwnedStudentLink\(prisma\.parentStudent, parent\.id, requestedStudentId\)/)
  assert.match(ticketRoute, /normalizeStudentClass\(typeof payload\.className/)
  assert.match(ticketRoute, /normalizeStudentSection\(typeof payload\.section/)
  assert.match(ticketRoute, /prisma\.\$transaction\(async \(tx\)/)
  assert.match(ticketRoute, /createParentTicketInTransaction\(tx/)
  assert.match(ticketHelper, /tx\.student\.update/)
  assert.match(ticketHelper, /studentSnapshot: \{ \.\.\.snapshot \}/)
})

test('registration API normalizes and rejects unsupported student placement', async () => {
  const route = await readFile(new URL('../app/api/auth/register/route.ts', import.meta.url), 'utf8')
  assert.match(route, /normalizeStudentClass\(readString\(value\.student\.className\)\)/)
  assert.match(route, /normalizeStudentSection\(readString\(value\.student\.section\)\)/)
  assert.match(route, /if \(!className \|\| !section\) return null/)
})

function createParentTicketHarness({ failStudentUpdate = false, failTicketCreate = false } = {}) {
  const state = {
    student: {
      id: 'student-a', admissionNumber: 'HL-A', firstName: 'Asha', lastName: 'Rao', className: 'Class 3', section: 'Section A',
      rollNumber: '12', house: 'Sun', modeOfTransport: null, busNumber: null, busRoute: null,
    },
    tickets: [],
    activities: [],
  }
  let nextTicket = 1
  const tx = {
    student: {
      update: async ({ where, data }) => {
        if (where.id !== state.student.id) throw new Error('student missing')
        if (failStudentUpdate) throw new Error('student update failed')
        Object.assign(state.student, data)
        return { ...state.student }
      },
    },
    ticket: {
      create: async ({ data }) => {
        if (failTicketCreate) throw new Error('ticket creation failed')
        const ticket = { id: `ticket-${nextTicket++}`, ticketNumber: nextTicket - 1, ...data }
        state.tickets.push(ticket)
        return ticket
      },
    },
    ticketActivity: { create: async ({ data }) => state.activities.push(data) },
    attachment: { create: async () => undefined },
  }
  const transaction = async (callback) => {
    const before = structuredClone(state)
    try {
      return await callback(tx)
    } catch (error) {
      Object.assign(state, before)
      throw error
    }
  }
  return { state, transaction }
}

const parentTicketInput = (className, section, title) => ({
  parent: { id: 'parent-a', name: 'Parent A', email: 'parent-a@example.test', phone: '9000000001' },
  studentLink: {
    relationshipType: 'PARENT_GUARDIAN',
    student: {
      id: 'student-a', admissionNumber: 'HL-A', firstName: 'Asha', lastName: 'Rao', className: 'Class 3', section: 'Section A',
      rollNumber: '12', house: 'Sun', modeOfTransport: null, busNumber: null, busRoute: null,
    },
  },
  className, section, title, description: 'Test ticket', category: 'ACADEMIC', attachments: [],
})

test('ticket submissions update current placement and preserve each ticket snapshot and queue', async () => {
  const harness = createParentTicketHarness()
  const submit = (className, section, title) => harness.transaction((tx) => createParentTicketInTransaction(tx, parentTicketInput(className, section, title)))

  await submit('Class 3', 'Section A', 'Ticket A')
  await submit('Class 8', 'Section B', 'Ticket B')
  await submit('Class 5', 'Section A', 'Ticket C')

  assert.deepEqual({ className: harness.state.student.className, section: harness.state.student.section }, { className: 'Class 5', section: 'Section A' })
  assert.deepEqual(harness.state.tickets.map((ticket) => [ticket.title, ticket.studentSnapshot.className, ticket.studentSnapshot.section]), [
    ['Ticket A', 'Class 3', 'Section A'],
    ['Ticket B', 'Class 8', 'Section B'],
    ['Ticket C', 'Class 5', 'Section A'],
  ])
  assert.deepEqual(harness.state.tickets.map((ticket) => getQueueForStudentClass(ticket.studentSnapshot.className)), ['VP_PRIMARY', 'VP_SECONDARY', 'VP_PRIMARY'])
  assert.deepEqual(harness.state.tickets.filter((ticket) => ticket.reporterId === 'parent-a').map((ticket) => ticket.title), ['Ticket A', 'Ticket B', 'Ticket C'])
})

test('ticket creation failure rolls back the current student placement update', async () => {
  const harness = createParentTicketHarness({ failTicketCreate: true })
  await assert.rejects(
    harness.transaction((tx) => createParentTicketInTransaction(tx, parentTicketInput('Class 8', 'Section B', 'Ticket B'))),
    /ticket creation failed/,
  )
  assert.deepEqual({ className: harness.state.student.className, section: harness.state.student.section }, { className: 'Class 3', section: 'Section A' })
  assert.equal(harness.state.tickets.length, 0)
})

test('student placement update failure prevents ticket creation', async () => {
  const harness = createParentTicketHarness({ failStudentUpdate: true })
  await assert.rejects(
    harness.transaction((tx) => createParentTicketInTransaction(tx, parentTicketInput('Class 8', 'Section B', 'Ticket B'))),
    /student update failed/,
  )
  assert.deepEqual({ className: harness.state.student.className, section: harness.state.student.section }, { className: 'Class 3', section: 'Section A' })
  assert.equal(harness.state.tickets.length, 0)
})

test('VP escalation accepts only the three intended targets while ticket remains active', () => {
  const validate = (role, currentStatus, currentTargets, escalatedTo) => validateEscalationMutation(role, currentStatus, currentTargets, {
    status: 'IN_PROGRESS', escalatedTo, escalatedAt: new Date().toISOString(),
  })
  for (const role of ['VP_PRIMARY', 'VP_SECONDARY']) {
    assert.equal(validate(role, 'OPEN', null, ['PRINCIPAL']), null)
    assert.equal(validate(role, 'OPEN', null, ['DIRECTOR']), null)
    assert.equal(validate(role, 'OPEN', null, ['PRINCIPAL', 'DIRECTOR']), null)
    assert.equal(validate(role, 'OPEN', null, ['VP_SECONDARY']), 400)
    assert.equal(validate(role, 'OPEN', null, ['PRINCIPAL', 'PRINCIPAL']), 400)
    assert.equal(validate(role, 'IN_REVIEW', ['PRINCIPAL'], ['DIRECTOR']), 403)
    assert.equal(validate(role, 'RESOLVED', null, ['DIRECTOR']), 403)
  }
  assert.equal(validate('PRINCIPAL', 'OPEN', null, ['DIRECTOR']), 403)
  assert.equal(validate('DIRECTOR', 'OPEN', null, ['PRINCIPAL']), 403)
})

test('Principal and Director can view both VP queues but cannot mutate unrelated tickets', () => {
  const vpTicket = { studentSnapshot: { className: 'Class 3' }, student: null, escalatedTo: [], takenUpByAdminIds: [], resolvedBy: null }
  const principalTicket = { studentSnapshot: { className: 'Class 7' }, student: null, escalatedTo: [], takenUpByAdminIds: [], resolvedBy: null }
  const principalEscalated = { studentSnapshot: { className: 'Class 8' }, student: null, escalatedTo: ['PRINCIPAL'], takenUpByAdminIds: [], resolvedBy: null }
  const directorEscalated = { studentSnapshot: { className: 'Class 4' }, student: null, escalatedTo: ['DIRECTOR'], takenUpByAdminIds: [], resolvedBy: null }
  assert.equal(canAccessAdminTicket({ adminId: 'principal', role: 'PRINCIPAL' }, principalTicket), true)
  assert.equal(canAccessAdminTicket({ adminId: 'director', role: 'DIRECTOR' }, principalTicket), true)
  assert.equal(canMutateAdminTicket({ adminId: 'principal', role: 'PRINCIPAL' }, vpTicket), false)
  assert.equal(canMutateAdminTicket({ adminId: 'director', role: 'DIRECTOR' }, vpTicket), false)
  assert.equal(canMutateAdminTicket({ adminId: 'principal', role: 'PRINCIPAL' }, principalEscalated), true)
  assert.equal(canMutateAdminTicket({ adminId: 'director', role: 'DIRECTOR' }, directorEscalated), true)
})

test('status transitions follow the required lifecycle and reject invalid moves', () => {
  assert.deepEqual(getAvailableTicketStatuses('SUBMITTED'), ['SUBMITTED', 'IN_PROGRESS'])
  assert.deepEqual(getAvailableTicketStatuses('IN_PROGRESS'), ['IN_PROGRESS', 'RESOLVED'])
  assert.deepEqual(getAvailableTicketStatuses('RESOLVED'), ['RESOLVED'])
  assert.equal(validateStatusTransition('SUBMITTED', 'IN_PROGRESS'), null)
  assert.equal(validateStatusTransition('IN_PROGRESS', 'RESOLVED'), null)
  assert.equal(validateStatusTransition('SUBMITTED', 'RESOLVED'), 400)
  assert.equal(validateStatusTransition('RESOLVED', 'SUBMITTED'), 400)
  assert.equal(validateStatusTransition('RESOLVED', 'IN_PROGRESS'), 400)
})

test('admin status UI renders only the available server lifecycle options', async () => {
  const page = await readFile(new URL('../app/admin/tickets/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /getAvailableTicketStatuses\(ticket\.status\)/)
  assert.doesNotMatch(page, /<option value="SUBMITTED">Submitted<\/option>\s*<option value="IN_PROGRESS">In Progress<\/option>\s*<option value="RESOLVED">Resolved<\/option>/)
})

test('homepage helpdesk includes responsive phone and email contacts', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /grid-cols-1 gap-2 md:grid-cols-2/)
  assert.match(page, /href="tel:9603109222"/)
  assert.match(page, /href="mailto:heliosupportconnect@gmail\.com"/)
  assert.match(page, /break-all[^\n]*heliosupportconnect@gmail\.com|break-all text-sm[^\n]*text-slate-900/)
})

test('dashboard reorder is limited to Principal and Director', () => {
  assert.equal(canReorderDashboardSlides('PRINCIPAL'), true)
  assert.equal(canReorderDashboardSlides('DIRECTOR'), true)
  assert.equal(canReorderDashboardSlides('VP_PRIMARY'), false)
  assert.equal(canReorderDashboardSlides('VP_SECONDARY'), false)
})

function createDashboardLifecycleHarness({ failUpload = false, failVerify = false, failUpdate = false, failOldCleanup = false, failDeleteRecord = false, failDeleteObject = false } = {}) {
  const state = { record: { key: 'old-object' }, objects: new Set(['old-object']), events: [] }
  const failure = message => { throw new Error(message) }
  return {
    state,
    replaceSteps: {
      uploadNew: async () => {
        state.events.push('upload-new')
        if (failUpload) failure('upload failed')
        state.objects.add('new-object')
      },
      verifyNew: async () => {
        state.events.push('verify-new')
        if (failVerify || !state.objects.has('new-object')) failure('new object unavailable')
      },
      updateRecord: async () => {
        state.events.push('update-record')
        if (failUpdate) failure('database update failed')
        state.record = { key: 'new-object' }
        return { ...state.record }
      },
      cleanupNew: async () => {
        state.events.push('delete-new')
        state.objects.delete('new-object')
      },
      cleanupOld: async () => {
        state.events.push('delete-old')
        if (failOldCleanup) failure('old cleanup failed')
        state.objects.delete('old-object')
      },
      onCleanupFailure: stage => state.events.push(`cleanup-pending-${stage}`),
    },
    deleteSteps: {
      deleteRecord: async () => {
        state.events.push('delete-record')
        if (failDeleteRecord) failure('database delete failed')
        state.record = null
        return { deleted: true }
      },
      deleteObject: async () => {
        state.events.push('delete-object')
        if (failDeleteObject) failure('storage delete failed')
        state.objects.delete('old-object')
      },
      onCleanupFailure: () => state.events.push('cleanup-pending-delete'),
    },
  }
}

test('dashboard replacement failures preserve a valid visible old object', async () => {
  for (const failureOptions of [{ failUpload: true }, { failVerify: true }, { failUpdate: true }]) {
    const harness = createDashboardLifecycleHarness(failureOptions)
    await assert.rejects(replaceDashboardObject(harness.replaceSteps))
    assert.deepEqual(harness.state.record, { key: 'old-object' })
    assert.equal(harness.state.objects.has('old-object'), true)
    assert.equal(harness.state.objects.has('new-object'), false)
  }
})

test('old object cleanup failure leaves the committed replacement available', async () => {
  const harness = createDashboardLifecycleHarness({ failOldCleanup: true })
  const result = await replaceDashboardObject(harness.replaceSteps)
  assert.deepEqual(result, { record: { key: 'new-object' }, cleanupPending: true })
  assert.deepEqual(harness.state.record, { key: 'new-object' })
  assert.equal(harness.state.objects.has('new-object'), true)
  assert.equal(harness.state.events.includes('delete-new'), false)
})

test('dashboard delete failure leaves the row and object; storage cleanup failure leaves no visible row', async () => {
  const dbFailure = createDashboardLifecycleHarness({ failDeleteRecord: true })
  await assert.rejects(deleteDashboardObject(dbFailure.deleteSteps), /database delete failed/)
  assert.deepEqual(dbFailure.state.record, { key: 'old-object' })
  assert.equal(dbFailure.state.objects.has('old-object'), true)
  assert.equal(dbFailure.state.events.includes('delete-object'), false)

  const storageFailure = createDashboardLifecycleHarness({ failDeleteObject: true })
  const result = await deleteDashboardObject(storageFailure.deleteSteps)
  assert.equal(result.cleanupPending, true)
  assert.equal(storageFailure.state.record, null)
  assert.equal(storageFailure.state.objects.has('old-object'), true)
})

test('carousel routes use verified replacement and database-first delete lifecycles', async () => {
  const route = await readFile(new URL('../app/api/admin/slides/[id]/route.ts', import.meta.url), 'utf8')
  assert.match(route, /replaceDashboardObject\(/)
  assert.match(route, /verifyObjectExists\(DASHBOARD_IMAGES_BUCKET, storageKey\)/)
  assert.match(route, /cleanupOld: \(\) => existing\.storageKey \? deleteObject/)
  assert.match(route, /deleteDashboardObject\(/)
  assert.match(route, /deleteRecord: \(\) => prisma\.carouselSlide\.delete/)
})

test('admin passwords reject SHA-256 fallback hashes and bcrypt remains accepted', async () => {
  const bcryptHash = '$2a$12$Q5A5S2aGxHk4aH6p3dD0eO6K8Jg0jX2fT6E2SxUE1O9rQ2b9N1n3i'
  assert.equal(await verifyAdminPassword('correcthorse', bcryptHash), false)
  const legacyHash = createHash('sha256').update('correcthorse').digest('hex')
  assert.equal(await verifyAdminPassword('correcthorse', legacyHash), false)
})

test('parent reply parser accepts only bounded message content', () => {
  assert.equal(parseParentReplyMessage({ message: '  More details  ', status: 'RESOLVED', escalatedTo: ['DIRECTOR'] }), 'More details')
  assert.equal(parseParentReplyMessage({ message: '   ' }), null)
  assert.equal(parseParentReplyMessage({ message: 'x'.repeat(5001) }), null)
})

test('admin bootstrap is disabled and malformed slide JSON is rejected', async () => {
  const importRoute = await readFile(new URL('../app/api/admin/import/route.ts', import.meta.url), 'utf8')
  assert.match(importRoute, /status:\s*410/)
  assert.doesNotMatch(importRoute, /prisma\.|adminAccount\.create/)
  assert.equal(parseDashboardSlidePayload('{broken'), null)
  assert.equal(parseDashboardSlidePayload('[]'), null)
  assert.deepEqual(parseDashboardSlidePayload('{"active":true}'), { active: true })
})

test('ticket routes use canonical public identifiers accepted by the parser', () => {
  assert.equal(formatTicketIdentifier(1), 'HL-000001')
  assert.equal(formatTicketIdentifier(1000), 'HL-001000')
  assert.equal(parseTicketNumber(formatTicketIdentifier(25)), 25)
})

test('admin roles remain the four configured roles and list scopes match details', () => {
  assert.deepEqual(ADMIN_ROLES, ['VP_PRIMARY', 'VP_SECONDARY', 'PRINCIPAL', 'DIRECTOR'])
  const snapshotClasses = (where) => where.OR.filter((item) => item.studentSnapshot?.equals).map((item) => item.studentSnapshot.equals)
  assert.deepEqual(snapshotClasses(getAdminTicketVisibilityWhere({ adminId: 'primary', role: 'VP_PRIMARY' })), ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'])
  assert.deepEqual(snapshotClasses(getAdminTicketVisibilityWhere({ adminId: 'secondary', role: 'VP_SECONDARY' })), ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'])
  for (const role of ['PRINCIPAL', 'DIRECTOR']) {
    assert.deepEqual(snapshotClasses(getAdminTicketVisibilityWhere({ adminId: role, role })["OR"][0]), [
      'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    ])
  }
})

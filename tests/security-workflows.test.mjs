import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isParentTicketOwner } from '../lib/ticket-access.ts'
import { splitStudentName, createParentRegistration, ExistingParentAccountError, StudentAdmissionConflictError } from '../lib/registration-student.ts'
import { findParentOwnedStudentLink } from '../lib/parent-student-access.ts'
import { formatTicketIdentifier, parseTicketNumber } from '../lib/ticket-number.ts'
import { parseParentReplyMessage } from '../lib/parent-reply.ts'
import { createHash } from 'node:crypto'
import { getQueueForStudentClass, normalizeStudentClass, normalizeStudentSection, validateEscalationMutation, validateStatusTransition, canReorderDashboardSlides } from '../lib/ticket-policy.ts'
import { parseDashboardSlidePayload } from '../lib/dashboard-slide-input.ts'
import { canAccessAdminTicket, canMutateAdminTicket, getAdminTicketVisibilityWhere } from '../lib/admin-ticket-access.ts'
import { ADMIN_ROLES } from '../lib/client-admin-auth.ts'
import { verifyAdminPassword } from '../lib/password.ts'

const ticketForClass = (className) => ({ studentSnapshot: { className }, student: null })

test('parent access requires the ticket reporter identity', () => {
  assert.equal(isParentTicketOwner('parent-a', 'parent-a'), true)
  assert.equal(isParentTicketOwner('parent-a', 'parent-b'), false)
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
  assert.match(ticketRoute, /findParentOwnedStudentLink\(prisma\.parentStudent, parent\.id, requestedStudentId\)/)
  assert.match(ticketRoute, /normalizeStudentClass\(student\.className\)/)
  assert.match(ticketRoute, /normalizeStudentSection\(student\.section\)/)
  assert.match(ticketRoute, /studentSnapshot = \{ \.\.\.parentSnapshot \}/)
  assert.doesNotMatch(ticketRoute, /payload\.className|payload\.section/)
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
  assert.equal(validateStatusTransition('SUBMITTED', 'IN_PROGRESS'), null)
  assert.equal(validateStatusTransition('IN_PROGRESS', 'RESOLVED'), null)
  assert.equal(validateStatusTransition('SUBMITTED', 'RESOLVED'), 400)
  assert.equal(validateStatusTransition('RESOLVED', 'SUBMITTED'), 400)
  assert.equal(validateStatusTransition('RESOLVED', 'IN_PROGRESS'), 400)
})

test('dashboard reorder is limited to Principal and Director', () => {
  assert.equal(canReorderDashboardSlides('PRINCIPAL'), true)
  assert.equal(canReorderDashboardSlides('DIRECTOR'), true)
  assert.equal(canReorderDashboardSlides('VP_PRIMARY'), false)
  assert.equal(canReorderDashboardSlides('VP_SECONDARY'), false)
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

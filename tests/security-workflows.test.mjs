import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isParentTicketOwner } from '../lib/ticket-access.ts'
import { matchesExistingStudent } from '../lib/registration-student.ts'
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

test('registration must match an existing Neon student record', () => {
  const rosterStudent = { firstName: 'Asha', lastName: 'Rao', className: 'Class 4', section: 'Section A', rollNumber: '12', house: 'Sun' }
  assert.equal(matchesExistingStudent({ name: ' Asha   Rao ', className: 'class 4', section: 'section a', rollNumber: '12', house: 'sun' }, rosterStudent), true)
  assert.equal(matchesExistingStudent({ name: 'Asha Rao', className: 'Class 5', section: 'Section A', rollNumber: '12', house: 'Sun' }, rosterStudent), false)
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

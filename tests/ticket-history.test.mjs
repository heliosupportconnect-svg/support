import assert from 'node:assert/strict'
import test from 'node:test'
import { selectTicketHistory } from '../lib/ticket-history.ts'

const activity = (type, actorId, actorAdminId = null) => ({
  type,
  actorId,
  actorAdminId,
  actorAdminRole: actorAdminId ? 'PRINCIPAL' : null,
  message: `${type} message`,
})

test('parent history includes only parent-authored replies and no note records', () => {
  const history = selectTicketHistory(
    [
      activity('COMMENTED', 'parent-1'),
      activity('NOTE_ADDED', null, 'admin-1'),
      activity('STATUS_CHANGED', null, 'admin-1'),
      activity('COMMENTED', 'parent-2'),
    ],
    [{ body: 'internal note', isInternal: true }, { body: 'public note', isInternal: false }],
    'parent',
    'parent-1',
  )

  assert.deepEqual(history.activities.map((item) => item.message), ['COMMENTED message'])
  assert.deepEqual(history.notes, [])
})

test('admin history retains internal notes and all activity records', () => {
  const activities = [activity('NOTE_ADDED', null, 'admin-1')]
  const notes = [{ body: 'internal note', isInternal: true }]
  const history = selectTicketHistory(activities, notes, 'admin', 'parent-1')

  assert.equal(history.activities, activities)
  assert.equal(history.notes, notes)
})
type TicketActivityRecord = {
  type: string
  actorId: string | null
  actorAdminId: string | null
  actorAdminRole: string | null
}

type TicketNoteRecord = { isInternal: boolean }

export function selectTicketHistory<
  TActivity extends TicketActivityRecord,
  TNote extends TicketNoteRecord,
>(
  activities: TActivity[],
  notes: TNote[],
  audience: 'parent' | 'admin',
  parentId: string,
) {
  if (audience === 'admin') return { activities, notes }

  return {
    activities: activities.filter((activity) =>
      activity.type === 'COMMENTED' &&
      activity.actorId === parentId &&
      activity.actorAdminId === null &&
      activity.actorAdminRole === null,
    ),
    notes: [],
  }
}
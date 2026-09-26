export function isParentTicketOwner(parentId: string, reporterId: string): boolean {
  return parentId === reporterId
}

export function resolveTicketAudience(hasAdminSession: boolean, hasParentSession: boolean): 'admin' | 'parent' | 'ambiguous' | null {
  if (hasAdminSession && hasParentSession) return 'ambiguous'
  if (hasAdminSession) return 'admin'
  if (hasParentSession) return 'parent'
  return null
}
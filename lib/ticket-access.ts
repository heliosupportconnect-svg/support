export function isParentTicketOwner(parentId: string, reporterId: string): boolean {
  return parentId === reporterId
}
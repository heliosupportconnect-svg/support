export function parseParentReplyMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('message' in value) || typeof value.message !== 'string') return null
  const message = value.message.trim()
  return message.length > 0 && message.length <= 5000 ? message : null
}
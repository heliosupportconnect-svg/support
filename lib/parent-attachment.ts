type ParentAttachmentSource = {
  fileName: string
  mimeType: string
  sizeBytes: number | null
}

export function parseParentAttachmentOrdinal(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const ordinal = Number(value)
  return Number.isSafeInteger(ordinal) ? ordinal : null
}

export function getParentAttachmentUrl(ticketNumber: string, ordinal: number, download = false): string {
  const path = `/api/tickets/${encodeURIComponent(ticketNumber)}/attachments/${ordinal}`
  return download ? `${path}?download=1` : path
}

export function mapParentAttachment(ticketNumber: string, attachment: ParentAttachmentSource, index: number) {
  return {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: getParentAttachmentUrl(ticketNumber, index + 1),
  }
}
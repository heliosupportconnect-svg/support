import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const DASHBOARD_IMAGES_BUCKET = 'dashboard-images'
export const TICKET_ATTACHMENTS_BUCKET = 'ticket-attachments'

let client: S3Client | null = null

function getClient(): S3Client {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3
  const region = process.env.OBJECT_STORAGE_REGION ?? process.env.AWS_REGION
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY

  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error('Object storage is not configured on the server.')
  }

  client ??= new S3Client({
    endpoint,
    region,
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  })
  return client
}

export function createStorageKey(prefix: string, fileName: string): string {
  const safeName = fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
  return `${prefix}/${randomUUID()}-${safeName}`
}

export async function uploadObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function createSignedObjectUrl(
  bucket: string,
  key: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  )
}

export function getPublicObjectUrl(key: string): string {
  const baseUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL
  if (!baseUrl) throw new Error('Object storage public URL is not configured on the server.')
  return `${baseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
}

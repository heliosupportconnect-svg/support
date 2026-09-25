import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { CarouselSlide } from '@prisma/client'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { createSignedObjectUrl, createStorageKey, DASHBOARD_IMAGES_BUCKET, deleteObject, getObjectStorageEnvironmentStatus, uploadObject } from '@/lib/object-storage'

type SafeErrorDetails = {
  name: string
  message?: string
  status?: number
}

function getSafeErrorDetails(error: unknown): SafeErrorDetails {
  const value = error as { name?: unknown; message?: unknown; $metadata?: { httpStatusCode?: unknown } } | null
  const name = typeof value?.name === 'string' ? value.name : 'UnknownError'
  const rawMessage = typeof value?.message === 'string' ? value.message : undefined
  const containsSensitiveData = rawMessage && /(database_url|auth_secret|access.?key|secret.?access|password|token|cookie|authorization|signature|x-amz)/i.test(rawMessage)
  const message = rawMessage && !containsSensitiveData ? rawMessage.replace(/https?:\/\/\S+/gi, '[redacted-url]') : undefined
  const status = typeof value?.$metadata?.httpStatusCode === 'number' ? value.$metadata.httpStatusCode : undefined
  return { name, ...(message ? { message } : {}), ...(status ? { status } : {}) }
}

function logPublishFailure(requestId: string, stage: string, error: unknown, details: Record<string, unknown> = {}) {
  console.error('[DashboardPublish]', {
    requestId,
    stage,
    ...getSafeErrorDetails(error),
    ...details,
  })
}

function failure(requestId: string, error: string, status: number) {
  return NextResponse.json({ error, requestId }, { status })
}

async function safeSlide(slide: CarouselSlide) {
  return {
    id: slide.id,
    title: slide.title,
    shortTitle: slide.subtitle ?? slide.title,
    image: slide.storageKey ? await createSignedObjectUrl(DASHBOARD_IMAGES_BUCKET, slide.storageKey) : slide.imageUrl,
    updated: slide.updatedAt.toISOString(),
    duration: 3,
    active: slide.isActive,
    storageKey: slide.storageKey ?? undefined,
  }
}

async function requireEditor() {
  const admin = await getCurrentAdmin()
  return admin && (admin.account.role === 'PRINCIPAL' || admin.account.role === 'DIRECTOR') ? admin : null
}

export async function GET() {
  try {
    const admin = await getCurrentAdmin()
    const slides = await prisma.carouselSlide.findMany({
      where: admin ? undefined : { isActive: true },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json({ slides: await Promise.all(slides.map(safeSlide)) })
  } catch {
    return NextResponse.json({ error: 'Unable to load dashboard updates from Neon.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const requestId = `dashpub_${Date.now()}_${randomUUID().slice(0, 8)}`
  let admin
  try {
    admin = await requireEditor()
  } catch (error) {
    logPublishFailure(requestId, 'authorization', error)
    return failure(requestId, 'authorization_failed', 503)
  }
  if (!admin) {
    logPublishFailure(requestId, 'authorization', new Error('Principal or Director role required'))
    return failure(requestId, 'authorization_failed', 403)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch (error) {
    logPublishFailure(requestId, 'validation', error)
    return failure(requestId, 'validation_failed', 400)
  }
  const file = form.get('image')
  const title = typeof form.get('title') === 'string' ? String(form.get('title')).trim() : ''
  const position = Number(form.get('position') ?? 999)
  if (!(file instanceof File) || !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024 || !title) {
    logPublishFailure(requestId, 'validation', new Error('JPEG or PNG image under 5 MB and title required'))
    return failure(requestId, 'validation_failed', 400)
  }

  const storageKey = createStorageKey('slides', file.name)
  try {
    console.info('[DashboardPublish]', {
      requestId,
      stage: 'storage_upload',
      bucket: DASHBOARD_IMAGES_BUCKET,
      environment: getObjectStorageEnvironmentStatus(),
    })
    await uploadObject(DASHBOARD_IMAGES_BUCKET, storageKey, Buffer.from(await file.arrayBuffer()), file.type)
  } catch (error) {
    logPublishFailure(requestId, 'storage_upload', error, { bucket: DASHBOARD_IMAGES_BUCKET })
    return failure(requestId, 'storage_upload_failed', 503)
  }

  let slide: CarouselSlide
  try {
    slide = await prisma.carouselSlide.create({
      data: {
        title,
        subtitle: title,
        storageKey,
        imageUrl: null,
        order: Number.isFinite(position) ? position : 999,
      },
    })
  } catch (error) {
    logPublishFailure(requestId, 'database_write', error)
    try {
      await deleteObject(DASHBOARD_IMAGES_BUCKET, storageKey)
    } catch (cleanupError) {
      logPublishFailure(requestId, 'cleanup', cleanupError, { bucket: DASHBOARD_IMAGES_BUCKET })
    }
    return failure(requestId, 'database_write_failed', 503)
  }

  try {
    return NextResponse.json({ slide: await safeSlide(slide) }, { status: 201 })
  } catch (error) {
    logPublishFailure(requestId, 'signed_url', error, { slideId: slide.id, bucket: DASHBOARD_IMAGES_BUCKET })
    return failure(requestId, 'signed_url_failed', 503)
  }
}

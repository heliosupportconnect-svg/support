import sharp from 'sharp'

export async function prepareCarouselImage(file: File): Promise<{ body: Buffer; contentType: string }> {
  const body = Buffer.from(await file.arrayBuffer())

  if (file.type !== 'image/jpeg') {
    return { body, contentType: file.type }
  }

  const image = sharp(body)
  const metadata = await image.metadata()

  if (!metadata.orientation || metadata.orientation === 1) {
    return { body, contentType: file.type }
  }

  return {
    body: await image.rotate().jpeg().toBuffer(),
    contentType: 'image/jpeg',
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { validateDatabaseUrl } from '../lib/database-url.ts'

test('rejects missing and malformed database URLs without exposing their contents', () => {
  for (const value of [undefined, '', 'not-a-valid-connection-string', 'postgresql://[::1/db']) {
    assert.throws(() => validateDatabaseUrl(value), (error) => {
      assert.match(error.message, /DATABASE_URL/)
      if (typeof value === 'string' && value.length > 0) assert.equal(error.message.includes(value), false)
      return true
    })
  }
})

test('rejects unsupported schemes and invalid host, port, or database path', () => {
  for (const value of [
    'http://example.com/db',
    'mysql://example.com/db',
    'postgresql:///db',
    'postgresql://bad_host/db',
    'postgresql://example..com/db',
    'postgresql://example.com',
    'postgresql://example.com:0/db',
    'postgresql://example.com:70000/db',
    'postgresql://example.com/%E0%A4%A',
  ]) {
    assert.throws(() => validateDatabaseUrl(value), /DATABASE_URL/)
  }
})

test('accepts PostgreSQL, Neon, and SSL-query connection URLs without connecting', () => {
  const values = [
    'postgresql://user:password@localhost:5432/helios',
    'postgresql://user:password@ep-example-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
    'postgres://user:password@db.example.com:5432/app?sslmode=verify-full&application_name=helios',
  ]
  for (const value of values) assert.equal(validateDatabaseUrl(value), value)
})

test('Prisma validates the URL before constructing the adapter', async () => {
  const prismaSource = await readFile(new URL('../lib/prisma.ts', import.meta.url), 'utf8')
  const validationIndex = prismaSource.indexOf('validateDatabaseUrl(process.env.DATABASE_URL)')
  const adapterIndex = prismaSource.indexOf('new PrismaPg')
  assert.notEqual(validationIndex, -1)
  assert.notEqual(adapterIndex, -1)
  assert.ok(validationIndex < adapterIndex)
})
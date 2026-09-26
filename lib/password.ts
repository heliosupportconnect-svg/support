import bcrypt from 'bcryptjs'

const BCRYPT_COST = 12

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function verifyAdminPassword(password: string, passwordHash: string): Promise<boolean> {
  if (!passwordHash.startsWith('$2')) {
    return false
  }

  return verifyPassword(password, passwordHash)
}

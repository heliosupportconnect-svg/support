"use client";

export const ADMIN_ACCOUNT_KEY = "helios_admin_account";
export const ADMIN_ACCOUNTS_KEY = "helios_admin_accounts";
export const ADMIN_SESSION_KEY = "helios_admin_session";

export const ADMIN_ROLES = ["VP_PRIMARY", "VP_SECONDARY", "PRINCIPAL", "DIRECTOR"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type LocalAdminAccount = {
  id: string;
  name: string;
  username: string;
  email: string;
  mobile: string;
  role: AdminRole;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalAdminSession = {
  adminId: string;
  role: AdminRole;
  createdAt: string;
};

export type AdminSetupData = {
  name: string;
  username?: string;
  email: string;
  mobile: string;
  password: string;
  role?: AdminRole;
};

let currentSession: LocalAdminSession | null = null;
const adminAccountCache = new Map<string, LocalAdminAccount>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "") : "";
}

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && ADMIN_ROLES.includes(value as AdminRole);
}

function repairLocalAccount(value: unknown, requirePasswordHash = false): LocalAdminAccount | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (!isAdminRole(candidate.role) || typeof candidate.id !== "string") return null;
  if (requirePasswordHash && (typeof candidate.passwordHash !== "string" || !candidate.passwordHash)) return null;

  const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString();
  return {
    id: candidate.id,
    name: typeof candidate.name === "string" ? candidate.name.trim() : "",
    username: normalizeUsername(candidate.username),
    email: typeof candidate.email === "string" ? candidate.email.trim().toLowerCase() : "",
    mobile: typeof candidate.mobile === "string" ? candidate.mobile.trim() : "",
    role: candidate.role,
    passwordHash: typeof candidate.passwordHash === "string" ? candidate.passwordHash : "",
    createdAt,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : createdAt,
  };
}

export function getLocalAdminAccounts(): LocalAdminAccount[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(ADMIN_ACCOUNTS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.map((item) => repairLocalAccount(item, true)).filter((account): account is LocalAdminAccount => account !== null)
      : [];
  } catch {
    return [];
  }
}

export async function migrateLocalAdminAccounts(): Promise<number> {
  const accounts = getLocalAdminAccounts();
  if (accounts.length === 0) return 0;

  const response = await fetch("/api/admin/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accounts }),
  });
  if (!response.ok) throw new Error("Unable to import admin accounts.");

  const result = (await response.json()) as { imported?: number };
  return result.imported ?? 0;
}

export async function ensureDefaultAdminAccounts(): Promise<LocalAdminAccount[]> {
  return getLocalAdminAccounts();
}

function cacheAccount(account: LocalAdminAccount): LocalAdminAccount {
  adminAccountCache.set(account.id, account);
  return account;
}

function toLocalAccount(value: Record<string, unknown>): LocalAdminAccount | null {
  const account = repairLocalAccount({ ...value, id: value.adminId ?? value.id });
  return account ? cacheAccount(account) : null;
}

export async function getAdminSession(forceRefresh = false): Promise<{ session: LocalAdminSession; account: LocalAdminAccount } | null> {
  if (!forceRefresh && currentSession) {
    const cachedAccount = adminAccountCache.get(currentSession.adminId);
    if (cachedAccount) {
      return { session: currentSession, account: cachedAccount };
    }
  }

  const response = await fetch("/api/admin/me", { cache: "no-store" });
  if (!response.ok) {
    currentSession = null;
    return null;
  }

  const result = (await response.json()) as {
    account?: Record<string, unknown>;
    session?: { adminId?: string; role?: unknown; createdAt?: string };
  };
  if (!result.account || !result.session || !isAdminRole(result.session.role) || typeof result.session.adminId !== "string") {
    currentSession = null;
    return null;
  }

  const account = toLocalAccount(result.account);
  if (!account) {
    currentSession = null;
    return null;
  }

  currentSession = {
    adminId: result.session.adminId,
    role: result.session.role,
    createdAt: result.session.createdAt ?? new Date().toISOString(),
  };
  return { session: currentSession, account };
}

export async function getAdminAccounts(): Promise<LocalAdminAccount[]> {
  const response = await fetch("/api/admin/accounts", { cache: "no-store" });
  if (!response.ok) return [];
  const result = (await response.json()) as { accounts?: Record<string, unknown>[] };
  return (result.accounts ?? []).map(toLocalAccount).filter((account): account is LocalAdminAccount => account !== null);
}

export function getLocalAdminSession(): LocalAdminSession | null {
  return currentSession;
}

export function getLocalAdminAccount(): LocalAdminAccount | null {
  return currentSession ? adminAccountCache.get(currentSession.adminId) ?? null : null;
}

export function getLocalAdminAccountById(adminId: string): LocalAdminAccount | null {
  return adminAccountCache.get(adminId) ?? null;
}

export function getAdminRoleLabel(role: AdminRole): string {
  const labels: Record<AdminRole, string> = {
    VP_PRIMARY: "Vice Principal – Primary Classes",
    VP_SECONDARY: "Vice Principal – Secondary Classes",
    PRINCIPAL: "Principal",
    DIRECTOR: "Director",
  };
  return labels[role];
}

export async function loginLocalAdmin(identifier: string, password: string, rememberMe: boolean): Promise<LocalAdminAccount | null> {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: identifier, password, rememberMe }),
  });
  if (!response.ok) return null;

  const result = (await response.json()) as { account?: Record<string, unknown> };
  const account = result.account ? toLocalAccount(result.account) : null;
  if (!account) return null;

  currentSession = {
    adminId: account.id,
    role: account.role,
    createdAt: new Date().toISOString(),
  };
  return account;
}

export function clearLocalAdminSession(): void {
  currentSession = null;
  void fetch("/api/admin/logout", { method: "POST" });
}

export async function updateLocalAdminAccount(
  adminId: string,
  update: Partial<Pick<LocalAdminAccount, "name" | "username" | "email" | "mobile">>,
): Promise<LocalAdminAccount> {
  const response = await fetch("/api/admin/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  const result = (await response.json()) as { account?: Record<string, unknown>; error?: string };
  if (!response.ok || !result.account) throw new Error(result.error ?? "Unable to save profile.");
  const account = toLocalAccount(result.account);
  if (!account || account.id !== adminId) throw new Error("Admin account not found.");
  return account;
}

export async function updateLocalAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<LocalAdminAccount> {
  const response = await fetch("/api/admin/password", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Unable to update password.");
  const account = adminAccountCache.get(adminId);
  if (!account) throw new Error("Admin account not found.");
  return account;
}

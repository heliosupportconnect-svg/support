"use client";

export const ACCOUNT_STORAGE_KEY = "helios_parent_account";
export const SESSION_STORAGE_KEY = "helios_parent_session";

export const STUDENT_CLASS_OPTIONS = ["LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"] as const;
export const STUDENT_SECTION_OPTIONS = ["Section A", "Section B"] as const;

export type LocalParentData = {
  name: string;
  email: string;
  phone: string;
  emergencyPhone?: string;
  relationship?: string;
  student: {
    admissionNumber: string;
    name: string;
    className: string;
    section: string;
    rollNumber: string;
    house: string;
    relationship: string;
    modeOfTransport?: "Self Transport" | "School Bus";
    busNumber?: string;
    busRoute?: string;
  };
};

export type LocalParentRegistrationData = LocalParentData & { password: string };
export type LocalParentAccount = LocalParentData & { id: string; role: "PARENT"; createdAt: string };
export type LocalSession = { userId: string; role: "PARENT"; createdAt: string };

export class LocalAccountExistsError extends Error {
  constructor() {
    super("An account with this mobile number already exists.");
    this.name = "LocalAccountExistsError";
  }
}

let currentParent: LocalParentAccount | null = null;
let currentSession: LocalSession | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function normalizeStudentClassSelection(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (normalized === "lkg") return "LKG";
  if (normalized === "ukg") return "UKG";
  const direct = STUDENT_CLASS_OPTIONS.find((option) => option.toLowerCase() === normalized);
  if (direct) return direct;
  const match = trimmed.match(/^class\s*(\d{1,2})$/i) ?? trimmed.match(/^(\d{1,2})$/);
  if (!match) return "";
  const classNumber = Number(match[1]);
  return classNumber >= 1 && classNumber <= 10 ? `Class ${classNumber}` : "";
}

export function normalizeStudentSectionSelection(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (normalized === "a") return "Section A";
  if (normalized === "b") return "Section B";
  const direct = STUDENT_SECTION_OPTIONS.find((option) => option.toLowerCase() === normalized);
  if (direct) return direct;
  const match = trimmed.match(/^section\s*([ab])$/i);
  return match ? `Section ${match[1].toUpperCase()}` : "";
}

function setCurrentParent(parent: LocalParentAccount): LocalParentAccount {
  currentParent = parent;
  currentSession = { userId: parent.id, role: "PARENT", createdAt: new Date().toISOString() };
  return parent;
}

function readParent(value: unknown): LocalParentAccount | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const student = candidate.student;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.email !== "string" || typeof candidate.phone !== "string" || candidate.role !== "PARENT" || typeof student !== "object" || student === null) return null;
  const child = student as Record<string, unknown>;
  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    emergencyPhone: typeof candidate.emergencyPhone === "string" ? candidate.emergencyPhone : undefined,
    relationship: typeof candidate.relationship === "string" ? candidate.relationship : undefined,
    role: "PARENT",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    student: {
      admissionNumber: typeof child.admissionNumber === "string" ? child.admissionNumber : "",
      name: typeof child.name === "string" ? child.name : "",
      className: typeof child.className === "string" ? child.className : "",
      section: typeof child.section === "string" ? child.section : "",
      rollNumber: typeof child.rollNumber === "string" ? child.rollNumber : "",
      house: typeof child.house === "string" ? child.house : "",
      relationship: typeof child.relationship === "string" ? child.relationship : "",
      modeOfTransport: child.modeOfTransport === "School Bus" || child.modeOfTransport === "Self Transport" ? child.modeOfTransport : undefined,
      busNumber: typeof child.busNumber === "string" ? child.busNumber : undefined,
      busRoute: typeof child.busRoute === "string" ? child.busRoute : undefined,
    },
  };
}

async function readResponse(response: Response): Promise<{ parent?: unknown; error?: string }> {
  try { return await response.json(); } catch { return {}; }
}

export async function getParentSession(forceRefresh = false): Promise<{ session: LocalSession; parent: LocalParentAccount } | null> {
  if (!forceRefresh && currentParent && currentSession) return { session: currentSession, parent: currentParent };
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) {
    currentParent = null;
    currentSession = null;
    return null;
  }
  const result = await readResponse(response);
  const parent = readParent(result.parent);
  if (!parent) {
    currentParent = null;
    currentSession = null;
    return null;
  }
  setCurrentParent(parent);
  return { session: currentSession!, parent };
}

export function getLocalSession(): LocalSession | null { return currentSession; }
export function getLocalParent(): LocalParentAccount | null { return currentParent; }

export async function registerLocalParent(data: LocalParentRegistrationData): Promise<LocalParentAccount> {
  if (!isBrowser()) throw new Error("Browser is unavailable.");
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await readResponse(response);
  if (response.status === 409) throw new LocalAccountExistsError();
  if (!response.ok || !result.parent) throw new Error(result.error ?? "Unable to create the Neon account.");
  const parent = readParent(result.parent);
  if (!parent) throw new Error("The server returned an invalid parent account.");
  return setCurrentParent(parent);
}

export async function loginLocalParent(phone: string, password: string, _rememberMe: boolean): Promise<LocalParentAccount | null> {
  if (!isBrowser()) return null;
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const result = await readResponse(response);
  if (!response.ok || !result.parent) return null;
  const parent = readParent(result.parent);
  return parent ? setCurrentParent(parent) : null;
}

export async function updateLocalParentStudentPlacement(studentClass: string, section: string): Promise<LocalParentAccount | null> {
  if (!currentParent) return null;
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: currentParent.name,
      email: currentParent.email,
      phone: currentParent.phone,
      emergencyPhone: currentParent.emergencyPhone ?? "",
      className: studentClass,
      section,
    }),
  });
  const result = await readResponse(response);
  if (!response.ok || !result.parent) throw new Error(result.error ?? "Unable to update the Neon student profile.");
  const parent = readParent(result.parent);
  return parent ? setCurrentParent(parent) : null;
}

export function logoutLocalParent(): void {
  currentParent = null;
  currentSession = null;
  void fetch("/api/auth/logout", { method: "POST" });
}

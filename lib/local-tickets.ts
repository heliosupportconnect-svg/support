"use client";

import { getLocalParent, type LocalParentAccount } from "@/lib/client-auth";

export const TICKETS_STORAGE_KEY = "helios_parent_tickets";

export type LocalTicketActivity = { title: string; description: string; createdAt: string; actor?: string };
export type LocalTicketStatus = "SUBMITTED" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "ESCALATED";
export type LocalTicketPriority = "NORMAL" | "HIGH" | "URGENT";
export type TicketProfileSnapshot = {
  parentName: string; email: string; phone: string; emergencyPhone?: string; relationship?: string;
  studentName: string; admissionNumber: string; className: string; section: string; rollNumber: string; house: string;
  modeOfTransport?: "Self Transport" | "School Bus"; busNumber?: string; busRoute?: string;
};
export type LocalTicket = {
  id: string; ticketNumber: string; parentId: string; studentId: string; category: string; subject: string; description: string;
  status: LocalTicketStatus; priority: LocalTicketPriority; parentSnapshot?: TicketProfileSnapshot; studentSnapshot?: TicketProfileSnapshot;
  assignedTo?: string; assignedBy?: string; assignedAdminId?: string; assignedAdminRole?: string; escalatedTo?: string[]; escalatedAt?: string;
  takenUpBy?: string; takenUpAt?: string; takenUpByAdminIds?: string[]; takenUpAtByAdmin?: Record<string, string>;
  resolvedBy?: string; resolvedAt?: string; attachmentNames: string[]; createdAt: string; updatedAt: string; activities: LocalTicketActivity[];
  attachments?: { id: string; fileName: string; mimeType: string; sizeBytes?: number | null; url?: string | null }[];
};
export type CreateLocalTicketInput = Pick<LocalTicket, "parentId" | "studentId" | "category" | "subject" | "description" | "attachmentNames"> & {
  parentSnapshot?: TicketProfileSnapshot; studentSnapshot?: TicketProfileSnapshot; className?: string; section?: string; attachment?: File;
};

function isBrowser(): boolean { return typeof window !== "undefined"; }
async function responseJson(response: Response): Promise<Record<string, unknown>> { try { return await response.json() as Record<string, unknown>; } catch { return {}; } }
function throwResponse(result: Record<string, unknown>, fallback: string): never { throw new Error(typeof result.error === "string" ? result.error : fallback); }

export function normalizeTicketStatus(status: unknown): LocalTicketStatus {
  if (status === "ASSIGNED" || status === "IN_PROGRESS" || status === "ESCALATED") return "IN_PROGRESS";
  if (status === "RESOLVED" || status === "CLOSED") return "RESOLVED";
  return "SUBMITTED";
}
export function getVisibleTicketStatus(status: LocalTicketStatus): "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" { const normalized = normalizeTicketStatus(status); return normalized === "IN_PROGRESS" ? "IN_PROGRESS" : normalized === "RESOLVED" ? "RESOLVED" : "SUBMITTED"; }
export function getTicketStatusLabel(status: LocalTicketStatus): string { const normalized = getVisibleTicketStatus(status); return normalized === "IN_PROGRESS" ? "In Progress" : normalized === "RESOLVED" ? "Resolved" : "Submitted"; }

export async function loadTickets(): Promise<LocalTicket[]> {
  if (!isBrowser()) return [];
  const response = await fetch("/api/tickets", { cache: "no-store" });
  const result = await responseJson(response);
  if (!response.ok || !Array.isArray(result.tickets)) throwResponse(result, "Unable to load tickets from Neon.");
  return result.tickets as LocalTicket[];
}

export async function getLocalTicketsForParent(_parentId: string): Promise<LocalTicket[]> { return loadTickets(); }
export async function getLocalTicketForParent(ticketNumber: string, _parentId: string): Promise<LocalTicket | null> { return getLocalTicket(ticketNumber); }
export async function getLocalTicket(ticketNumber: string): Promise<LocalTicket | null> {
  if (!isBrowser()) return null;
  const response = await fetch(`/api/tickets/${encodeURIComponent(ticketNumber)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  const result = await responseJson(response);
  if (!response.ok || !result.ticket) throwResponse(result, "Unable to load the ticket from Neon.");
  return result.ticket as LocalTicket;
}

export async function createLocalTicket(input: CreateLocalTicketInput): Promise<LocalTicket> {
  if (!isBrowser()) throw new Error("Browser is unavailable.");
  const form = new FormData();
  form.set("payload", JSON.stringify({ ...input, attachmentNames: undefined, attachment: undefined }));
  if (input.attachment) form.append("attachments", input.attachment, input.attachment.name);
  const response = await fetch("/api/tickets", { method: "POST", body: form });
  const result = await responseJson(response);
  if (!response.ok || !result.ticket) throwResponse(result, "Unable to save the ticket to Neon.");
  return result.ticket as LocalTicket;
}

export async function updateLocalTicket(ticketNumber: string, update: Partial<LocalTicket>): Promise<LocalTicket | null> {
  if (!isBrowser()) return null;
  const activities = update.activities ?? [];
  const activity = activities.length ? activities[activities.length - 1] : undefined;
  const body: Record<string, unknown> = { ...update };
  delete body.activities;
  if (activity) {
    if (activity.title === "Internal Note Added") body.note = activity.description;
    else body.activity = activity;
  }
  const response = await fetch(`/api/tickets/${encodeURIComponent(ticketNumber)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (response.status === 404) return null;
  const result = await responseJson(response);
  if (!response.ok || !result.ticket) throwResponse(result, "Unable to save the ticket to Neon.");
  return result.ticket as LocalTicket;
}

export function getTicketParentAccount(ticket: LocalTicket): LocalParentAccount | null {
  if (ticket.parentSnapshot) {
    const snapshot = ticket.parentSnapshot;
    return {
      id: ticket.parentId, name: snapshot.parentName, email: snapshot.email, phone: snapshot.phone, emergencyPhone: snapshot.emergencyPhone,
      relationship: snapshot.relationship, role: "PARENT", createdAt: ticket.createdAt,
      student: { admissionNumber: snapshot.admissionNumber, name: snapshot.studentName, className: snapshot.className, section: snapshot.section, rollNumber: snapshot.rollNumber, house: snapshot.house, relationship: snapshot.relationship ?? "", modeOfTransport: snapshot.modeOfTransport, busNumber: snapshot.busNumber, busRoute: snapshot.busRoute },
    };
  }
  return getLocalParent();
}

export function getTicketClassNumber(ticket: LocalTicket): number | null {
  const snapshot = ticket.studentSnapshot ?? ticket.parentSnapshot;
  const source = snapshot?.className ?? getTicketParentAccount(ticket)?.student.className ?? "";
  const match = typeof source === "string" ? source.match(/(\d+)/) : null;
  return match ? Number(match[1]) : null;
}
export function isPrimaryVpTicket(ticket: LocalTicket): boolean { const value = getTicketClassNumber(ticket); return value !== null && value >= 1 && value <= 5; }
export function isSecondaryVpTicket(ticket: LocalTicket): boolean { const value = getTicketClassNumber(ticket); return value !== null && value >= 6 && value <= 10; }
export function getTicketEscalatedTo(ticket: LocalTicket): string[] { return ticket.escalatedTo ?? []; }
export function isTicketEscalatedToAdmin(ticket: LocalTicket, role: string): boolean { return getTicketEscalatedTo(ticket).includes(role); }
export function isTicketTakenUpByAdmin(ticket: LocalTicket, adminId: string): boolean { return (ticket.takenUpByAdminIds ?? []).includes(adminId) || ticket.takenUpBy === adminId; }
export function getTicketTakenUpAtForAdmin(ticket: LocalTicket, adminId: string): string | undefined { return ticket.takenUpAtByAdmin?.[adminId] ?? ticket.takenUpAt; }
export function normalizeClassValue(value: string | number | null | undefined): number | null { const match = String(value ?? "").match(/(\d+)/); return match ? Number(match[1]) : null; }

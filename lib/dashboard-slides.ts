"use client";

export type DashboardSlide = {
  id: string;
  title: string;
  shortTitle: string;
  image: string;
  updated: string;
  duration: number;
  active: boolean;
  storageKey?: string;
};

export const DASHBOARD_SLIDES_KEY = "helios_dashboard_slides";
export const DEFAULT_DASHBOARD_SLIDES: DashboardSlide[] = [];
let cachedSlides: DashboardSlide[] = [];

export function getDefaultDashboardSlides(): DashboardSlide[] { return []; }
export function getStoredDashboardSlides(): DashboardSlide[] { return cachedSlides; }

export async function fetchDashboardSlides(): Promise<DashboardSlide[]> {
  const response = await fetch("/api/admin/slides", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load dashboard updates from Neon.");
  const result = await response.json() as { slides?: DashboardSlide[] };
  cachedSlides = result.slides ?? [];
  return cachedSlides;
}

export async function createDashboardSlide(file: File, title: string, position: number): Promise<DashboardSlide> {
  const form = new FormData();
  form.set("title", title);
  form.set("position", String(position));
  form.append("image", file, file.name);
  const response = await fetch("/api/admin/slides", { method: "POST", body: form });
  const result = await response.json() as { slide?: DashboardSlide; error?: string; requestId?: string };
  if (!response.ok || !result.slide) {
    const messages: Record<string, string> = {
      authorization_failed: "You are not authorized to publish dashboard updates.",
      validation_failed: "Please select a JPEG or PNG image under 5 MB and enter a title.",
      storage_upload_failed: "Unable to upload the dashboard image to object storage.",
      database_write_failed: "The image uploaded, but the dashboard update could not be saved.",
      signed_url_failed: "The dashboard update was saved, but its image URL could not be generated.",
    };
    const message = messages[result.error ?? ""] ?? "Unable to save dashboard update to Neon/object storage.";
    throw new Error(result.requestId ? `${message} (Request ID: ${result.requestId})` : message);
  }
  return result.slide;
}

export async function updateDashboardSlide(id: string, update: Partial<DashboardSlide>, file?: File): Promise<DashboardSlide> {
  const form = new FormData();
  form.set("payload", JSON.stringify(update));
  if (file) form.append("image", file, file.name);
  const response = await fetch(`/api/admin/slides/${encodeURIComponent(id)}`, { method: "PATCH", body: form });
  const result = await response.json() as { slide?: DashboardSlide; error?: string };
  if (!response.ok || !result.slide) throw new Error(result.error ?? "Unable to update dashboard update in Neon.");
  return result.slide;
}

export async function deleteDashboardSlide(id: string): Promise<void> {
  const response = await fetch(`/api/admin/slides/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error ?? "Unable to delete dashboard update from Neon.");
  }
}

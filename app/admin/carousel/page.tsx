"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearLocalAdminSession,
  getAdminSession,
  getLocalAdminAccount,
} from "@/lib/client-admin-auth";
import {
  createDashboardSlide,
  deleteDashboardSlide,
  fetchDashboardSlides,
  updateDashboardSlide,
  type DashboardSlide,
} from "@/lib/dashboard-slides";

export default function AdminCarouselPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [slides, setSlides] = useState<DashboardSlide[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [position, setPosition] = useState("4");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] = useState("");
  const [message, setMessage] = useState("");
  const [sessionRole, setSessionRole] = useState<string | null>(null);

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setMounted(true), 0);

    const syncSlides = async () => {
      const current = await getAdminSession();
      setSessionRole(current?.account.role ?? null);
      setAuthResolved(true);
      if (current?.account.role === "PRINCIPAL" || current?.account.role === "DIRECTOR") {
        try {
          setSlides(await fetchDashboardSlides());
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Unable to load dashboard updates.");
        }
      }
    };

    void syncSlides();

    return () => window.clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    if (!mounted || !authResolved) return;
    if (!sessionRole) {
      router.replace("/");
      return;
    }
  }, [authResolved, mounted, router, sessionRole]);

  useEffect(() => {
    if (authResolved && sessionRole && sessionRole !== "PRINCIPAL" && sessionRole !== "DIRECTOR") {
      router.replace("/admin/dashboard");
    }
  }, [authResolved, router, sessionRole]);

  const activeSlides = useMemo(() => slides.filter((slide) => slide.active), [slides]);

  useEffect(() => {
    if (activeSlides.length === 0) return;

    const timer = window.setInterval(() => {
      setPreviewIndex((current) => (current >= activeSlides.length - 1 ? 0 : current + 1));
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeSlides.length]);

  useEffect(() => {
    if (previewIndex >= activeSlides.length) {
      const resetTimer = window.setTimeout(() => setPreviewIndex(0), 0);
      return () => window.clearTimeout(resetTimer);
    }
    return undefined;
  }, [activeSlides.length, previewIndex]);

  const account = getLocalAdminAccount();
  const currentPreview = activeSlides[previewIndex] ?? null;

  async function toggleSlide(id: string) {
    try {
      const updated = await updateDashboardSlide(id, { active: !slides.find((slide) => slide.id === id)?.active });
      setSlides((current) => current.map((slide) => slide.id === id ? updated : slide));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update dashboard slide.");
    }
  }

  async function deleteSlide(id: string) {
    const confirmed = window.confirm("Delete this dashboard slide?");
    if (!confirmed) return;

    try {
      await deleteDashboardSlide(id);
      setSlides((current) => current.filter((slide) => slide.id !== id));
      setMessage("Slide deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete dashboard slide.");
    }
  }

  async function moveSlide(id: string, direction: "up" | "down") {
    const currentIndex = slides.findIndex((slide) => slide.id === id);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= slides.length) return;

    const nextSlides = [...slides];
    const [moved] = nextSlides.splice(currentIndex, 1);
    nextSlides.splice(nextIndex, 0, moved);
    setSlides(nextSlides);

    try {
      const reordered = nextSlides.map((slide, index) => ({ ...slide, order: index }));
      await Promise.all(reordered.map((slide) => updateDashboardSlide(slide.id, { order: slide.order })));
      setMessage(direction === "up" ? "Slide moved up." : "Slide moved down.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reorder dashboard slide.");
      setSlides(slides);
    }
  }

  function replaceSlide(id: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png";

    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        setMessage("Image must be smaller than 5 MB.");
        return;
      }

      void updateDashboardSlide(id, {}, file).then((updated) => {
        setSlides((current) => current.map((slide) => slide.id === id ? updated : slide));
        setMessage("Slide image replaced.");
      }).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to replace slide image."));
    };

    input.click();
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setMessage("Please select a JPEG or PNG image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("Image must be smaller than 5 MB.");
      return;
    }

    setSelectedFile(file);
    setSelectedPreview(URL.createObjectURL(file));
  }

  async function publishSlide() {
    if (!selectedFile) {
      setMessage("Please select an image first.");
      return;
    }

    if (!caption.trim()) {
      setMessage("Please enter a slide caption.");
      return;
    }

    try {
      const created = await createDashboardSlide(selectedFile, caption.trim(), Number(position) - 1);
      setSlides((current) => {
        const next = [...current];
        const targetIndex = Number(position) - 1;
        if (targetIndex >= 0 && targetIndex < next.length) next.splice(targetIndex, 0, created);
        else next.push(created);
        return next;
      });
      setCaption(""); setPosition("4"); setSelectedFile(null); setSelectedPreview(""); setMessage("Dashboard updates published successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish dashboard update.");
    }
  }

  function logout() {
    clearLocalAdminSession();
    router.replace("/");
  }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-helios-surface text-helios-text">
        <div className="mx-auto flex min-h-screen max-w-[1440px] items-center justify-center px-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-helios-primary text-white">
              <span className="material-symbols-outlined">view_carousel</span>
            </div>
            <p className="mt-4 text-lg font-extrabold text-helios-primary">Loading dashboard updates...</p>
          </div>
        </div>
      </main>
    );
  }

  if (sessionRole && sessionRole !== "PRINCIPAL" && sessionRole !== "DIRECTOR") {
    return (
      <main className="min-h-screen bg-helios-surface text-helios-text">
        <div className="mx-auto flex min-h-screen max-w-[960px] items-center justify-center px-4">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-100 text-red-600">
              <span className="material-symbols-outlined text-3xl">lock</span>
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-helios-primary">Access denied</h1>
            <p className="mt-2 text-sm text-helios-muted">Dashboard Updates is restricted to Principal and Director roles.</p>
            <button type="button" onClick={() => router.push("/admin/dashboard")} className="mt-6 rounded-xl bg-helios-primary px-4 py-2.5 text-sm font-bold text-white">
              Return to dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAF8FF] text-[#131B2E]">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 md:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#0D2137] text-white">
              <span className="material-symbols-outlined text-[20px]">view_carousel</span>
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-[#0D2137]">Helios Admin</span>
                <span className="rounded bg-[#FF7A00]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#FF7A00]">Portal</span>
              </div>
              <span className="text-[11px] text-slate-500">Dashboard Updates</span>
            </div>
          </div>

          <div className="relative">
            <button type="button" aria-label="Admin Profile Menu" onClick={() => setMenuOpen((value) => !value)} className="flex items-center gap-1.5 rounded-full p-1 transition-colors hover:bg-slate-100">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#FF7A00] text-xs font-bold text-white">
                {account?.name?.split(" ").slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A"}
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-500">expand_more</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-12 z-50 w-60 rounded-xl border border-slate-100 bg-white py-2 shadow-xl">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <span className="block text-sm font-semibold text-[#0D2137]">{account?.name ?? "Admin User"}</span>
                  <span className="block text-[11px] text-slate-500">{account?.email ?? "admin@helios.local"}</span>
                  <span className="mt-1 inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-800">{sessionRole ?? "Admin"}</span>
                </div>
                <Link href="/admin/profile" className="block px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">Profile</Link>
                <button type="button" onClick={logout} className="w-full border-t border-slate-100 px-3.5 py-2.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50">Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px]">
        <main className="flex flex-col gap-5 px-4 py-4 md:px-6 xl:px-8 md:py-6">
          <div className="flex max-w-3xl items-center gap-1 rounded-xl bg-slate-200/70 p-1">
            <button type="button" onClick={() => router.push("/admin/dashboard")} className="flex-1 rounded-lg py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">VP Primary</button>
            <button type="button" onClick={() => router.push("/admin/dashboard")} className="flex-1 rounded-lg py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">VP Secondary</button>
            <button type="button" onClick={() => router.push("/admin/dashboard")} className="flex-1 rounded-lg py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">My Tickets</button>
            <button type="button" className="flex-1 rounded-lg bg-white py-2 text-xs font-bold text-[#0D2137] shadow-sm">Dashboard Updates</button>
          </div>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-orange-100 p-2 text-orange-700">
                  <span className="material-symbols-outlined text-[20px]">burst_mode</span>
                </div>
                <h1 className="text-lg font-bold text-[#0D2137] md:text-xl">Dashboard Image Manager</h1>
              </div>

              <span className="flex w-fit items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-900">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A00] animate-pulse" />
                {activeSlides.length} Active
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#44474D] md:text-sm">Manage the rotating dashboard and home carousel shown to parents and visitors.</p>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#FF7A00]">phone_iphone</span>
                <span className="text-sm font-semibold text-[#0D2137]">Live Preview</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="material-symbols-outlined text-[14px] text-[#FF7A00]">schedule</span>
                3.0s Auto
              </div>
            </div>

            <div className="relative h-56 overflow-hidden rounded-xl bg-[#0D2137] shadow-inner md:h-72 xl:h-[360px]">
              {currentPreview ? (
                <>
                  <img src={currentPreview.image} alt={currentPreview.title} className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#000917]/90 via-[#000917]/25 to-transparent p-4 md:p-6">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-200 md:text-xs">Slide {previewIndex + 1} of {activeSlides.length}</span>
                    <p className="mt-1 text-base font-bold text-white md:text-xl">{currentPreview.title}</p>
                  </div>
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#000917]/70 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A00] animate-ping" />
                    Simulating rotation
                  </div>
                  <div className="absolute bottom-3 right-4 z-10 flex items-center gap-1.5">
                    {activeSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        aria-label={`Go to slide ${index + 1}`}
                        onClick={() => setPreviewIndex(index)}
                        className={`h-1.5 rounded-full transition-all ${previewIndex === index ? "w-5 bg-[#FF7A00]" : "w-1.5 bg-white/60"}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white">No active slides</div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-[#0D2137]">Active Slides ({slides.length})</h2>
              <span className="text-[10px] text-slate-500">Manage order and visibility</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {slides.map((slide, index) => (
                <div key={slide.id} className={`rounded-xl border bg-white p-3.5 shadow-sm transition-all ${slide.active ? "border-slate-100" : "border-dashed border-slate-300 opacity-70"}`}>
                  <div className="flex items-start gap-3">
                    <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-[#EAEDFF]">
                      <img src={slide.image} alt={slide.title} className="h-full w-full object-cover" />
                      <span className="absolute left-1 top-1 rounded bg-[#000917]/75 px-1.5 py-0.5 text-[9px] font-bold text-white">#{index + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-orange-900">Slide {index + 1} • {slide.duration.toFixed(1)}s</span>
                        <button type="button" aria-label={slide.active ? "Disable slide" : "Enable slide"} onClick={() => toggleSlide(slide.id)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${slide.active ? "bg-[#FF7A00]" : "bg-slate-300"}`}>
                          <span className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${slide.active ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                      <h3 className="mt-2 truncate text-sm font-semibold text-[#0D2137]">{slide.shortTitle}</h3>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{slide.updated}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => moveSlide(slide.id, "up")} disabled={index === 0} className="flex items-center gap-1 rounded-lg bg-[#EAEDFF] px-3 py-1.5 text-[10px] font-semibold text-[#0D2137] disabled:cursor-not-allowed disabled:opacity-40">
                      <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                      Up
                    </button>
                    <button type="button" onClick={() => moveSlide(slide.id, "down")} disabled={index === slides.length - 1} className="flex items-center gap-1 rounded-lg bg-[#EAEDFF] px-3 py-1.5 text-[10px] font-semibold text-[#0D2137] disabled:cursor-not-allowed disabled:opacity-40">
                      <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                      Down
                    </button>
                    <button type="button" onClick={() => replaceSlide(slide.id)} className="flex items-center gap-1 rounded-lg bg-[#EAEDFF] px-3 py-1.5 text-[10px] font-semibold text-[#0D2137]">
                      <span className="material-symbols-outlined text-[16px]">swap_vert</span>
                      Replace
                    </button>
                    <button type="button" onClick={() => deleteSlide(slide.id)} className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-[10px] font-semibold text-red-700">
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-[#FF7A00] p-2 text-white">
                <span className="material-symbols-outlined text-[20px]">add_photo_alternate</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-[#0D2137]">Add New Dashboard Image</h2>
                <p className="text-[11px] text-[#44474D]">Recommended ratio 16:9; maximum size 5 MB</p>
              </div>
            </div>

            <label className="relative mt-4 flex w-full cursor-pointer flex-col items-center justify-center rounded-xl bg-[#F2F3FF] p-6 text-center transition-all hover:bg-[#EAEDFF]">
              <input type="file" accept="image/jpeg,image/png" onChange={handleFile} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />

              {selectedPreview ? (
                <div className="flex w-full flex-col items-center gap-3">
                  <img src={selectedPreview} alt="Selected preview" className="h-40 w-full max-w-xl rounded-lg object-cover" />
                  <span className="text-xs font-bold text-[#0D2137]">{selectedFile?.name}</span>
                  <span className="text-[10px] text-slate-500">Click to choose a different image</span>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#E2E7FF] text-[#FF7A00]">
                    <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
                  </div>
                  <span className="text-sm font-bold text-[#0D2137]">Drag or tap to upload photo</span>
                  <span className="mt-1 text-[11px] text-[#44474D]">Supports JPEG and PNG files</span>
                  <span className="mt-2 flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-semibold text-orange-900">
                    <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
                    Auto-centered for home screens
                  </span>
                </>
              )}
            </label>

            <div className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="slide-caption" className="text-xs font-semibold text-[#131B2E]">Slide Caption / Title</label>
                <div className="relative">
                  <input id="slide-caption" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="e.g. Grand Cultural Fest & Arts Pavilion" className="h-11 w-full rounded-lg bg-[#F2F3FF] px-3.5 pr-10 text-sm text-[#131B2E] outline-none transition-all placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#FF7A00]/20" />
                  <span className="material-symbols-outlined absolute right-3 top-3 text-[18px] text-slate-400">edit</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="slide-order" className="text-xs font-semibold text-[#131B2E]">Slide Position</label>
                  <select id="slide-order" value={position} onChange={(event) => setPosition(event.target.value)} className="h-11 w-full rounded-lg bg-[#F2F3FF] px-3 text-sm text-[#131B2E] outline-none focus:bg-white focus:ring-2 focus:ring-[#FF7A00]/20">
                    <option value="1">Position 1 (First)</option>
                    <option value="2">Position 2</option>
                    <option value="3">Position 3</option>
                    <option value="4">Position 4 (Append)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[#131B2E]">Rotation Delay</label>
                  <div className="flex h-11 w-full items-center justify-between rounded-lg bg-[#F2F3FF] px-3 text-sm text-[#131B2E]">
                    <span>3.0 seconds</span>
                    <span className="material-symbols-outlined text-[18px] text-[#FF7A00]">timer</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-[#E2E7FF] p-3">
                <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-[#FF7A00]">verified_user</span>
                <p className="text-[11px] leading-relaxed text-[#44474D]">Published dashboard changes will appear on the public home carousel after the next refresh.</p>
              </div>

              {message && <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{message}</div>}

              <button type="button" onClick={publishSlide} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#FF7A00] text-sm font-bold text-white shadow-[0_4px_14px_rgba(251,120,0,.38)] transition-transform active:scale-[0.99]">
                <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                Publish Dashboard Updates
              </button>
            </div>
          </section>
        </main>
      </div>
    </main>
  );
}

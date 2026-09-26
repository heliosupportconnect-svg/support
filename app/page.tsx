"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loginLocalAdmin } from "@/lib/client-admin-auth";
import {
  fetchDashboardSlides,
  type DashboardSlide,
} from "@/lib/dashboard-slides";

type HeroSlide = {
  image: string;
  badge: string;
  title: string;
  subtitle: string;
};

function toHeroSlides(slides: DashboardSlide[]): HeroSlide[] {
  return slides
    .filter((slide) => slide.active)
    .map((slide) => ({
      image: slide.image,
      badge: slide.shortTitle || "School Update",
      title: slide.title,
      subtitle: slide.shortTitle || "School Update",
    }));
}

const milestones = [
  {
    phase: "Foundation Phase",
    label: "Andhra Pradesh",
    icon: "flag",
    title: "Establishment of Helios SC Futuristic School",
    description:
      "Inaugurated under the visionary leadership of Sri Sadineni Chowdaraiah to deliver world-class schooling infused with deep traditional ethical values and modern academic infrastructure.",
    dark: false,
  },
  {
    phase: "Tech Revolution",
    label: "STEM Wings",
    icon: "memory",
    title: "Pioneering AI & Robotics Wing",
    description:
      "Commissioned hands-on IoT, machine-learning, and humanoid robotics labs starting from Class 3 cohorts, transforming experiential learning.",
    dark: false,
  },
  {
    phase: "Exploration Era",
    label: "Space & Athletics",
    icon: "rocket_launch",
    title: "Athletic Arena & Space Science Observatory",
    description:
      "Constructed a state-of-the-art astronomical stargazing dome, Olympic-sized synthetic track, and swimming complex fostering athletic resilience.",
    dark: false,
  },
  {
    phase: "Horizon 2030",
    label: "Global Leaders",
    icon: "auto_awesome",
    title: "Vision 2030: Next-Gen Sustainable Campus",
    description:
      "Expanding our international exchange pipeline, clean-energy campus certification, and bespoke personalized AI learning companions for every enrolled scholar.",
    dark: true,
  },
];

function MaterialIcon({
  children,
  filled = false,
  className = "",
}: {
  children: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={
        filled
          ? {
              fontVariationSettings:
                '"FILL" 1, "wght" 650, "GRAD" 0, "opsz" 24',
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminIdentifier, setAdminIdentifier] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRememberMe, setAdminRememberMe] = useState(true);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminMessageType, setAdminMessageType] = useState<"error" | "success">("error");
  const [adminLoading, setAdminLoading] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeResetToken, setSwipeResetToken] = useState(0);

  useEffect(() => {
    const syncSlides = async () => {
      try {
        setHeroSlides(toHeroSlides(await fetchDashboardSlides()));
      } catch {
        setHeroSlides([]);
      }
    };

    syncSlides();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "helios_dashboard_slides") {
        syncSlides();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (isPaused || heroSlides.length === 0) return;

    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [heroSlides.length, isPaused, swipeResetToken]);

  useEffect(() => {
    if (heroSlides.length === 0) {
      const resetTimer = window.setTimeout(() => setActiveSlide(0), 0);
      return () => window.clearTimeout(resetTimer);
    }

    const normalizeTimer = window.setTimeout(() => {
      setActiveSlide((current) => (current + heroSlides.length) % heroSlides.length);
    }, 0);
    return () => window.clearTimeout(normalizeTimer);
  }, [heroSlides.length]);

  useEffect(() => {
    if (!adminModalOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAdminModalOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [adminModalOpen]);

  const currentSlide = heroSlides[activeSlide] ?? heroSlides[0] ?? null;

  function openAdminModal() {
    setAdminMessage("");
    setAdminModalOpen(true);
  }

  function goToSlide(index: number) {
    if (heroSlides.length === 0) return;

    setActiveSlide((current) => {
      const normalizedIndex = ((index % heroSlides.length) + heroSlides.length) % heroSlides.length;
      return current === normalizedIndex ? current : normalizedIndex;
    });

    setSwipeResetToken((value) => value + 1);
  }

  function navigateSlide(direction: 1 | -1) {
    if (heroSlides.length === 0) return;

    setActiveSlide((current) => {
      const nextIndex = (current + direction + heroSlides.length) % heroSlides.length;
      return nextIndex;
    });

    setSwipeResetToken((value) => value + 1);
  }

  function handleHeroTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  }

  function handleHeroTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (!touchStart) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
      navigateSlide(deltaX < 0 ? 1 : -1);
    }

    setTouchStart(null);
  }

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adminLoading) return;

    if (!adminIdentifier.trim() || !adminPassword) {
      setAdminMessage("Please enter your admin credentials.");
      setAdminMessageType("error");
      return;
    }

    setAdminLoading(true);
    try {
      const account = await loginLocalAdmin(
        adminIdentifier,
        adminPassword,
        adminRememberMe
      );

      if (!account) {
        setAdminMessage("Invalid admin credentials.");
        setAdminMessageType("error");
        return;
      }

      setAdminModalOpen(false);
      router.replace("/admin/dashboard");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Unable to sign in.");
      setAdminMessageType("error");
    } finally {
      setAdminLoading(false);
    }
  }

  return (
    <main className="helios-page">
      {/* =====================================================
          HEADER
          ===================================================== */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[1440px] items-center justify-between gap-2 px-3 py-2 md:min-h-[82px] md:gap-4 md:px-8 md:py-3 lg:px-12">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuB2Gj2lvWtHD1sv1G4tT4L9mv-VEjz1hJvCQuy5Kjw4k3WzYjsuZCLeFcEdC029-3dpXfOh5VlB1a7oHnTHh6xccxEnZNq2IeiAmX1IAogHlyJFdHUp8kN_P6l42vGG4iZmorXnKP7Jdvfn-j80_Jjq6yORVetTR0tjkR1k7oEtl9f7eQwG2CM8Cq7olXjdRAPxDXqOG5wScDA3-mzq7DCoNkKj2tlydS_VE-iWTqvBHScQf-D46XkJEVgQaPszWV4s0g"
              alt="Helios Sunburst Logo"
              className="h-9 w-9 shrink-0 object-contain md:h-14 md:w-14"
            />

            <div className="min-w-0 leading-tight">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-helios-secondary md:text-xs md:tracking-[0.16em]">
                Helios
              </div>

              <div className="whitespace-nowrap text-[11px] font-extrabold text-slate-900 md:text-xl">
                Sadineni Chowdaraiah
              </div>

              <div className="whitespace-nowrap text-[10px] font-semibold text-slate-500 md:text-sm">
                Futuristic School
              </div>

              <div className="mt-0.5 hidden text-[9px] font-extrabold uppercase tracking-[0.1em] text-helios-secondary sm:block md:text-[11px]">
                Parent Support & Ticketing Portal
              </div>
            </div>
          </div>

          <div className="flex w-[76px] shrink-0 flex-col items-stretch gap-1.5 md:w-auto md:flex-row md:items-center md:gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-9 whitespace-nowrap items-center justify-center gap-1 rounded-full bg-helios-surface-container px-1.5 py-1.5 text-xs font-bold text-slate-800 transition hover:bg-helios-surface-high md:min-h-10 md:gap-1.5 md:px-5 md:py-2.5 md:text-base"
            >
              <MaterialIcon className="text-[16px] md:text-[18px]">lock</MaterialIcon>
              <span>Login</span>
            </Link>

            <Link
              href="/register"
              className="inline-flex min-h-9 whitespace-nowrap items-center justify-center gap-1 rounded-full bg-helios-orange px-1.5 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:brightness-95 active:scale-[0.98] md:min-h-10 md:gap-1.5 md:px-6 md:py-2.5 md:text-base"
            >
              <MaterialIcon className="text-[16px] md:text-[18px]">person_add</MaterialIcon>
              <span>Sign Up</span>
            </Link>
          </div>
        </div>
      </header>

      {/* =====================================================
          HERO CAROUSEL
          ===================================================== */}
      <section
        className={`relative overflow-hidden ${currentSlide ? "bg-[#FAF8FF]" : "bg-[#0D2137]"}`}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleHeroTouchStart}
        onTouchEnd={handleHeroTouchEnd}
        style={{ touchAction: "pan-y" }}
      >
        <div className="relative h-[330px] min-h-[330px] w-full sm:h-[420px] sm:min-h-[420px] md:h-[500px] md:min-h-[500px] lg:h-[520px] lg:min-h-[520px]">
          {currentSlide ? (
            <div
              key={currentSlide.title}
              className="absolute inset-0 z-10 transition-opacity duration-700"
            >
              <img
                src={currentSlide.image}
                alt=""
                aria-hidden="true"
                className="absolute inset-[-5%] h-[110%] w-[110%] max-w-none object-cover object-center blur-[24px]"
              />

              <div className="absolute inset-0 bg-black/15" aria-hidden="true" />

              <img
                src={currentSlide.image}
                alt={currentSlide.title}
                className="relative z-10 h-full w-full object-contain object-center"
              />

              <div className="absolute inset-x-0 bottom-0 z-20 pb-6 md:pb-8 lg:pb-10">
                <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 lg:px-12">
                  <div className="max-w-[560px]">
                    <span className="mb-2.5 inline-flex rounded-full bg-helios-orange px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-white shadow-sm md:px-3 md:py-1 md:text-[10px]">
                      {currentSlide.badge}
                    </span>

                    <h1 className="text-[26px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white drop-shadow-md sm:text-[32px] md:text-[38px] lg:text-[44px]">
                      {currentSlide.title}
                    </h1>

                    <p className="mt-1.5 text-xs font-medium text-white/90 sm:text-sm md:text-base">
                      {currentSlide.subtitle}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-x-0 bottom-0 z-20 pb-6 md:pb-8 lg:pb-10">
              <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 lg:px-12">
                <div className="max-w-[560px] rounded-2xl border border-white/20 bg-[#0D2137] p-4">
                  <span className="mb-2.5 inline-flex rounded-full bg-helios-orange px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-white shadow-sm md:px-3 md:py-1 md:text-[10px]">
                    School Update
                  </span>
                  <h1 className="text-[26px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white drop-shadow-md sm:text-[32px] md:text-[38px] lg:text-[44px]">
                    Helios Futuristic School
                  </h1>
                  <p className="mt-1.5 text-xs font-medium text-white/90 sm:text-sm md:text-base">
                    Dashboard updates will appear here as soon as they are published.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
            {heroSlides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                aria-current={activeSlide === index}
                onClick={() => goToSlide(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeSlide === index
                    ? "w-7 bg-helios-orange"
                    : "w-2 bg-white/65"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================
          INSTITUTIONAL METRICS
          ===================================================== */}
      <section className="mx-auto grid w-full max-w-[1440px] grid-cols-3 gap-2 px-4 py-4 md:gap-5 md:px-8 md:py-7 lg:px-12">
        <div className="flex min-h-[115px] flex-col items-center justify-center rounded-2xl bg-white p-3 text-center shadow-sm md:min-h-[150px] md:p-5">
          <MaterialIcon className="mb-1.5 text-2xl text-helios-orange md:text-3xl">
            smart_toy
          </MaterialIcon>
          <span className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            100%
          </span>
          <span className="mt-1 text-[10px] font-semibold text-slate-500 md:text-sm">
            AI & Robotics Lab
          </span>
        </div>

        <div className="flex min-h-[115px] flex-col items-center justify-center rounded-2xl bg-white p-3 text-center shadow-sm md:min-h-[150px] md:p-5">
          <MaterialIcon className="mb-1.5 text-2xl text-helios-orange md:text-3xl">
            workspace_premium
          </MaterialIcon>
          <span className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            CBSE+
          </span>
          <span className="mt-1 text-[10px] font-semibold text-slate-500 md:text-sm">
            Global Standard
          </span>
        </div>

        <div className="flex min-h-[115px] flex-col items-center justify-center rounded-2xl bg-white p-3 text-center shadow-sm md:min-h-[150px] md:p-5">
          <MaterialIcon className="mb-1.5 text-2xl text-helios-orange md:text-3xl">
            groups
          </MaterialIcon>
          <span className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            1:20
          </span>
          <span className="mt-1 text-[10px] font-semibold text-slate-500 md:text-sm">
            Teacher Ratio
          </span>
        </div>
      </section>

      {/* =====================================================
          OUR GLORIOUS JOURNEY
          ===================================================== */}
      <section className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-12 lg:px-12">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <MaterialIcon className="text-helios-orange">timeline</MaterialIcon>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-helios-secondary md:text-xs">
              Institutional Milestones
            </span>
          </div>

          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            Our Glorious Journey
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600 md:text-base md:leading-7">
            From pioneering academic foresight in Andhra Pradesh to leading
            next-generation space & robotics schooling.
          </p>
        </div>

        <div className="relative mt-7 md:mt-10">
          {/* Mobile timeline line */}
          <div className="absolute bottom-5 left-[11px] top-5 w-0.5 bg-gradient-to-b from-helios-surface-dim via-[#b8c4e7] to-helios-surface-dim md:hidden" />

          {/* Desktop center line */}
          <div className="absolute bottom-0 left-1/2 top-0 hidden w-0.5 -translate-x-1/2 bg-gradient-to-b from-helios-surface-dim via-[#b8c4e7] to-helios-surface-dim md:block" />

          <div className="grid gap-5 md:grid-cols-2 md:gap-x-10 md:gap-y-8">
            {milestones.map((milestone, index) => (
              <article
                key={milestone.title}
                className={`relative pl-8 md:pl-0 ${
                  index % 2 === 1 ? "md:pt-20" : ""
                }`}
              >
                {/* Timeline dot */}
                <div
                  className={`absolute left-0 top-1 grid h-6 w-6 place-items-center rounded-full border-[3px] border-helios-surface text-white shadow-sm md:top-6 md:h-7 md:w-7 ${
                    milestone.dark
                      ? "bg-helios-orange"
                      : index === 0
                        ? "bg-helios-orange"
                        : "bg-helios-surface-highest text-slate-700"
                  } ${
                    index % 2 === 0
                      ? "md:left-auto md:right-[-35px]"
                      : "md:left-[-35px]"
                  }`}
                >
                  <MaterialIcon className="text-[12px]">
                    {milestone.icon}
                  </MaterialIcon>
                </div>

                <div
                  className={`rounded-2xl p-4 shadow-sm md:min-h-[220px] md:p-7 ${
                    milestone.dark
                      ? "bg-helios-primary-container text-white shadow-lg"
                      : "bg-white"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span
                      className={`rounded-md px-2 py-1 text-[10px] font-extrabold md:text-xs ${
                        milestone.dark
                          ? "bg-helios-orange text-white"
                          : "bg-helios-surface-container text-slate-700"
                      }`}
                    >
                      {milestone.phase}
                    </span>

                    <span
                      className={`text-xs font-extrabold md:text-sm ${
                        milestone.dark
                          ? "text-orange-200"
                          : "text-helios-secondary"
                      }`}
                    >
                      {milestone.label}
                    </span>
                  </div>

                  <h3
                    className={`text-lg font-extrabold leading-7 md:text-2xl ${
                      milestone.dark ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {milestone.title}
                  </h3>

                  <p
                    className={`mt-2 text-sm leading-6 md:text-base md:leading-7 ${
                      milestone.dark ? "text-white/80" : "text-slate-600"
                    }`}
                  >
                    {milestone.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================
          CAMPUS HELPLINE
          ===================================================== */}
      <section className="mt-2 rounded-t-[28px] bg-helios-surface-high py-5 md:mt-8 md:py-8">
        <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8 lg:px-12">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MaterialIcon className="text-helios-orange">
                support_agent
              </MaterialIcon>

              <h2 className="text-lg font-extrabold text-slate-900 md:text-2xl">
                Campus Helpline Desk
              </h2>
            </div>

            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-extrabold text-helios-secondary md:text-xs">
              Active 9 AM - 6 PM
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:gap-4">
            <a
              href="tel:9603109222"
              className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm transition hover:-translate-y-0.5 md:p-4"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-700 md:h-11 md:w-11">
                <MaterialIcon className="text-base">call</MaterialIcon>
              </span>

              <span className="min-w-0">
                <span className="block truncate text-[10px] font-semibold text-slate-500 md:text-sm">
                  Reception Desk
                </span>
                <span className="block truncate text-sm font-extrabold text-slate-900 md:text-base">
                  Call Admin
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-bold text-helios-secondary md:text-sm">
                  9603109222
                </span>
              </span>
            </a>
          </div>

          <p className="pt-4 text-center text-xs text-slate-500 md:pt-6 md:text-sm">
            © Helios Sadineni Chowdaraiah Futuristic School, AP.
          </p>

          <button
            type="button"
            onClick={openAdminModal}
            className="mx-auto mt-2 block text-[11px] font-semibold text-slate-600 underline-offset-2 hover:underline"
          >
            Admin Login
          </button>
        </div>
      </section>

      {adminModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-login-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAdminModalOpen(false);
          }}
        >
          <section className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-helios-secondary">
                  <MaterialIcon className="text-[19px] text-helios-orange">admin_panel_settings</MaterialIcon>
                  HELIOS ADMIN PORTAL
                </div>
                <h2 id="admin-login-title" className="mt-2 text-2xl font-extrabold text-slate-900">
                  Admin Sign In
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Sign in to access the Helios administration console.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close admin login"
                onClick={() => setAdminModalOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <MaterialIcon>close</MaterialIcon>
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleAdminLogin} autoComplete="off">
              <AdminInput label="Username" value={adminIdentifier} onChange={setAdminIdentifier} placeholder="Enter your username" />
              <AdminInput label="Password" type="password" value={adminPassword} onChange={setAdminPassword} placeholder="Enter your admin password" />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input type="checkbox" checked={adminRememberMe} onChange={(event) => setAdminRememberMe(event.target.checked)} className="h-4 w-4 accent-[#FB7800]" />
                Keep me signed in
              </label>
              <button type="submit" disabled={adminLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-helios-orange px-4 py-3.5 text-sm font-extrabold text-white shadow-md disabled:opacity-70">
                {adminLoading && <MaterialIcon className="animate-spin text-[20px]">sync</MaterialIcon>}
                {adminLoading ? "Verifying Admin Credentials..." : "Sign In to Admin Portal"}
              </button>
            </form>

            {adminMessage && (
              <div className={`mt-4 rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${adminMessageType === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`} role="status" aria-live="polite">
                {adminMessage}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function AdminInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-900">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "new-password" : "off"}
        className="mt-1.5 w-full rounded-xl bg-helios-surface-low px-3 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-orange-200"
      />
    </label>
  );
}
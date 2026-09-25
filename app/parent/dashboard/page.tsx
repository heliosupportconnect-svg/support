"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useEffect,
  useState,
} from "react";
import {
  getLocalParent,
  getLocalSession,
  getParentSession,
  logoutLocalParent,
} from "@/lib/client-auth";
import {
  createLocalTicket,
  getLocalTicketsForParent,
  getTicketStatusLabel,
  type LocalTicket,
} from "@/lib/local-tickets";

type DeskTab = "raise" | "view";

const categories = [
  {
    label: "Academic",
    icon: "menu_book",
  },
  {
    label: "Bus Route",
    value: "Bus/Transport",
    icon: "directions_bus",
  },
  {
    label: "Fees & Accounts",
    icon: "receipt_long",
  },
  {
    label: "Disciplinary",
    icon: "gavel",
  },
  {
    label: "Admin Desk",
    value: "Administration",
    icon: "corporate_fare",
  },
  {
    label: "Others",
    icon: "more_horiz",
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

function isPastTicket(ticketOrStatus: LocalTicket | LocalTicket["status"]): boolean {
  const status = typeof ticketOrStatus === "string" ? ticketOrStatus : ticketOrStatus.status;
  return status === "RESOLVED" || status === "CLOSED";
}

function statusLabel(status: LocalTicket["status"]): string {
  return getTicketStatusLabel(status);
}

function statusBadgeClass(status: LocalTicket["status"]): string {
  if (status === "RESOLVED" || status === "CLOSED") return "bg-emerald-100 text-emerald-700";
  if (status === "IN_PROGRESS" || status === "ASSIGNED" || status === "ESCALATED") return "bg-orange-100 text-orange-700";
  return "bg-slate-100 text-slate-700";
}

function StatusBadge({ status }: { status: LocalTicket["status"] }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}

function ProgressDots({ status }: { status: LocalTicket["status"] }) {
  const resolved = isPastTicket(status);
  const currentStage = status === "SUBMITTED" ? 0 : status === "RESOLVED" || status === "CLOSED" ? 2 : 1;
  const stages = ["Submitted", "In Progress", "Resolved"];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[9px] font-semibold text-helios-muted">
      {stages.map((stage, index) => {
        const complete = resolved || index < currentStage;
        const current = !resolved && index === currentStage;
        return <div key={stage} className="relative"><div className={`mx-auto h-2.5 w-2.5 rounded-full ${complete ? "bg-emerald-500" : current ? "bg-helios-orange" : "bg-slate-300"}`} /><span className={current ? "text-helios-orange" : complete ? "text-emerald-700" : ""}>{stage}</span>{index < 2 && <span className={`absolute left-1/2 top-1.5 h-px w-full ${complete ? "bg-emerald-300" : "bg-slate-200"}`} />}</div>;
      })}
    </div>
  );
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [parent, setParent] = useState<ReturnType<typeof getLocalParent>>(null);
  const [tickets, setTickets] = useState<LocalTicket[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return null;
      setParent(null);
      setTickets([]);
      return getParentSession(true);
    }).then((current) => {
      if (!active) return;
      if (!current) {
        router.replace("/login");
        return;
      }
      setParent(current.parent);
      void getLocalTicketsForParent().then(setTickets).catch(() => setTickets([]));
    });

    return () => { active = false; };
  }, [router]);

  const [activeTab, setActiveTab] =
    useState<DeskTab>("view");

  const [category, setCategory] =
    useState("Academic");

  const [subject, setSubject] = useState("");

  const [description, setDescription] = useState("");

  const [attachment, setAttachment] =
    useState<File | null>(null);

  const [toast, setToast] = useState(false);
  const [lastTicketNumber, setLastTicketNumber] = useState("");

  const [profileOpen, setProfileOpen] =
    useState(false);
  const [profileModalOpen, setProfileModalOpen] =
    useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] =
    useState(false);

  const [notificationMessage, setNotificationMessage] =
    useState("");

  const charCount = description.length;

  function switchTab(tab: DeskTab) {
    setActiveTab(tab);
    setToast(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openTicket(ticketId: string) {
    router.push(`/parent/tickets/${ticketId}`);
  }

  function handleAttachment(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowed =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      file.type === "application/pdf";

    if (!allowed) {
      setNotificationMessage(
        "Please upload a PNG, JPG, or PDF file."
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setNotificationMessage(
        "Attachment must be smaller than 10 MB."
      );
      return;
    }

    setAttachment(file);
    setNotificationMessage("");
  }

  async function submitTicket() {
    if (!subject.trim()) {
      setNotificationMessage(
        "Please enter a subject for your concern."
      );
      return;
    }

    if (!description.trim()) {
      setNotificationMessage(
        "Please describe your concern."
      );
      return;
    }

    const session = getLocalSession();
    const currentParent = getLocalParent();

    if (!session || !currentParent || session.userId !== currentParent.id) {
      router.replace("/login");
      return;
    }

    try {
      const ticket = await createLocalTicket({
        studentId: currentParent.student.admissionNumber,
        category,
        subject: subject.trim(),
        description: description.trim(),
        attachmentNames: attachment ? [attachment.name] : [],
        attachment: attachment ?? undefined,
      });

      setTickets((currentTickets) => [ticket, ...currentTickets]);
      setLastTicketNumber(ticket.ticketNumber);
      setSubject("");
      setDescription("");
      setAttachment(null);
      setNotificationMessage("");

      setToast(true);

      window.setTimeout(() => {
        setToast(false);
        switchTab("view");
      }, 1800);
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Unable to submit the ticket.");
    }
  }

  function getInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function confirmLogout() {
    setProfileOpen(false);
    setLogoutConfirmOpen(true);
  }

  function logout() {
    logoutLocalParent();
    setLogoutConfirmOpen(false);
    router.replace("/");
  }

  return (
    <main className="min-h-screen bg-helios-surface text-helios-text">

      {/* ===================================================
          HEADER
          =================================================== */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-helios-surface-container-lowest/95 shadow-[0_1px_8px_rgba(13,33,55,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 md:min-h-[72px] md:px-8 lg:px-10 xl:px-12">

          <div className="flex min-w-0 items-center gap-2">
            <img
              alt="Helios Logo"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuC8Zk3cxanlc_o3a6E_bJHPFz4MxUWF4As-I_rw7_3UDzIA2KZ2a7bRxIlMpJUclScNPurV9wz4pDdQFFMhQMjxTycmgjb-5oYSwax3UyJqPpzPaIUdcUydxI8zQFwl2GPagg8BjHjT-1bxvSF2cYu7StfF0D1rb-7_qMLMYTUTdN4emxhxOVSwwk4BoGN4fwg0rSQ9-QqouUY7GtKV3J1MtOOwLPkBj_jc-S1L8HbLrMz2pA0qE96vGfnOfwK4VgnSHg"
              className="h-8 w-8 shrink-0 object-contain md:h-9 md:w-9"
            />

            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight text-helios-primary">
                Raise Ticket
              </div>

              <div className="truncate text-[11px] font-medium text-helios-muted">
                Helios Support Desk
              </div>
            </div>
          </div>

          {/* Profile */}
          <div className="relative">
            <button
              type="button"
              aria-label="Parent account menu"
              onClick={() =>
                setProfileOpen((current) => !current)
              }
              className="flex items-center gap-1.5 rounded-full p-1 transition hover:bg-helios-surface-container"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-helios-surface-container-high text-xs font-bold text-helios-secondary">
                {parent ? getInitials(parent.name) : ""}
              </div>

              <MaterialIcon className="text-[18px] text-helios-muted">
                expand_more
              </MaterialIcon>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
                <div className="border-b border-slate-100 px-3 py-3">
                  <div className="font-semibold text-helios-primary">
                    {parent?.name ?? "Parent Account"}
                  </div>

                  <div className="text-xs text-helios-muted">
                    {parent
                      ? `Parent of ${parent.student.name} (${parent.student.className} ${parent.student.section.replace(/^Section\s*/i, "")})`
                      : "Parent account"}
                  </div>
                </div>

                <Link
                  href="#profile"
                  onClick={(event) => {
                    event.preventDefault();
                    setProfileOpen(false);
                    setProfileModalOpen(true);
                  }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-helios-surface-container"
                >
                  <MaterialIcon className="text-[20px] text-helios-orange">
                    account_circle
                  </MaterialIcon>

                  View Profile
                </Link>

                <button
                  type="button"
                  onClick={confirmLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <MaterialIcon className="text-[20px]">
                    logout
                  </MaterialIcon>

                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 md:px-8 lg:px-10 xl:px-12">

        {/* =================================================
            TAB RAIL
            ================================================= */}
        <div className="pt-4">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-helios-surface-container p-1">
            <button
              type="button"
              onClick={() => switchTab("raise")}
              className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "raise"
                  ? "bg-white text-helios-primary shadow-sm"
                  : "text-helios-muted"
              }`}
            >
              <MaterialIcon
                filled={activeTab === "raise"}
                className={
                  activeTab === "raise"
                    ? "text-[18px] text-helios-orange"
                    : "text-[18px]"
                }
              >
                add_circle
              </MaterialIcon>

              <span>Raise a Ticket</span>
            </button>

            <button
              type="button"
              onClick={() => switchTab("view")}
              className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "view"
                  ? "bg-white text-helios-primary shadow-sm"
                  : "text-helios-muted"
              }`}
            >
              <MaterialIcon
                filled={activeTab === "view"}
                className={
                  activeTab === "view"
                    ? "text-[18px] text-helios-orange"
                    : "text-[18px]"
                }
              >
                inbox
              </MaterialIcon>

              <span className="truncate">
                View My Tickets
              </span>

              {activeTab === "view" && (
                <span className="h-2 w-2 rounded-full bg-helios-orange" />
              )}
            </button>
          </div>
        </div>

        {/* =================================================
            RAISE TICKET
            ================================================= */}
        {activeTab === "raise" && (
          <div className="mt-4 space-y-4">

            {/* Intro */}
            <section className="relative overflow-hidden rounded-2xl bg-helios-surface-low p-4 shadow-sm md:p-5">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-orange-200/40 blur-2xl" />

              <div className="relative z-10">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-helios-surface-container-high px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-helios-secondary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-helios-orange" />
                    Direct Desk Access
                  </span>

                </div>

                <h2 className="mt-3 text-xl font-semibold text-helios-primary">
                  Raise a Support Concern
                </h2>

                <p className="mt-1 text-sm leading-6 text-helios-muted">
                  How can we help? Connect directly with
                  Helios Sadineni Chowdaraiah Futuristic
                  School administration, class teachers,
                  transport in-charge or principal desk.
                </p>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-helios-surface-container text-helios-secondary">
                      <MaterialIcon className="text-[18px]">
                        support_agent
                      </MaterialIcon>
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-helios-primary">
                        Helios Sadineni Chowdaraiah
                        Parent Desk
                      </div>

                      <div className="text-xs text-helios-muted">
                        +91 9603109222
                      </div>
                    </div>
                  </div>

                  <a
                    href="tel:9603109222"
                    className="shrink-0 rounded-full bg-helios-surface-container-high px-3 py-2 text-[11px] font-bold text-helios-primary"
                  >
                    Call Desk
                  </a>
                </div>
              </div>
            </section>

            {/* Form */}
            <section className="rounded-2xl bg-white p-4 shadow-sm md:p-6">

              {/* Student */}
              <div>
                <label className="mb-1.5 block text-xs font-bold md:text-sm">
                  Student Profile
                  <span className="ml-1 text-helios-orange">
                    *
                  </span>
                </label>

                <div className="flex items-center gap-3 rounded-xl bg-helios-surface-low p-2.5">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-helios-surface-container text-sm font-bold text-helios-primary">
                        {parent ? getInitials(parent.student.name) : ""}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-helios-primary">
                        {parent?.student.name ?? "Student Profile"}
                      </span>

                      <span className="rounded-full bg-helios-surface-highest px-2 py-0.5 text-[10px] font-bold text-helios-primary">
                        {parent
                          ? `${parent.student.className} ${parent.student.section.replace(/^Section\s*/i, "")}`
                          : ""}
                      </span>
                    </div>

                    <span className="block truncate text-xs text-helios-muted">
                      {parent
                        ? `Admission #${parent.student.admissionNumber} • ${parent.student.house}`
                        : "Enter student details during registration"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="rounded-full p-1 text-helios-muted hover:bg-helios-surface-container"
                    title="Change student"
                  >
                    <MaterialIcon className="text-[20px]">
                      swap_vert
                    </MaterialIcon>
                  </button>
                </div>
              </div>

              {/* Current student placement */}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="student-current-class" className="mb-1.5 block text-xs font-bold md:text-sm">
                    Current Class
                    <span className="ml-1 text-helios-orange">*</span>
                  </label>

                  <div className="helios-input" aria-readonly="true">{parent?.student.className || "Not available"}</div>
                </div>

                <div>
                  <label htmlFor="student-current-section" className="mb-1.5 block text-xs font-bold md:text-sm">
                    Current Section
                    <span className="ml-1 text-helios-orange">*</span>
                  </label>

                  <div className="helios-input" aria-readonly="true">{parent?.student.section || "Not available"}</div>
                </div>
              </div>

              {/* Categories */}
              <div className="mt-5">
                <label className="mb-2 block text-xs font-bold md:text-sm">
                  Concern Category
                  <span className="ml-1 text-helios-orange">
                    *
                  </span>
                </label>

                <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                  {categories.map((item) => {
                    const itemValue =
                      item.value ?? item.label;

                    const active =
                      category === itemValue;

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() =>
                          setCategory(itemValue)
                        }
                        className={`flex min-h-[82px] flex-col items-center justify-center rounded-xl p-2.5 transition ${
                          active
                            ? "bg-helios-primary text-white shadow-sm"
                            : "bg-helios-surface-container text-helios-primary"
                        }`}
                      >
                        <MaterialIcon
                          className={`mb-1 text-[22px] ${
                            active
                              ? "text-helios-orange"
                              : "text-helios-primary"
                          }`}
                        >
                          {item.icon}
                        </MaterialIcon>

                        <span className="w-full truncate text-center text-[10px] font-bold md:text-[11px]">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subject */}
              <div className="mt-5">
                <label
                  htmlFor="ticket-subject"
                  className="mb-1.5 block text-xs font-bold md:text-sm"
                >
                  Subject / Title
                  <span className="ml-1 text-helios-orange">
                    *
                  </span>
                </label>

                <input
                  id="ticket-subject"
                  value={subject}
                  onChange={(e) =>
                    setSubject(e.target.value)
                  }
                  placeholder="E.g., Query regarding term lab assessments..."
                  className="helios-input"
                />
              </div>

              {/* Description */}
              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label
                    htmlFor="ticket-description"
                    className="text-xs font-bold md:text-sm"
                  >
                    Concern Description
                    <span className="ml-1 text-helios-orange">
                      *
                    </span>
                  </label>

                  <span className="text-[11px] text-helios-outline">
                    {charCount}/500
                  </span>
                </div>

                <textarea
                  id="ticket-description"
                  value={description}
                  onChange={(e) =>
                    setDescription(
                      e.target.value.slice(0, 500)
                    )
                  }
                  rows={5}
                  placeholder="Describe the issue or feedback in detail..."
                  className="helios-input resize-none"
                />
              </div>

              {/* Attachment */}
              <div className="mt-5">
                <label className="mb-1.5 block text-xs font-bold md:text-sm">
                  Supporting Documents / Photos
                </label>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-helios-surface-container px-4 py-3 text-xs font-bold text-helios-primary">
                    <MaterialIcon className="text-[18px] text-helios-orange">
                      add_a_photo
                    </MaterialIcon>

                    Upload Attachment

                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.pdf"
                      onChange={handleAttachment}
                      className="hidden"
                    />
                  </label>

                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-helios-surface-low px-3">
                    <MaterialIcon className="text-[18px] text-helios-muted">
                      attachment
                    </MaterialIcon>

                    {attachment ? (
                      <>
                        <span className="truncate text-xs text-helios-primary">
                          {attachment.name}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setAttachment(null)
                          }
                          className="ml-auto rounded-full p-1 text-helios-muted hover:text-red-600"
                        >
                          <MaterialIcon className="text-[16px]">
                            close
                          </MaterialIcon>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-helios-muted">
                        Optional attachment
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {notificationMessage && (
                <div className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
                  {notificationMessage}
                </div>
              )}

              <button
                type="button"
                onClick={submitTicket}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-helios-orange to-helios-secondary text-sm font-bold text-white shadow-[0_4px_14px_rgba(251,120,0,0.35)] transition active:scale-[0.99]"
              >
                <MaterialIcon className="text-[20px]">
                  send
                </MaterialIcon>

                Submit &amp; Raise Ticket
              </button>
            </section>

            {/* Recently submitted */}
            <section className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MaterialIcon className="text-[20px] text-helios-orange">
                    history
                  </MaterialIcon>

                  <span className="font-semibold text-helios-primary">
                    Recently Submitted
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => switchTab("view")}
                  className="flex items-center gap-0.5 text-xs font-bold text-helios-orange hover:underline"
                >
                  View All ({tickets.length})

                  <MaterialIcon className="text-[16px]">
                    arrow_forward
                  </MaterialIcon>
                </button>
              </div>

              {tickets[0] ? (
                <button
                  type="button"
                  onClick={() => openTicket(tickets[0].ticketNumber)}
                  className="mt-3 w-full rounded-xl bg-helios-surface-low p-3 text-left transition hover:bg-helios-surface-container"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-helios-muted">
                      Ticket #{tickets[0].ticketNumber} • {formatDate(tickets[0].createdAt)}
                    </span>

                    <StatusBadge status={tickets[0].status} />
                  </div>

                  <p className="mt-1 font-semibold text-helios-primary">
                    {tickets[0].subject}
                  </p>
                </button>
              ) : (
                <p className="mt-3 rounded-xl bg-helios-surface-low p-3 text-sm text-helios-muted">
                  No support tickets yet.
                </p>
              )}
            </section>
          </div>
        )}

        {/* =================================================
            VIEW MY TICKETS
            ================================================= */}
        {activeTab === "view" && (
          <div className="mt-4 space-y-4">

            {/* Student summary */}
            <section className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm md:p-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-helios-surface-container text-xs font-bold">
                  {parent ? getInitials(parent.student.name) : ""}
                </div>

                <div className="min-w-0">
                  <div className="font-semibold text-helios-primary">
                    {parent ? `${parent.student.name}'s Queries` : "My Tickets"}
                  </div>

                  <div className="text-xs text-helios-muted">
                    {parent
                      ? `Class ${parent.student.className} ${parent.student.section.replace(/^Section\s*/i, "")} • ${tickets.length} Total Logged`
                      : `${tickets.length} Total Logged`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => switchTab("raise")}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-helios-orange px-3 text-xs font-bold text-white shadow-sm"
              >
                <MaterialIcon className="text-[16px]">
                  add
                </MaterialIcon>

                New
              </button>
            </section>

            <TicketSection
              title={`ACTIVE TICKETS (${tickets.filter((ticket) => !isPastTicket(ticket)).length})`}
              tickets={tickets.filter((ticket) => !isPastTicket(ticket))}
              emptyTitle="No active tickets"
              emptyDescription="New concerns you raise will appear here."
              emptyAction="Raise a Ticket"
              onEmptyAction={() => switchTab("raise")}
              onOpen={openTicket}
              formatDate={formatDate}
            />

            <TicketSection
              title={`PAST TICKETS (${tickets.filter(isPastTicket).length})`}
              tickets={tickets.filter(isPastTicket)}
              emptyTitle="No past tickets yet"
              emptyDescription=""
              onOpen={openTicket}
              formatDate={formatDate}
              past
            />

            {/* Commitment */}
            <section className="flex items-start gap-3 rounded-2xl bg-helios-surface-container p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-helios-orange">
                <MaterialIcon className="text-[20px]">
                  school
                </MaterialIcon>
              </div>

              <div>
                <div className="font-semibold text-helios-primary">
                  Helios Parent Support Commitment
                </div>

                <p className="mt-0.5 text-sm leading-6 text-helios-muted">
                  Every concern is reviewed and directed to the appropriate school team.
                  We aim to respond promptly, with student safety and parent support as our priority.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ===================================================
          SUBMISSION TOAST
          =================================================== */}
      {toast && (
        <div className="fixed inset-x-4 bottom-5 z-[60] mx-auto max-w-md">
          <div className="flex items-center gap-3 rounded-2xl bg-helios-primary p-4 text-white shadow-xl">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-helios-orange">
              <MaterialIcon className="text-[20px]">
                check
              </MaterialIcon>
            </div>

            <div className="min-w-0">
              <div className="truncate font-semibold">
                Ticket #{lastTicketNumber} Raised!
              </div>

              <div className="truncate text-xs text-slate-300">
                Your concern was submitted to the Helios Support Desk.
              </div>
            </div>
          </div>
        </div>
      )}

      {profileModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="parent-profile-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setProfileModalOpen(false);
            }
          }}
        >
          <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl md:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-helios-surface-container-high text-sm font-bold text-helios-secondary">
                  {parent ? getInitials(parent.name) : ""}
                </div>
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-helios-secondary">
                    Profile
                  </div>
                  <h2 id="parent-profile-title" className="text-xl font-bold text-helios-primary">
                    {parent?.name ?? "Parent Profile"}
                  </h2>
                </div>
              </div>
              <button type="button" aria-label="Close profile" onClick={() => setProfileModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-helios-muted hover:bg-helios-surface-container">
                <MaterialIcon>close</MaterialIcon>
              </button>
            </div>

            {parent && (
              <>
                <div className="mt-5">
                  <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-helios-secondary">Profile</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ProfileRow label="Parent Name" value={parent.name} />
                    <ProfileRow label="Email" value={parent.email} />
                    <ProfileRow label="Mobile Number" value={parent.phone} />
                    <ProfileRow label="Emergency Contact" value={parent.emergencyPhone || "Not provided"} />
                    <ProfileRow label="Relationship" value={parent.relationship || parent.student.relationship || "Not provided"} />
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-helios-secondary">Student Details</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ProfileRow label="Student Name" value={parent.student.name} />
                    <ProfileRow label="Admission Number" value={parent.student.admissionNumber} />
                    <ProfileRow label="Class / Section" value={`${parent.student.className} ${parent.student.section.replace(/^Section\s*/i, "")}`} />
                    <ProfileRow label="Roll Number" value={parent.student.rollNumber} />
                    <ProfileRow label="House Address" value={parent.student.house} />
                    <ProfileRow label="Mode of Transport" value={parent.student.modeOfTransport || (parent.student.busNumber || parent.student.busRoute ? "School Bus" : "Self Transport")} />
                    <ProfileRow label="Bus Number" value={parent.student.busNumber || "Not applicable"} />
                    <ProfileRow label="Bus Route" value={parent.student.busRoute || "Not applicable"} />
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="logout-title">
          <section className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600">
              <MaterialIcon>logout</MaterialIcon>
            </div>
            <h2 id="logout-title" className="mt-3 text-lg font-bold text-helios-primary">Sign out of Parent Portal?</h2>
            <p className="mt-1 text-sm text-helios-muted">Your account and tickets will remain available when you sign in again.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setLogoutConfirmOpen(false)} className="rounded-xl bg-helios-surface-container py-3 text-sm font-bold text-helios-primary">Cancel</button>
              <button type="button" onClick={logout} className="rounded-xl bg-red-600 py-3 text-sm font-bold text-white">Sign Out</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-helios-surface-low p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-helios-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-helios-primary">{value}</div>
    </div>
  );
}

function TicketSection({
  title,
  tickets,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onEmptyAction,
  onOpen,
  formatDate,
  past = false,
}: {
  title: string;
  tickets: LocalTicket[];
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: string;
  onEmptyAction?: () => void;
  onOpen: (ticketNumber: string) => void;
  formatDate: (value: string) => string;
  past?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-xs font-extrabold uppercase tracking-[0.14em] text-helios-secondary">
        {title}
      </h2>
      {tickets.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-helios-primary">{emptyTitle}</p>
          {emptyDescription && <p className="mt-1 text-sm text-helios-muted">{emptyDescription}</p>}
          {emptyAction && onEmptyAction && (
            <button type="button" onClick={onEmptyAction} className="mt-3 rounded-full bg-helios-orange px-4 py-2 text-xs font-bold text-white">
              {emptyAction}
            </button>
          )}
        </div>
      ) : tickets.map((ticket) => (
        <article key={ticket.ticketNumber} role="button" tabIndex={0} onClick={() => onOpen(ticket.ticketNumber)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(ticket.ticketNumber); } }} className="cursor-pointer rounded-2xl bg-white p-4 shadow-sm transition hover:bg-helios-surface-low md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-helios-surface-high px-2 py-0.5 text-[10px] font-bold text-helios-primary">#{ticket.ticketNumber}</span>
                <span className="text-[10px] text-helios-muted">{ticket.category}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold leading-6 text-helios-primary">{ticket.subject}</h3>
            </div>
            <StatusBadge status={past ? "RESOLVED" : ticket.status} />
          </div>
          {!past && <p className="mt-1 text-sm leading-6 text-helios-muted">{ticket.description}</p>}
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-helios-surface-low p-2.5">
            <span className="truncate text-xs text-helios-muted">{past ? `Resolved on ${formatDate(ticket.updatedAt)}` : `Submitted on ${formatDate(ticket.createdAt)}`}</span>
            {past ? <span className="text-xs font-bold text-emerald-700">Resolved</span> : <span className="shrink-0 text-[10px] font-semibold text-helios-muted">{formatDate(ticket.createdAt)}</span>}
          </div>
          {!past && <ProgressDots status={ticket.status} />}
        </article>
      ))}
    </section>
  );
}
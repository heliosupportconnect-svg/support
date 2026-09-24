"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearLocalAdminSession,
  getAdminAccounts,
  getAdminSession,
  getLocalAdminAccount,
  getLocalAdminAccountById,
  type LocalAdminAccount,
} from "@/lib/client-admin-auth";
import { getLocalParent } from "@/lib/client-auth";
import {
  getTicketParentAccount,
  getTicketStatusLabel,
  isPrimaryVpTicket,
  isSecondaryVpTicket,
  isTicketTakenUpByAdmin,
  loadTickets,
  normalizeClassValue,
  updateLocalTicket,
  type LocalTicket,
} from "@/lib/local-tickets";

type DashboardTab = "active" | "resolved" | "escalated";
type EscalationFilter = "All Escalations" | "Principal" | "Director" | "Both";
type ResolvedByFilter = "All Resolved" | "Resolved by Principal" | "Resolved by Director";
type AdminMonitorView = "vp-primary" | "vp-secondary" | "my-tickets";
type MyTicketTab = "escalated" | "taken-up" | "resolved";

function AdminDashboardLoadingState() {
  return (
    <main className="min-h-screen bg-helios-surface text-helios-text">
      <div className="mx-auto flex min-h-screen max-w-[1440px] items-center justify-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-helios-primary text-white">
            <span className="material-symbols-outlined">support_agent</span>
          </div>
          <p className="mt-4 text-lg font-extrabold text-helios-primary">Loading admin dashboard...</p>
        </div>
      </div>
    </main>
  );
}

type TicketCard = LocalTicket & {
  classNumber: number | null;
  classLabel: string;
  studentName: string;
};

const primaryClassFilters = ["All Classes", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"];
const secondaryClassFilters = ["All Classes", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
const escalationFilters: EscalationFilter[] = ["All Escalations", "Principal", "Director", "Both"];
const resolvedByFilters: ResolvedByFilter[] = ["All Resolved", "Resolved by Principal", "Resolved by Director"];

function extractClassNumber(ticket: LocalTicket): number | null {
  const snapshot = ticket.studentSnapshot ?? ticket.parentSnapshot;
  if (snapshot?.className?.trim()) {
    return normalizeClassValue(snapshot.className);
  }

  const parent = getTicketParentAccount(ticket) ?? getLocalParent();
  if (!parent) return null;
  return normalizeClassValue(parent.student.className);
}

function toTicketCard(ticket: LocalTicket): TicketCard {
  const classNumber = extractClassNumber(ticket);
  const parent = getTicketParentAccount(ticket);

  return {
    ...ticket,
    classNumber,
    classLabel: classNumber !== null ? `Class ${classNumber}` : "Class unavailable",
    studentName: parent?.student?.name ?? "Student unavailable",
  };
}

function matchesClass(ticket: TicketCard, selected: string): boolean {
  if (selected === "All Classes") return true;
  const target = Number(selected.replace("Class ", ""));
  return ticket.classNumber === target;
}

function isTicketEscalated(ticket: TicketCard): boolean {
  const values = ticket.escalatedTo ?? [];
  return values.includes("PRINCIPAL") || values.includes("DIRECTOR");
}

function matchesEscalation(ticket: TicketCard, selected: EscalationFilter): boolean {
  const values = ticket.escalatedTo ?? [];
  if (selected === "All Escalations") return values.length > 0;
  if (selected === "Principal") return values.includes("PRINCIPAL");
  if (selected === "Director") return values.includes("DIRECTOR");
  return values.includes("PRINCIPAL") && values.includes("DIRECTOR");
}

function getResolvedByRole(ticket: TicketCard): "PRINCIPAL" | "DIRECTOR" | null {
  if (!ticket.resolvedBy) return null;

  const account = getLocalAdminAccountById(ticket.resolvedBy);
  if (account?.role === "PRINCIPAL" || account?.role === "DIRECTOR") {
    return account.role;
  }

  return null;
}

function matchesResolvedByFilter(ticket: TicketCard, selected: ResolvedByFilter): boolean {
  if (selected === "All Resolved") return true;

  const role = getResolvedByRole(ticket);
  if (selected === "Resolved by Principal") return role === "PRINCIPAL";
  return role === "DIRECTOR";
}

function getResolvedByBadge(ticket: TicketCard): string | null {
  const role = getResolvedByRole(ticket);
  if (!role) return null;
  return `✓ Resolved by ${role === "PRINCIPAL" ? "Principal" : "Director"}`;
}

function isActiveVpTicket(ticket: TicketCard): boolean {
  return !["RESOLVED", "CLOSED"].includes(ticket.status) && !isTicketEscalated(ticket);
}

function isEscalatedVpTicket(ticket: TicketCard): boolean {
  return !["RESOLVED", "CLOSED"].includes(ticket.status) && isTicketEscalated(ticket);
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("active");
  const [classFilter, setClassFilter] = useState("All Classes");
  const [escalationFilter, setEscalationFilter] = useState<EscalationFilter>("All Escalations");
  const [resolvedByFilter, setResolvedByFilter] = useState<ResolvedByFilter>("All Resolved");
  const [monitoringView, setMonitoringView] = useState<AdminMonitorView>("vp-primary");
  const [myTicketTab, setMyTicketTab] = useState<MyTicketTab>("escalated");
  const [monitoringClassFilter, setMonitoringClassFilter] = useState("All Classes");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(mountTimer);
  }, []);

  const [adminId, setAdminId] = useState("");
  const [role, setRole] = useState<LocalAdminAccount["role"] | "">("");

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const syncAdminState = async () => {
      const current = await getAdminSession();
      if (!current) {
        setAdminId("");
        setRole("");
        router.replace("/");
        return;
      }

      void getAdminAccounts();
      setAdminId(current.session.adminId);
      setRole(current.account.role);
    };

    void syncAdminState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "helios_parent_tickets" || event.key === "helios_admin_session" || event.key === "helios_admin_accounts") {
        void syncAdminState();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [mounted, router]);

  const session = adminId && role ? { adminId, role } : null;
  const account = mounted && adminId ? getLocalAdminAccount() : null;

  useEffect(() => {
    if (!mounted || !adminId || !role) {
      return;
    }

    const refreshTickets = async () => {
      try {
        setTickets(await loadTickets());
      } catch {
        setTickets([]);
      }
    };

    void refreshTickets();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "helios_parent_tickets" || event.key === "helios_admin_session" || event.key === "helios_admin_accounts") {
        refreshTickets();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [adminId, mounted, role]);

  const primaryTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => isPrimaryVpTicket(ticket))
        .map(toTicketCard)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    [tickets]
  );

  const secondaryTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => isSecondaryVpTicket(ticket))
        .map(toTicketCard)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    [tickets]
  );

  const escalatedToMe = useMemo(() => {
    if (!session || !account) return [] as TicketCard[];

    return tickets
      .filter(
        (ticket) =>
          !(ticket.status === "RESOLVED" || ticket.status === "CLOSED") &&
          (ticket.escalatedTo ?? []).includes(session.role) &&
          !isTicketTakenUpByAdmin(ticket, account.id)
      )
      .map(toTicketCard)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }, [account, session, tickets]);

  const takenUpByMe = useMemo(() => {
    if (!session || !account) return [] as TicketCard[];

    return tickets
      .filter(
        (ticket) =>
          !(ticket.status === "RESOLVED" || ticket.status === "CLOSED") &&
          isTicketTakenUpByAdmin(ticket, account.id)
      )
      .map(toTicketCard)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }, [account, session, tickets]);

  const resolvedByMe = useMemo(() => {
    if (!account) return [] as TicketCard[];

    return tickets
      .filter((ticket) => ticket.status === "RESOLVED" && ticket.resolvedBy === account.id)
      .map(toTicketCard)
      .sort((first, second) => (second.resolvedAt ?? "").localeCompare(first.resolvedAt ?? ""));
  }, [account, tickets]);

  function logout() {
    clearLocalAdminSession();
    router.replace("/");
  }

  async function resolveCase(ticket: LocalTicket) {
    if (!account || !session) return;

    const now = new Date().toISOString();
    updateLocalTicket(ticket.ticketNumber, {
      status: "RESOLVED",
      resolvedBy: account.id,
      resolvedAt: now,
      activities: [
        ...ticket.activities,
        {
          title: "Ticket Resolved",
          description: `${account.name} resolved this ticket.`,
          createdAt: now,
          actor: `${account.name} (${session.role})`,
        },
      ],
    });

    setTickets(await loadTickets());
  }

  if (!mounted) {
    return <AdminDashboardLoadingState />;
  }

  if (!session || !account) {
    return <AdminDashboardLoadingState />;
  }

  if (session.role === "VP_PRIMARY") {
    const activeTickets = primaryTickets.filter(isActiveVpTicket);
    const resolvedTickets = primaryTickets.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status));
    const escalatedTickets = primaryTickets.filter(isEscalatedVpTicket);
    const visibleActive = activeTickets.filter((ticket) => matchesClass(ticket, classFilter));
    const visibleResolved = resolvedTickets.filter((ticket) => matchesClass(ticket, classFilter) && matchesResolvedByFilter(ticket, resolvedByFilter));
    const visibleEscalated = escalatedTickets.filter((ticket) => matchesClass(ticket, classFilter) && matchesEscalation(ticket, escalationFilter));

    return renderVpDashboard({
      title: "Primary VP Dashboard",
      account,
      menuOpen,
      setMenuOpen,
      logout,
      dashboardTab,
      setDashboardTab,
      classFilter,
      setClassFilter,
      escalationFilter,
      setEscalationFilter,
      resolvedByFilter,
      setResolvedByFilter,
      visibleActive,
      visibleResolved,
      visibleEscalated,
      classFilters: primaryClassFilters,
      router,
      ticketScopeLabel: "Primary Class Filters",
      isPrimary: true,
    });
  }

  if (session.role === "VP_SECONDARY") {
    const activeTickets = secondaryTickets.filter(isActiveVpTicket);
    const resolvedTickets = secondaryTickets.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status));
    const escalatedTickets = secondaryTickets.filter(isEscalatedVpTicket);
    const visibleActive = activeTickets.filter((ticket) => matchesClass(ticket, classFilter));
    const visibleResolved = resolvedTickets.filter((ticket) => matchesClass(ticket, classFilter) && matchesResolvedByFilter(ticket, resolvedByFilter));
    const visibleEscalated = escalatedTickets.filter((ticket) => matchesClass(ticket, classFilter) && matchesEscalation(ticket, escalationFilter));

    return renderVpDashboard({
      title: "Secondary VP Dashboard",
      account,
      menuOpen,
      setMenuOpen,
      logout,
      dashboardTab,
      setDashboardTab,
      classFilter,
      setClassFilter,
      escalationFilter,
      setEscalationFilter,
      resolvedByFilter,
      setResolvedByFilter,
      visibleActive,
      visibleResolved,
      visibleEscalated,
      classFilters: secondaryClassFilters,
      router,
      ticketScopeLabel: "Secondary Class Filters",
      isPrimary: false,
    });
  }

  if (session.role === "PRINCIPAL" || session.role === "DIRECTOR") {
    const currentPrimaryView = primaryTickets.filter((ticket) => matchesClass(ticket, monitoringClassFilter));
    const currentSecondaryView = secondaryTickets.filter((ticket) => matchesClass(ticket, monitoringClassFilter));
    const myQueue = myTicketTab === "escalated" ? escalatedToMe : myTicketTab === "taken-up" ? takenUpByMe : resolvedByMe;

    return (
      <main className="min-h-screen bg-helios-surface text-helios-text">
        <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 md:min-h-[72px] md:px-8 lg:px-10">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-helios-primary text-white">
                <span className="material-symbols-outlined">support_agent</span>
              </div>
              <div>
                <div className="text-base font-extrabold text-helios-primary">Helios Admin</div>
                <div className="text-[11px] font-semibold text-helios-muted">{session.role === "PRINCIPAL" ? "Principal Dashboard" : "Director Dashboard"}</div>
              </div>
            </div>

            <div className="relative">
              <button type="button" aria-label="Admin Profile Menu" onClick={() => setMenuOpen((value) => !value)} className="flex items-center gap-1 rounded-full bg-helios-surface-container-high p-1">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-helios-primary-container text-xs font-bold text-white">
                  {account.name.split(" ").slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A"}
                </span>
                <span className="material-symbols-outlined text-[18px] text-helios-muted">expand_more</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-11 z-50 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold text-helios-primary">Admin Portal</div>
                  <Link href="/admin/profile" className="block px-3 py-2.5 text-xs font-semibold text-helios-primary hover:bg-slate-50">Profile</Link>
                  <button type="button" onClick={logout} className="w-full border-t border-slate-100 px-3 py-2.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50">Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-4 md:px-8 lg:px-10">
          <nav className="grid grid-cols-2 gap-2 rounded-2xl bg-helios-surface-container p-1.5 shadow-inner md:grid-cols-4">
            {[
              { key: "vp-primary", label: "VP Primary" },
              { key: "vp-secondary", label: "VP Secondary" },
              { key: "my-tickets", label: "My Tickets" },
              { key: "dashboard-updates", label: "Dashboard Updates" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === "dashboard-updates") {
                    router.push("/admin/carousel");
                    return;
                  }

                  setMonitoringView(item.key as AdminMonitorView);
                }}
                className={`rounded-xl px-3 py-2 text-center text-xs font-bold md:text-sm ${
                  item.key === "dashboard-updates"
                    ? monitoringView === "my-tickets"
                      ? "bg-white text-helios-primary shadow-sm"
                      : "text-helios-muted"
                    : monitoringView === item.key
                      ? "bg-white text-helios-primary shadow-sm"
                      : "text-helios-muted"
                }`}
              >
                <span className="block">{item.label}</span>
              </button>
            ))}
          </nav>

          {monitoringView === "vp-primary" && (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-helios-muted">VP Primary Monitoring</span>
              </div>

              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {primaryClassFilters.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMonitoringClassFilter(item)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${monitoringClassFilter === item ? "bg-helios-primary text-white" : "border border-slate-200 bg-white text-helios-muted"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-2 rounded-2xl bg-helios-surface-container p-1.5 md:grid-cols-2">
                {[
                  { key: "active", label: "Active Tickets", count: currentPrimaryView.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length },
                  { key: "resolved", label: "Resolved Tickets", count: currentPrimaryView.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status)).length },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDashboardTab(item.key as DashboardTab)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${dashboardTab === item.key ? "bg-white text-helios-primary shadow-sm" : "text-helios-muted"}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{item.label}</span>
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {item.count}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {dashboardTab === "active" && (
                <section className="mt-4 space-y-3">
                  {currentPrimaryView.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                      <span className="material-symbols-outlined text-4xl text-slate-400">inbox</span>
                      <p className="mt-3 text-lg font-bold text-helios-primary">No active tickets</p>
                      <p className="mt-2 text-sm text-helios-muted">No active tickets are available for Primary VP monitoring.</p>
                    </div>
                  ) : (
                    currentPrimaryView.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).map((ticket) => (
                      <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                            </div>
                            <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{getTicketStatusLabel(ticket.status)}</span>
                        </div>
                        <p className="mt-3 text-sm text-helios-muted">{ticket.description}</p>
                        <div className="mt-4 flex items-center justify-end">
                          <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">View Details</button>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              )}

              {dashboardTab === "resolved" && (
                <section className="mt-4 space-y-3">
                  {currentPrimaryView.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status)).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                      <span className="material-symbols-outlined text-4xl text-slate-400">check_circle</span>
                      <p className="mt-3 text-lg font-bold text-helios-primary">No resolved tickets</p>
                      <p className="mt-2 text-sm text-helios-muted">No resolved tickets are available for Primary VP monitoring.</p>
                    </div>
                  ) : (
                    currentPrimaryView.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status)).map((ticket) => (
                      <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                            </div>
                            <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">{getTicketStatusLabel(ticket.status)}</span>
                        </div>
                        <p className="mt-3 text-sm text-helios-muted">{ticket.description}</p>
                        <div className="mt-4 flex items-center justify-end">
                          <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">View Details</button>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              )}
            </>
          )}

          {monitoringView === "vp-secondary" && (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-helios-muted">VP Secondary Monitoring</span>
              </div>

              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {secondaryClassFilters.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMonitoringClassFilter(item)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${monitoringClassFilter === item ? "bg-helios-primary text-white" : "border border-slate-200 bg-white text-helios-muted"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-2 rounded-2xl bg-helios-surface-container p-1.5 md:grid-cols-2">
                {[
                  { key: "active", label: "Active Tickets", count: currentSecondaryView.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length },
                  { key: "resolved", label: "Resolved Tickets", count: currentSecondaryView.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status)).length },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDashboardTab(item.key as DashboardTab)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${dashboardTab === item.key ? "bg-white text-helios-primary shadow-sm" : "text-helios-muted"}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{item.label}</span>
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {item.count}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {dashboardTab === "active" && (
                <section className="mt-4 space-y-3">
                  {currentSecondaryView.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                      <span className="material-symbols-outlined text-4xl text-slate-400">inbox</span>
                      <p className="mt-3 text-lg font-bold text-helios-primary">No active tickets</p>
                      <p className="mt-2 text-sm text-helios-muted">No active tickets are available for Secondary VP monitoring.</p>
                    </div>
                  ) : (
                    currentSecondaryView.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).map((ticket) => (
                      <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                            </div>
                            <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{getTicketStatusLabel(ticket.status)}</span>
                        </div>
                        <p className="mt-3 text-sm text-helios-muted">{ticket.description}</p>
                        <div className="mt-4 flex items-center justify-end">
                          <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">View Details</button>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              )}

              {dashboardTab === "resolved" && (
                <section className="mt-4 space-y-3">
                  {currentSecondaryView.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status)).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                      <span className="material-symbols-outlined text-4xl text-slate-400">check_circle</span>
                      <p className="mt-3 text-lg font-bold text-helios-primary">No resolved tickets</p>
                      <p className="mt-2 text-sm text-helios-muted">No resolved tickets are available for Secondary VP monitoring.</p>
                    </div>
                  ) : (
                    currentSecondaryView.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status)).map((ticket) => (
                      <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                            </div>
                            <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">{getTicketStatusLabel(ticket.status)}</span>
                        </div>
                        <p className="mt-3 text-sm text-helios-muted">{ticket.description}</p>
                        <div className="mt-4 flex items-center justify-end">
                          <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">View Details</button>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              )}
            </>
          )}

          {monitoringView === "my-tickets" && (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-helios-muted">My Tickets</span>
              </div>

              <div className="mt-2 grid gap-2 rounded-2xl bg-helios-surface-container p-1.5 md:grid-cols-3">
                {[
                  { key: "escalated", label: "Escalated to Me", count: escalatedToMe.length },
                  { key: "taken-up", label: "Taken Up", count: takenUpByMe.length },
                  { key: "resolved", label: "Resolved by Me", count: resolvedByMe.length },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMyTicketTab(item.key as MyTicketTab)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${myTicketTab === item.key ? "bg-white text-helios-primary shadow-sm" : "text-helios-muted"}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{item.label}</span>
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {item.count}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <section className="mt-4 space-y-3">
                {myQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                    <span className="material-symbols-outlined text-4xl text-slate-400">assignment_turned_in</span>
                    <p className="mt-3 text-lg font-bold text-helios-primary">No tickets in this queue</p>
                    <p className="mt-2 text-sm text-helios-muted">This work queue is empty for the current admin account.</p>
                  </div>
                ) : (
                  myQueue.map((ticket) => (
                    <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.category}</span>
                          </div>
                          <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">{ticket.priority}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{getTicketStatusLabel(ticket.status)}</span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-helios-muted md:grid-cols-3">
                        <div><span className="font-bold text-helios-primary">Student:</span> {ticket.studentName}</div>
                        <div><span className="font-bold text-helios-primary">Class:</span> {ticket.classLabel}</div>
                        <div><span className="font-bold text-helios-primary">Created:</span> {new Date(ticket.createdAt).toLocaleDateString("en-IN")}</div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">View Details</button>
                      </div>
                    </article>
                  ))
                )}
              </section>
            </>
          )}
        </div>
      </main>
    );
  }

  return null;
}

function renderVpDashboard({
  title,
  account,
  menuOpen,
  setMenuOpen,
  logout,
  dashboardTab,
  setDashboardTab,
  classFilter,
  setClassFilter,
  escalationFilter,
  setEscalationFilter,
  resolvedByFilter,
  setResolvedByFilter,
  visibleActive,
  visibleResolved,
  visibleEscalated,
  classFilters,
  router,
  ticketScopeLabel,
  isPrimary,
}: {
  title: string;
  account: LocalAdminAccount;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  logout: () => void;
  dashboardTab: DashboardTab;
  setDashboardTab: (value: DashboardTab) => void;
  classFilter: string;
  setClassFilter: (value: string) => void;
  escalationFilter: EscalationFilter;
  setEscalationFilter: (value: EscalationFilter) => void;
  resolvedByFilter: ResolvedByFilter;
  setResolvedByFilter: (value: ResolvedByFilter) => void;
  visibleActive: TicketCard[];
  visibleResolved: TicketCard[];
  visibleEscalated: TicketCard[];
  classFilters: string[];
  router: ReturnType<typeof useRouter>;
  ticketScopeLabel: string;
  isPrimary: boolean;
}) {
  return (
    <main className="min-h-screen bg-helios-surface text-helios-text">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 md:min-h-[72px] md:px-8 lg:px-10">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-helios-primary text-white">
              <span className="material-symbols-outlined">support_agent</span>
            </div>
            <div>
              <div className="text-base font-extrabold text-helios-primary">Helios Admin</div>
              <div className="text-[11px] font-semibold text-helios-muted">{title}</div>
            </div>
          </div>

          <div className="relative">
            <button type="button" aria-label="Admin Profile Menu" onClick={() => setMenuOpen((value) => !value)} className="flex items-center gap-1 rounded-full bg-helios-surface-container-high p-1">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-helios-primary-container text-xs font-bold text-white">
                {account.name.split(" ").slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A"}
              </span>
              <span className="material-symbols-outlined text-[18px] text-helios-muted">expand_more</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-11 z-50 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold text-helios-primary">Admin Portal</div>
                <Link href="/admin/profile" className="block px-3 py-2.5 text-xs font-semibold text-helios-primary hover:bg-slate-50">View Profile</Link>
                <button type="button" onClick={logout} className="w-full border-t border-slate-100 px-3 py-2.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50">Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-4 md:px-8 lg:px-10">
        <nav className="grid grid-cols-2 gap-2 rounded-2xl bg-helios-surface-container p-1.5 shadow-inner md:grid-cols-3">
          {[
            { key: "active", label: "Active Tickets", count: visibleActive.length },
            { key: "resolved", label: "Resolved Tickets", count: visibleResolved.length },
            { key: "escalated", label: "Escalated Tickets", count: visibleEscalated.length },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDashboardTab(item.key as DashboardTab)}
              className={`rounded-xl px-3 py-2 text-center text-xs font-bold md:text-sm ${dashboardTab === item.key ? "bg-white text-helios-primary shadow-sm" : "text-helios-muted"}`}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <span>{item.label}</span>
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {item.count}
                </span>
              </span>
            </button>
          ))}
        </nav>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-helios-muted">{ticketScopeLabel}</span>
          <Link href="/admin/profile" className="text-[11px] font-bold text-helios-primary">View Profile</Link>
        </div>

        {(dashboardTab === "active" || dashboardTab === "resolved") && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {classFilters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setClassFilter(item)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${classFilter === item ? "bg-helios-primary text-white" : "border border-slate-200 bg-white text-helios-muted"}`}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {dashboardTab === "resolved" && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {resolvedByFilters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setResolvedByFilter(item)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${resolvedByFilter === item ? "bg-helios-primary text-white" : "border border-slate-200 bg-white text-helios-muted"}`}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {dashboardTab === "escalated" && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {escalationFilters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setEscalationFilter(item)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${escalationFilter === item ? "bg-helios-primary text-white" : "border border-slate-200 bg-white text-helios-muted"}`}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {dashboardTab === "active" && (
          <section className="mt-4 space-y-3">
            {visibleActive.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                <span className="material-symbols-outlined text-4xl text-slate-400">inbox</span>
                <p className="mt-3 text-lg font-bold text-helios-primary">No active tickets</p>
                <p className="mt-2 text-sm text-helios-muted">All current tickets for your assigned classes have either been escalated or resolved.</p>
              </div>
            ) : (
              visibleActive.map((ticket) => (
                <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">{ticket.priority}</span>
                      </div>
                      <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                      <p className="mt-2 text-sm leading-6 text-helios-muted">{ticket.description}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{getTicketStatusLabel(ticket.status)}</span>
                      <span className="text-[11px] text-helios-muted">{new Date(ticket.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl bg-helios-primary px-3 py-2 text-xs font-bold text-white">Open Ticket</button>
                    <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">View Details</button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {dashboardTab === "resolved" && (
          <section className="mt-4 space-y-3">
            {visibleResolved.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                <span className="material-symbols-outlined text-4xl text-slate-400">check_circle</span>
                <p className="mt-3 text-lg font-bold text-helios-primary">No resolved tickets</p>
                <p className="mt-2 text-sm text-helios-muted">There are currently no resolved tickets in the selected {isPrimary ? "Primary" : "Secondary"} Class view.</p>
              </div>
            ) : (
              visibleResolved.map((ticket) => {
                const resolvedByBadge = getResolvedByBadge(ticket);

                return (
                  <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                        </div>
                        <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">{getTicketStatusLabel(ticket.status)}</span>
                    </div>
                    <p className="mt-3 text-sm text-helios-muted">{ticket.description}</p>
                    {resolvedByBadge && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
                        <span className="material-symbols-outlined text-[12px]">check_circle</span>
                        <span>{resolvedByBadge}</span>
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] text-helios-muted">Resolved: {new Date(ticket.resolvedAt ?? ticket.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                      <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">Open</button>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        )}

        {dashboardTab === "escalated" && (
          <section className="mt-4 space-y-3">
            {visibleEscalated.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                <span className="material-symbols-outlined text-4xl text-slate-400">forward_to_inbox</span>
                <p className="mt-3 text-lg font-bold text-helios-primary">No escalated tickets</p>
                <p className="mt-2 text-sm text-helios-muted">There are currently no escalated cases for your assigned classes.</p>
              </div>
            ) : (
              visibleEscalated.map((ticket) => (
                <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold tracking-wide text-orange-600">#{ticket.ticketNumber}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-helios-primary">{ticket.classLabel}</span>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">{ticket.escalatedTo?.join(" + ") ?? "Escalated"}</span>
                      </div>
                      <h2 className="mt-2 text-base font-extrabold text-helios-primary">{ticket.subject}</h2>
                    </div>
                    <span className="text-[11px] text-helios-muted">{ticket.escalatedAt ? new Date(ticket.escalatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Escalated"}</span>
                  </div>
                  <p className="mt-3 text-sm text-helios-muted">{ticket.description}</p>
                  <div className="mt-4 flex items-center justify-end">
                    <button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-helios-primary">View Details</button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}
      </div>
    </main>
  );
}

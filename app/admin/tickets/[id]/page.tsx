"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearLocalAdminSession, getAdminSession, getLocalAdminAccount } from "@/lib/client-admin-auth";
import { getLocalParent } from "@/lib/client-auth";
import {
  getLocalTicket,
  getTicketClassNumber,
  getTicketParentAccount,
  getTicketStatusLabel,
  updateLocalTicket,
  type LocalTicket,
  type LocalTicketPriority,
  type LocalTicketStatus,
} from "@/lib/local-tickets";

const departments = ["Campus Operations", "Academic Coordinator", "Transport Desk", "Accounts Desk", "IT Support", "Principal Desk"];

function AdminTicketLoadingState() {
  return (
    <main className="min-h-screen bg-[#FAF8FF] text-[#0D2137]">
      <div className="mx-auto flex min-h-screen max-w-[1440px] items-center justify-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#0D2137] text-white">
            <span className="material-symbols-outlined">support_agent</span>
          </div>
          <p className="mt-4 text-lg font-extrabold text-[#0D2137]">Loading admin ticket...</p>
        </div>
      </div>
    </main>
  );
}

function Icon({ children, className = "" }: { children: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{children}</span>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const progressStages = ["Submitted", "In Progress", "Resolved"];

function statusLabel(status: LocalTicketStatus): string {
  return getTicketStatusLabel(status);
}

function getProgressStageIndex(status: LocalTicketStatus): number {
  if (status === "RESOLVED" || status === "CLOSED") return 2;
  if (status === "IN_PROGRESS" || status === "ASSIGNED" || status === "ESCALATED") return 1;
  return 0;
}

function getEscalationSummary(targets?: string[]): string {
  if (!targets || targets.length === 0) return "Not Escalated";

  const uniqueTargets = Array.from(new Set(targets));
  if (uniqueTargets.includes("PRINCIPAL") && uniqueTargets.includes("DIRECTOR")) {
    return "Escalated to Principal & Director";
  }

  if (uniqueTargets.includes("PRINCIPAL")) {
    return "Escalated to Principal";
  }

  if (uniqueTargets.includes("DIRECTOR")) {
    return "Escalated to Director";
  }

  return `Escalated to ${uniqueTargets[0]}`;
}

function isTicketAllowedForRole(ticket: LocalTicket, role: string): boolean {
  const classNumber = getTicketClassNumber(ticket);
  if (role === "VP_PRIMARY") return classNumber !== null && classNumber >= 1 && classNumber <= 5;
  if (role === "VP_SECONDARY") return classNumber !== null && classNumber >= 6 && classNumber <= 10;
  if (role === "PRINCIPAL" || role === "DIRECTOR") return classNumber !== null && classNumber >= 1 && classNumber <= 10;
  return false;
}

export default function AdminTicketDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [mounted, setMounted] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [role, setRole] = useState("");
  const [ticket, setTicket] = useState<LocalTicket | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [status, setStatus] = useState<LocalTicketStatus>("SUBMITTED");
  const [priority, setPriority] = useState<LocalTicketPriority>("NORMAL");
  const [assignedTo, setAssignedTo] = useState("Campus Operations");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [escalationModalOpen, setEscalationModalOpen] = useState(false);
  const [pendingEscalationTarget, setPendingEscalationTarget] = useState<"PRINCIPAL" | "DIRECTOR" | "BOTH">("PRINCIPAL");

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const syncAdminState = async () => {
      const current = await getAdminSession();
      if (!current) {
        setAdminId("");
        setRole("");
        setAuthReady(true);
        return;
      }

      setAdminId(current.session.adminId);
      setRole(current.account.role);
      setAuthReady(true);
    };

    void syncAdminState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "helios_admin_session" || event.key === "helios_admin_accounts") {
        void syncAdminState();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [mounted]);

  const session = authReady && adminId && role ? { adminId, role } : null;

  useEffect(() => {
    if (!mounted || !authReady) {
      return;
    }

    if (!session) {
      router.replace("/");
      return;
    }

    const ticketNumber = decodeURIComponent(params.id ?? "").replace(/^#/, "").toUpperCase();
    let active = true;
    void getLocalTicket(ticketNumber).then((current) => {
      if (!active) return;
      if (!current) {
        setNotFound(true);
        setAccessDenied(false);
        return;
      }

      if (!isTicketAllowedForRole(current, session.role)) {
        setTicket(current);
        setAccessDenied(true);
        return;
      }

      setTicket(current);
      setStatus(current.status);
      setPriority(current.priority);
      setAssignedTo(current.assignedTo ?? "Campus Operations");
      setAccessDenied(false);
    }).catch(() => setNotFound(true));

    return () => { active = false; };
  }, [mounted, params.id, router, adminId, role]);

  async function persist(update: Partial<LocalTicket>, activity?: LocalTicket["activities"][number]) {
    if (!ticket) return;
    const updated = await updateLocalTicket(ticket.ticketNumber, {
      ...update,
      activities: activity ? [...ticket.activities, activity] : ticket.activities,
    });
    if (updated) {
      setTicket(updated);
      setMessage("Changes saved.");
      window.setTimeout(() => setMessage(""), 1800);
    }
  }

  function saveChanges() {
    if (!ticket || !session) return;
    const isVpReadOnlyAfterEscalation = (session.role === "VP_PRIMARY" || session.role === "VP_SECONDARY") && (ticket.escalatedTo ?? []).some((target) => target === "PRINCIPAL" || target === "DIRECTOR");
    if (isVpReadOnlyAfterEscalation) return;

    const actorName = getLocalAdminAccount()?.name ?? session.role;
    const now = new Date().toISOString();
    const nextStatus = status;
    const update: Partial<LocalTicket> = {
      status: nextStatus,
    };

    if (nextStatus === "IN_PROGRESS") {
      const takenUpIds = new Set([...(ticket.takenUpByAdminIds ?? (ticket.takenUpBy ? [ticket.takenUpBy] : [])), session.adminId]);
      update.takenUpBy = ticket.takenUpBy ?? session.adminId;
      update.takenUpAt = ticket.takenUpAt ?? now;
      update.takenUpByAdminIds = Array.from(takenUpIds);
      update.takenUpAtByAdmin = {
        ...(ticket.takenUpAtByAdmin ?? {}),
        [session.adminId]: ticket.takenUpAtByAdmin?.[session.adminId] ?? now,
      };
    }

    if (nextStatus === "RESOLVED") {
      update.resolvedBy = session.adminId;
      update.resolvedAt = now;
    }

    persist(
      update,
      {
        title: nextStatus === "RESOLVED" ? "Ticket Resolved" : nextStatus === "IN_PROGRESS" ? "Ticket Taken Up" : "Ticket Updated",
        description:
          nextStatus === "RESOLVED"
            ? `Ticket marked as resolved by ${actorName}.`
            : nextStatus === "IN_PROGRESS"
              ? `Ticket taken up by ${actorName}.`
              : "Admin updated the ticket status.",
        createdAt: now,
        actor: actorName,
      }
    );
  }

  function confirmEscalation(target: "PRINCIPAL" | "DIRECTOR" | "BOTH") {
    setPendingEscalationTarget(target);
    setEscalationModalOpen(true);
  }

  function escalateTicket() {
    if (!ticket || !session) return;
    if (session.role !== "VP_PRIMARY" && session.role !== "VP_SECONDARY") {
      setEscalationModalOpen(false);
      return;
    }

    const isVpReadOnlyAfterEscalation = (session.role === "VP_PRIMARY" || session.role === "VP_SECONDARY") && (ticket.escalatedTo ?? []).some((target) => target === "PRINCIPAL" || target === "DIRECTOR");
    if (isVpReadOnlyAfterEscalation) {
      setEscalationModalOpen(false);
      return;
    }

    const targets =
      pendingEscalationTarget === "PRINCIPAL"
        ? ["PRINCIPAL"]
        : pendingEscalationTarget === "DIRECTOR"
          ? ["DIRECTOR"]
          : ["PRINCIPAL", "DIRECTOR"];

    const uniqueTargets = Array.from(new Set([...(ticket.escalatedTo ?? []), ...targets]));
    const now = new Date().toISOString();
    const actorName = getLocalAdminAccount()?.name ?? session.role;

    persist(
      { status: "IN_PROGRESS", escalatedTo: uniqueTargets, escalatedAt: now },
      {
        title: "Ticket Escalated",
        description: `Ticket escalated to ${uniqueTargets.join(" and ")}.`,
        createdAt: now,
        actor: actorName,
      }
    );
    setStatus("IN_PROGRESS");
    setEscalationModalOpen(false);
  }

  function addNote() {
    if (!ticket || !note.trim()) return;
    const isVpReadOnlyAfterEscalation = (session?.role === "VP_PRIMARY" || session?.role === "VP_SECONDARY") && (ticket.escalatedTo ?? []).some((target) => target === "PRINCIPAL" || target === "DIRECTOR");
    if (isVpReadOnlyAfterEscalation) return;
    persist(
      {},
      { title: "Internal Note Added", description: note.trim(), createdAt: new Date().toISOString(), actor: getLocalAdminAccount()?.name ?? "Admin Portal" }
    );
    setNote("");
  }

  function logout() {
    clearLocalAdminSession();
    router.replace("/");
  }

  if (!mounted) {
    return <AdminTicketLoadingState />;
  }

  if (!session) {
    return <AdminTicketLoadingState />;
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-[#FAF8FF] p-6">
        <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <Icon className="text-5xl text-orange-500">search_off</Icon>
          <h1 className="mt-3 text-xl font-bold text-helios-primary">Ticket not found</h1>
          <p className="mt-2 text-sm text-helios-muted">This ticket is not present in the shared local ticket collection.</p>
          <button type="button" onClick={() => router.push("/admin/dashboard")} className="mt-5 rounded-xl bg-helios-primary-container px-5 py-3 text-xs font-bold text-white">Back to Dashboard</button>
        </div>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="min-h-screen bg-[#FAF8FF] p-6">
        <div className="mx-auto mt-20 max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm">
          <Icon className="text-5xl text-orange-500">lock</Icon>
          <h1 className="mt-3 text-xl font-bold text-helios-primary">Access unavailable</h1>
          <p className="mt-2 text-sm text-helios-muted">
            This ticket is outside the current VP class scope and cannot be accessed from the current dashboard.
          </p>
          <button type="button" onClick={() => router.push("/admin/dashboard")} className="mt-5 rounded-xl bg-helios-primary-container px-5 py-3 text-xs font-bold text-white">Back to Dashboard</button>
        </div>
      </main>
    );
  }

  if (!ticket) return <main className="min-h-screen bg-[#FAF8FF]" />;

  const parent = getTicketParentAccount(ticket) ?? getLocalParent();
  const fallbackParentSnapshot = parent ? {
    parentName: parent.name,
    email: parent.email,
    phone: parent.phone,
    emergencyPhone: parent.emergencyPhone,
    relationship: parent.relationship ?? parent.student.relationship,
    studentName: parent.student.name,
    admissionNumber: parent.student.admissionNumber,
    className: parent.student.className,
    section: parent.student.section,
    rollNumber: parent.student.rollNumber,
    house: parent.student.house,
    modeOfTransport: parent.student.modeOfTransport,
    busNumber: parent.student.busNumber,
    busRoute: parent.student.busRoute,
  } : undefined;
  const snapshotParent = ticket.parentSnapshot ?? fallbackParentSnapshot;
  const snapshotStudent = ticket.studentSnapshot ?? fallbackParentSnapshot;
  const student = snapshotStudent ?? fallbackParentSnapshot;
  const escalationSummary = getEscalationSummary(ticket.escalatedTo);
  const currentProgressStage = getProgressStageIndex(ticket.status);
  const isEscalatedTicket = (ticket.escalatedTo ?? []).some((target) => target === "PRINCIPAL" || target === "DIRECTOR");
  const isVpReadOnlyAfterEscalation = (session?.role === "VP_PRIMARY" || session?.role === "VP_SECONDARY") && isEscalatedTicket;
  const canEscalate = (session?.role === "VP_PRIMARY" || session?.role === "VP_SECONDARY") && !isVpReadOnlyAfterEscalation;
  const canTakeThisCase = false;

  return (
    <main className="min-h-screen bg-[#FAF8FF] text-[#0D2137]">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => router.push("/admin/dashboard")} className="grid h-9 w-9 place-items-center rounded-full bg-helios-surface-container"><Icon>arrow_back</Icon></button>
            <div>
              <div className="text-base font-extrabold">Helios Admin <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[9px] text-orange-700">Portal</span></div>
              <div className="text-[11px] text-helios-muted">Ticket Details</div>
            </div>
          </div>
          <button type="button" onClick={logout} className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Logout</button>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-8">
        <div className="grid gap-5 xl:grid-cols-[1.55fr_0.9fr]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-helios-surface-container px-2.5 py-1 text-[10px] font-bold text-orange-600">#{ticket.ticketNumber}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{ticket.category}</span>
                  </div>
                  <h1 className="mt-3 text-xl font-bold md:text-2xl">{ticket.subject}</h1>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">{statusLabel(ticket.status)}</span>
              </div>
              <p className="mt-4 text-sm leading-7 text-helios-muted">{ticket.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-helios-muted">
                <span className="rounded-full bg-helios-surface-container px-3 py-1.5">Created {formatDate(ticket.createdAt)}</span>
                <span className="rounded-full bg-helios-surface-container px-3 py-1.5">Updated {formatDate(ticket.updatedAt)}</span>
                <span className="rounded-full bg-helios-surface-container px-3 py-1.5">Priority {ticket.priority}</span>
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">Ticket Progress</h2>
              <div className="mt-5 flex items-start gap-2 sm:gap-3">
                {progressStages.map((stage, index) => {
                  const complete = index < currentProgressStage;
                  const isCurrent = !complete && index === currentProgressStage;
                  const resolvedStage = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

                  return (
                    <div key={stage} className="relative flex flex-1 items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
                      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm transition-all sm:mx-auto ${
                        resolvedStage || complete
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isCurrent
                            ? "border-orange-400 bg-helios-orange text-white ring-4 ring-orange-100"
                            : "border-slate-200 bg-slate-200 text-slate-500"
                      }`}>
                        {resolvedStage || complete ? "✓" : index + 1}
                      </div>
                      <div className={`text-center text-xs font-semibold sm:text-sm ${
                        resolvedStage || complete
                          ? "text-emerald-700"
                          : isCurrent
                            ? "text-helios-orange"
                            : "text-slate-400"
                      }`}>{stage}</div>
                      {index < progressStages.length - 1 && (
                        <div className={`absolute left-[calc(50%+1rem)] top-4 hidden h-1 w-[calc(100%-2rem)] rounded-full sm:block ${
                          index < currentProgressStage || resolvedStage ? "bg-emerald-400" : isCurrent ? "bg-orange-200" : "bg-slate-200"
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">Student / Parent Profile</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Info label="Student" value={snapshotStudent?.studentName ?? student?.studentName ?? "Unavailable"} />
                <Info label="Class" value={snapshotStudent ? `${snapshotStudent.className} ${snapshotStudent.section}` : (student ? `${student.className} ${student.section}` : "Unavailable")} />
                <Info label="Parent" value={snapshotParent?.parentName ?? parent?.name ?? "Unavailable"} />
                <Info label="Admission" value={snapshotStudent?.admissionNumber ?? student?.admissionNumber ?? ticket.studentId} />
                <Info label="Roll / House" value={snapshotStudent ? `${snapshotStudent.rollNumber} / ${snapshotStudent.house}` : (student ? `${student.rollNumber} / ${student.house}` : "Unavailable")} />
                <Info label="Contact" value={snapshotParent?.phone ?? parent?.phone ?? "Unavailable"} />
                <Info label="Relationship" value={snapshotParent?.relationship ?? parent?.relationship ?? parent?.student.relationship ?? "Unavailable"} />
                <Info label="Email" value={snapshotParent?.email ?? parent?.email ?? "Unavailable"} />
                <Info label="Emergency Contact" value={snapshotParent?.emergencyPhone ?? parent?.emergencyPhone ?? "Unavailable"} />
                <Info label="Mode of Transport" value={snapshotStudent?.modeOfTransport ?? student?.modeOfTransport ?? "Self Transport"} />
                {((snapshotStudent?.modeOfTransport ?? student?.modeOfTransport) === "School Bus") && (
                  <>
                    <Info label="Bus Number" value={snapshotStudent?.busNumber ?? student?.busNumber ?? "Not provided"} />
                    <Info label="Bus Route" value={snapshotStudent?.busRoute ?? student?.busRoute ?? "Not provided"} />
                  </>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">Supporting Attachments</h2>
              {ticket.attachmentNames.length ? (
                <div className="mt-3 space-y-2">{ticket.attachmentNames.map((name) => <div key={name} className="rounded-xl bg-helios-surface-low p-3 text-xs font-semibold">{name}</div>)}</div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-3 text-xs text-helios-muted">No attachments uploaded.</p>
              )}
            </section>

            <section className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold">Activity</h2>
              <div className="mt-4 space-y-3">
                {ticket.activities.map((activity) => (
                  <div key={`${activity.title}-${activity.createdAt}`} className="rounded-xl bg-helios-surface-low p-3">
                    <div className="flex justify-between gap-3">
                      <strong className="text-sm">{activity.title}</strong>
                      <span className="text-[10px] text-slate-500">{formatDate(activity.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-helios-muted">{activity.description}</p>
                    <span className="text-[10px] font-semibold text-slate-500">{activity.actor ?? "Parent Portal"}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[24px] bg-helios-primary p-5 text-white shadow-sm">
              <h2 className="text-base font-bold">Case Actions</h2>

              {isVpReadOnlyAfterEscalation ? (
                <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-3 text-sm text-slate-100">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">Escalation</div>
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100">{escalationSummary}</div>
                  <p className="mt-3 text-sm text-slate-100">This ticket has been escalated and is now with the higher authority.</p>
                </div>
              ) : (
                <>
                  <label className="mt-4 block text-[11px] font-bold uppercase text-slate-300">Status
                    <select value={status} onChange={(event) => setStatus(event.target.value as LocalTicketStatus)} className="mt-1 w-full rounded-xl bg-white p-2.5 text-sm text-slate-900">
                      <option value="SUBMITTED">Submitted</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="RESOLVED">Resolved</option>
                    </select>
                  </label>

                  <button type="button" onClick={saveChanges} className="mt-4 w-full rounded-xl bg-helios-orange py-3 text-sm font-bold">Save Changes</button>

                  {canEscalate && (
                    <>
                      <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">Escalation</div>
                        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100">{escalationSummary}</div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <button type="button" onClick={() => confirmEscalation("PRINCIPAL")} className="rounded-xl bg-rose-500 px-2 py-2 text-[11px] font-bold text-white">Escalate to Principal</button>
                        <button type="button" onClick={() => confirmEscalation("DIRECTOR")} className="rounded-xl bg-amber-500 px-2 py-2 text-[11px] font-bold text-slate-900">Escalate to Director</button>
                        <button type="button" onClick={() => confirmEscalation("BOTH")} className="rounded-xl bg-violet-500 px-2 py-2 text-[11px] font-bold text-white">Escalate to Both</button>
                      </div>
                    </>
                  )}

                  {message && <div className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-900">{message}</div>}

                  <div className="mt-4 rounded-2xl border border-white/20 bg-white/5 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">Internal Note</div>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Add internal note..." className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/10 p-2.5 text-xs text-white placeholder:text-slate-300" />
                    <button type="button" onClick={addNote} className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-xs font-bold text-helios-primary">Add Note</button>
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>

      {escalationModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-lg font-extrabold text-helios-primary">Confirm escalation</div>
              <button type="button" onClick={() => setEscalationModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">✕</button>
            </div>

            <p className="mt-4 text-sm text-helios-muted whitespace-pre-line">
              {pendingEscalationTarget === "PRINCIPAL" && "Are you sure you want to escalate this ticket to the Principal?"}
              {pendingEscalationTarget === "DIRECTOR" && "Are you sure you want to escalate this ticket to the Director?"}
              {pendingEscalationTarget === "BOTH" && "Are you sure you want to escalate this ticket to both the Principal and Director?"}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEscalationModalOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
              <button type="button" onClick={escalateTicket} className="rounded-xl bg-helios-primary px-4 py-2 text-xs font-bold text-white">
                {pendingEscalationTarget === "BOTH" ? "Escalate to Both" : "Escalate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-helios-surface-low p-3">
      <div className="text-[10px] uppercase tracking-wide text-helios-muted">{label}</div>
      <div className="mt-2 text-sm font-bold">{value}</div>
    </div>
  );
}
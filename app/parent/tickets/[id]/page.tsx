"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getParentSession, type LocalParentAccount } from "@/lib/client-auth";
import { getLocalTicketForParent, getTicketStatusLabel, replyToLocalTicket, type LocalTicket } from "@/lib/local-tickets";

const stages = ["Submitted", "In Progress", "Resolved"];
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function getInitials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join(""); }
function stageIndex(status: LocalTicket["status"]) { return status === "RESOLVED" || status === "CLOSED" ? 2 : status === "IN_PROGRESS" || status === "ASSIGNED" || status === "ESCALATED" ? 1 : 0; }
function visibleStatus(status: LocalTicket["status"]) { return getTicketStatusLabel(status); }

export default function ParentTicketDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [parent, setParent] = useState<LocalParentAccount | null>(null);
  const [ticket, setTicket] = useState<LocalTicket | null>(null);
  const [ready, setReady] = useState(false);
  const [reply, setReply] = useState("");
  const [replyMessage, setReplyMessage] = useState("");

  useEffect(() => {
    let active = true;
    const ticketNumber = decodeURIComponent(params.id ?? "").replace(/^#/, "");
    void Promise.resolve().then(() => {
      if (!active) return null;
      setParent(null);
      setTicket(null);
      return getParentSession(true);
    }).then(async (current) => {
      if (!active) return;
      if (!current) { router.replace("/login"); return; }
      setParent(current.parent);
      setTicket(await getLocalTicketForParent(ticketNumber));
      setReady(true);
    }).catch(() => setReady(true));
    return () => { active = false; };
  }, [params.id, router]);

  if (!ready) return <main className="min-h-screen bg-[#FAF8FF]" />;
  if (!parent || !ticket) return <NotFound router={router} />;
  const snapshotStudent = ticket.studentSnapshot ?? {
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
  };
  const student = {
    name: snapshotStudent.studentName,
    className: snapshotStudent.className,
    section: snapshotStudent.section,
    rollNumber: snapshotStudent.rollNumber,
    house: snapshotStudent.house,
    admissionNumber: snapshotStudent.admissionNumber,
  };
  const currentStage = stageIndex(ticket.status);
  const resolved = currentStage === 2;

  async function sendReply() {
    const currentTicket = ticket;
    const currentParent = parent;
    if (!reply.trim() || !currentTicket || !currentParent) return;
    try {
      const updated = await replyToLocalTicket(currentTicket.ticketNumber, reply.trim());
      if (updated) setTicket(updated);
      setReply("");
      setReplyMessage("Your update has been saved to Neon.");
    } catch (error) {
      setReplyMessage(error instanceof Error ? error.message : "Unable to save your update.");
    }
  }

  return <main className="min-h-screen bg-[#FAF8FF] text-[#131B2E]"><header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 md:px-6"><div className="flex items-center gap-2"><button type="button" onClick={() => router.push("/parent/dashboard")} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#F2F3FF]"><span className="material-symbols-outlined">arrow_back</span></button><div><div className="text-base font-bold text-[#0D2137]">Ticket Details</div><div className="text-[11px] text-slate-500">Helios Support Desk</div></div></div><div className="grid h-9 w-9 place-items-center rounded-full bg-[#FFDBC8] text-xs font-bold text-[#753400]">{getInitials(parent.name)}</div></div></header><div className="mx-auto max-w-[1000px] px-4 py-5 pb-12 md:px-6"><div className="space-y-5">
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#E2E7FF] px-2 py-0.5 text-[10px] font-bold text-[#0D2137]">#{ticket.ticketNumber}</span><span className="text-[11px] text-[#44474D]">{ticket.category}</span></div><h1 className="mt-2 text-xl font-bold text-[#0D2137] md:text-2xl">{ticket.subject}</h1></div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold ${resolved ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{visibleStatus(ticket.status)}</span></div><p className="mt-4 text-sm leading-7 text-[#44474D]">{ticket.description}</p>{ticket.escalatedTo?.length ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Escalated to {ticket.escalatedTo.join(" / ")}</div> : <div className="mt-4 text-xs text-slate-500">Submitted {formatDate(ticket.createdAt)}</div>}</section>
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-[#0D2137]">Ticket Progress</h2><div className="mt-6 flex items-start gap-2 sm:gap-3">{stages.map((stage, index) => { const complete = resolved || index < currentStage; const current = !resolved && index === currentStage; return <div key={stage} className="relative flex flex-1 items-center gap-3 sm:flex-col sm:items-center sm:gap-2"><div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm transition-all sm:mx-auto ${complete ? "border-emerald-500 bg-emerald-500 text-white" : current ? "border-orange-400 bg-helios-orange text-white ring-4 ring-orange-100" : "border-slate-200 bg-slate-200 text-slate-500"}`}>{complete ? "✓" : index + 1}</div><div className={`text-center text-xs font-semibold sm:text-sm ${complete ? "text-emerald-700" : current ? "text-helios-orange" : "text-slate-400"}`}>{stage}</div>{index < 2 && <div className={`absolute left-[calc(50%+1rem)] top-4 hidden h-1 w-[calc(100%-2rem)] rounded-full sm:block ${complete ? "bg-emerald-400" : current ? "bg-orange-200" : "bg-slate-200"}`} />}</div>; })}</div></section>
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-[#0D2137]">Student</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><Info label="Name" value={student.name} /><Info label="Class" value={`${student.className} ${student.section}`} /><Info label="Roll / House" value={`${student.rollNumber} / ${student.house}`} /><Info label="Admission" value={student.admissionNumber} /></div></section>
    {ticket.attachments && ticket.attachments.length > 0 && <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-[#0D2137]">Attachments</h2><div className="mt-3 space-y-2">{ticket.attachments.map((attachment) => <div key={attachment.id} className="flex flex-col gap-2 rounded-xl bg-[#F2F3FF] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="truncate text-xs font-semibold text-[#0D2137]">{attachment.fileName}</div><div className="mt-1 text-[10px] text-slate-500">{attachment.mimeType}</div></div><div className="flex items-center gap-2"><a href={attachment.url ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-[10px] font-bold text-[#0D2137] shadow-sm">View</a><a href={`${attachment.url ?? '#'}?download=1`} download={attachment.fileName} className="inline-flex items-center gap-1 rounded-lg bg-[#FF7A00] px-3 py-2 text-[10px] font-bold text-white shadow-sm">Download</a></div></div>)}</div></section>}
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-[#0D2137]">Add Additional Information</h2><textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} placeholder="Add information for the Helios support team..." className="mt-3 w-full resize-none rounded-xl bg-[#F2F3FF] p-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-orange-200" />{replyMessage && <p className="mt-2 text-xs font-semibold text-emerald-700">{replyMessage}</p>}<button type="button" onClick={() => void sendReply()} className="mt-3 rounded-xl bg-[#FF7A00] px-5 py-3 text-xs font-bold text-white">Send Update</button></section>
  </div></div></main>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#F2F3FF] p-3"><div className="text-[10px] text-[#44474D]">{label}</div><div className="mt-1 text-sm font-bold text-[#0D2137]">{value}</div></div>; }
function NotFound({ router }: { router: ReturnType<typeof useRouter> }) { return <main className="grid min-h-screen place-items-center bg-[#FAF8FF] px-4"><section className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm"><span className="material-symbols-outlined text-4xl text-[#FF7A00]">search_off</span><h1 className="mt-3 text-xl font-bold text-[#0D2137]">Ticket not found</h1><button type="button" onClick={() => router.push("/parent/dashboard")} className="mt-5 rounded-xl bg-[#FF7A00] px-5 py-3 text-xs font-bold text-white">Back to My Tickets</button></section></main>; }

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearLocalAdminSession, getAdminSession } from "@/lib/client-admin-auth";
import { getLocalParent } from "@/lib/client-auth";
import { getTicketStatusLabel, loadTickets, updateLocalTicket, type LocalTicket } from "@/lib/local-tickets";

const activeStatuses = ["IN_PROGRESS"] as const;

export default function AdminTakenPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [filter, setFilter] = useState("All Active");
  const [noteTicket, setNoteTicket] = useState<LocalTicket | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const refresh = async () => {
      try {
        const tickets = await loadTickets();
        setTickets(tickets.filter((ticket) => activeStatuses.includes(ticket.status as typeof activeStatuses[number])));
      } catch {
        setTickets([]);
      }
    };
    let active = true;
    void getAdminSession().then((session) => {
      if (!active || !session) {
        router.replace("/");
        return;
      }
      void refresh();
    });
    void refresh();
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
    };
  }, [router]);

  const visibleTickets = tickets.filter((ticket) => {
    if (filter === "High Priority") return ticket.priority === "HIGH" || ticket.priority === "URGENT";
    if (filter === "Awaiting Action") return ticket.status === "IN_PROGRESS";
    return true;
  });

  async function saveNote() {
    if (!noteTicket || !note.trim()) return;
    const updated = await updateLocalTicket(noteTicket.ticketNumber, { activities: [...noteTicket.activities, { title: "Internal Note Added", description: note.trim(), createdAt: new Date().toISOString(), actor: "Admin Portal" }] });
    if (updated) {
      const tickets = await loadTickets();
      setTickets(tickets.filter((ticket) => activeStatuses.includes(ticket.status as typeof activeStatuses[number])));
    }
    setNote("");
    setNoteTicket(null);
  }

  function logout() { clearLocalAdminSession(); router.replace("/"); }
  const parent = getLocalParent();

  return <main className="min-h-screen bg-[#FAF8FF] text-[#131B2E]"><header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 shadow-sm"><div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between px-4 md:px-6"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#0D2137] text-white"><span className="material-symbols-outlined">support_agent</span></div><div><div className="font-bold text-[#0D2137]">Helios Admin</div><div className="text-[11px] text-slate-500">Taken Up Cases</div></div></div><button type="button" onClick={logout} className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Logout</button></div></header><div className="mx-auto max-w-[1440px] px-4 py-5 md:px-6"><div className="flex gap-1 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => router.push("/admin/dashboard")} className="flex-1 rounded-lg py-2 text-xs font-semibold text-slate-600">Tickets</button><button type="button" className="flex-1 rounded-lg bg-white py-2 text-xs font-bold text-[#0D2137] shadow-sm">Taken Up ({visibleTickets.length})</button><button type="button" onClick={() => router.push("/admin/carousel")} className="flex-1 rounded-lg py-2 text-xs font-semibold text-slate-600">Dashboard Updates</button></div><section className="mt-5"><div className="rounded-2xl bg-[#0D2137] p-5 text-white"><h1 className="text-lg font-bold">My Claimed Cases</h1><p className="mt-1 text-xs text-slate-300">Active parent cases currently assigned for campus resolution.</p></div><div className="mt-4 flex gap-2 overflow-x-auto">{["All Active", "High Priority", "Awaiting Action"].map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${filter === item ? "bg-[#0D2137] text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{item}</button>)}</div>{visibleTickets.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><span className="material-symbols-outlined text-4xl text-slate-400">inbox</span><p className="mt-2 font-semibold text-[#0D2137]">No taken cases yet.</p></div> : <div className="mt-5 grid gap-5 xl:grid-cols-2">{visibleTickets.map((ticket) => <article key={ticket.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-bold text-orange-600">#{ticket.ticketNumber}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{ticket.status.replace("_", " ")}</span></div><h2 className="mt-2 text-base font-bold text-[#0D2137]">{ticket.subject}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{ticket.description}</p><div className="mt-3 rounded-xl bg-[#F2F3FF] p-3 text-xs"><div className="font-bold">{parent?.student.name ?? "Student information unavailable"}</div><div className="mt-1 text-slate-500">Parent: {parent?.name ?? "Parent information unavailable"}</div></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => router.push(`/admin/tickets/${ticket.ticketNumber}`)} className="flex-1 rounded-xl bg-[#0D2137] py-2.5 text-xs font-bold text-white">View Details</button><button type="button" onClick={() => setNoteTicket(ticket)} className="flex-1 rounded-xl bg-[#F2F3FF] py-2.5 text-xs font-bold text-[#0D2137]">Add Note</button></div></article>)}</div>}</section></div>{noteTicket && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><h2 className="font-bold">Internal Note</h2><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} className="mt-3 w-full rounded-xl bg-slate-100 p-3 text-sm" /><div className="mt-3 flex gap-2"><button type="button" onClick={() => setNoteTicket(null)} className="flex-1 rounded-xl bg-slate-100 py-2 text-xs font-bold">Cancel</button><button type="button" onClick={saveNote} className="flex-1 rounded-xl bg-[#0D2137] py-2 text-xs font-bold text-white">Save Note</button></div></div></div>}</main>;
}

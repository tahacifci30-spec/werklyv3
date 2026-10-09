import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RevenueChart } from "@/components/RevenueChart";
import { StatusBadge, btn } from "@/components/ui";
import { OWNER, bookings, conflicts, techLabel } from "@/lib/agenda";
import { requireSession } from "@/lib/auth";
import { PART_LABEL, dayLong, dayShort, todayNl } from "@/lib/dates";
import { daysSince, lastActivity } from "@/lib/metrics";
import { formatEur, formatRange, quoteTotal } from "@/lib/pricing/engine";
import { buckets, outstanding, paidInvoices } from "@/lib/revenue";
import { listAgendaItems, listLeads } from "@/lib/store";
import type { Lead, LeadStatus } from "@/lib/types";
import {
  GROUPS,
  PHASES,
  PHASE_OF,
  QUOTE_REMINDER_DAYS,
  STATUS_LABEL,
  STATUS_ORDER,
  isOpen,
  isOwnerTurn,
  nextAction,
  phaseColor,
  quoteWaitingDays,
  waitingOn,
  type GroupId,
} from "@/lib/workflow";

export const metadata: Metadata = { title: "Aanvragen" };
export const dynamic = "force-dynamic";

type Alert = { id: string; name: string; text: string; tab?: string };

/** Dingen die meteen aandacht vragen: afmeldingen, teruggebelverzoeken, botsingen en offertes zonder akkoord. */
function alerts(leads: Lead[], clashes: ReturnType<typeof conflicts>): Alert[] {
  const out: Alert[] = [];
  for (const l of leads) {
    if (!isOpen(l)) continue;
    const a = l.status === "visit_planned" ? l.appointment : l.status === "install_planned" ? l.install_appointment : undefined;
    if (a?.declined_at) out.push({ id: l.id, name: l.customer.name, text: `${techLabel(a.technician)} kan niet op ${dayShort(a.date)} om ${a.time}.`, tab: "afspraken" });
    const waiting = quoteWaitingDays(l);
    if (waiting !== null && waiting >= QUOTE_REMINDER_DAYS)
      out.push({ id: l.id, name: l.customer.name, text: `Offerte staat al ${waiting} dagen open. Stuur een herinnering.`, tab: "offerte" });
    if (l.proposal?.callback_at && !l.proposal.chosen)
      out.push({ id: l.id, name: l.customer.name, text: "Geen van de voorgestelde momenten past. Bel de klant terug.", tab: "afspraken" });
  }
  for (const { booking: b } of clashes) {
    if (b.appt.declined_at) continue;
    out.push({ id: b.lead.id, name: b.lead.customer.name, text: `${techLabel(b.appt.technician)} is niet beschikbaar op ${dayShort(b.appt.date)}, maar heeft dan een afspraak.`, tab: "afspraken" });
  }
  return out;
}

/** Welke tab van het dossier hoort bij de volgende stap. */
function tabFor(s: LeadStatus) {
  if (s === "quote_review" || s === "quote_sent") return "offerte";
  if (s === "install_done" || s === "invoice_sent") return "factuur";
  if (s === "completed" || s === "rejected") return "overview";
  return "afspraken";
}

/** Het ene gegeven dat bij deze stap telt: het moment, hoe lang het al wacht, of tot wanneer. */
function moment(l: Lead): string {
  if (l.status === "visit_planned" && l.appointment) return `${dayShort(l.appointment.date)} om ${l.appointment.time} met ${techLabel(l.appointment.technician)}`;
  if (l.status === "install_planned" && l.install_appointment) return `${dayShort(l.install_appointment.date)} met ${techLabel(l.install_appointment.technician)}`;
  if (l.status === "new" && l.preferred) return `Klant wil ${dayShort(l.preferred.first.date)}, ${PART_LABEL[l.preferred.first.part]}`;
  if (l.status === "quote_sent") {
    const d = quoteWaitingDays(l) ?? 0;
    return d === 0 ? "Vandaag verstuurd" : `${d} ${d === 1 ? "dag" : "dagen"} geleden verstuurd`;
  }
  if (l.status === "invoice_sent" && l.invoice?.due_date) return `Te betalen vóór ${dayShort(l.invoice.due_date)}`;
  if (l.status === "completed" && l.invoice?.paid_at) return `Betaald op ${dayShort(l.invoice.paid_at.slice(0, 10))}`;
  return `Sinds ${dayShort(lastActivity(l).slice(0, 10))}`;
}

/** Wacht op klant of monteur: per stap in de volgorde van het proces, en binnen een stap wat het eerst aan de beurt is. */
const STEP_TITLE: Partial<Record<LeadStatus, string>> = {
  new: "Klant kiest een moment",
  visit_planned: "Bezoek gepland",
  quote_sent: "Offerte verstuurd",
  install_to_plan: "Klant kiest een moment",
  install_planned: "Installatie gepland",
  invoice_sent: "Wacht op betaling",
};
function waitDate(l: Lead) {
  if (l.status === "visit_planned") return l.appointment?.date ?? "";
  if (l.status === "install_planned") return l.install_appointment?.date ?? "";
  if (l.status === "quote_sent") return l.quote?.sent_at ?? "";
  if (l.status === "invoice_sent") return l.invoice?.due_date ?? "";
  return l.created_at;
}
function byWaitingStep(a: Lead, b: Lead) {
  const step = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  return step !== 0 ? step : waitDate(a).localeCompare(waitDate(b));
}

const amount = (l: Lead) =>
  l.invoice ? formatEur(quoteTotal(l.invoice.items)) : l.quote ? formatEur(quoteTotal(l.quote.items)) : formatRange(l.estimate);

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Amsterdam" }));
  return h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const session = await requireSession("owner");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const today = todayNl();

  const [all, items] = await Promise.all([listLeads(session.company_id), listAgendaItems(session.company_id)]);
  const alertList = alerts(all, conflicts(all, items));

  // Kerncijfers
  const aanU = all.filter(isOwnerTurn).sort((a, b) => lastActivity(a).localeCompare(lastActivity(b)));
  const nieuw = all.filter((l) => l.status === "new");
  const nieuwDezeWeek = all.filter((l) => daysSince(l.created_at) < 7).length;
  const months = buckets(paidInvoices(all), "month");
  const thisMonth = months[months.length - 1];
  const lastMonth = months[months.length - 2];
  const change = lastMonth && lastMonth.total > 0 ? Math.round(((thisMonth.total - lastMonth.total) / lastMonth.total) * 100) : null;
  const open = outstanding(all);
  const openCount = all.filter((l) => l.status === "invoice_sent").length;
  const chart = months.slice(-6);
  const chartMax = Math.max(...chart.map((b) => b.total), 1);

  // Pijplijn: hoeveel lopende klussen per fase
  const active = all.filter(isOpen);
  const pipeline = PHASES.slice(0, 5).map((p) => ({ ...p, count: active.filter((l) => PHASE_OF[l.status] === p.id).length }));

  // Vandaag en daarna
  const todays = all
    .filter(isOpen)
    .flatMap((l) => {
      const out: { lead: Lead; kind: "Bezoek" | "Installatie"; date: string; time: string; tech: string }[] = [];
      if (l.status === "visit_planned" && l.appointment && !l.appointment.declined_at && l.appointment.date <= today)
        out.push({ lead: l, kind: "Bezoek", date: l.appointment.date, time: l.appointment.time, tech: l.appointment.technician });
      if (l.status === "install_planned" && l.install_appointment && !l.install_appointment.declined_at && l.install_appointment.date <= today)
        out.push({ lead: l, kind: "Installatie", date: l.install_appointment.date, time: l.install_appointment.time, tech: l.install_appointment.technician });
      return out;
    })
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const upcoming = [
    ...bookings(all)
      .filter((b) => !b.done && b.lead.status !== "completed" && b.appt.date > today)
      .map((b) => ({ date: b.appt.date, time: b.appt.time, title: b.lead.customer.name, sub: `${b.kind === "visit" ? "Bezoek" : "Installatie"} in ${b.lead.customer.city}`, href: `/dashboard/${b.lead.id}?tab=afspraken` })),
    ...items
      .filter((i) => i.kind === "item" && i.date > today)
      .map((i) => ({ date: i.date, time: i.start ?? "00:00", title: i.title, sub: `Overige, ${techLabel(i.who)}`, href: `/dashboard/agenda?d=${i.date}` })),
  ]
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 2);
  const offToday = items.filter((i) => i.kind === "off" && i.date <= today && (i.date_to ?? i.date) >= today);

  // Alle aanvragen
  const countOf = (g: GroupId) => all.filter((l) => GROUPS.find((x) => x.id === g)!.statuses.includes(l.status)).length;
  const group: GroupId = GROUPS.find((g) => g.id === sp.filter)?.id ?? (countOf("open") > 0 ? "open" : "bezig");
  const current = GROUPS.find((g) => g.id === group)!;
  const matches = (l: Lead) =>
    !q || [l.customer.name, l.customer.postcode, l.customer.city, l.customer.email, l.customer.phone].join(" ").toLowerCase().includes(q);
  const inGroup = all
    .filter((l) => current.statuses.includes(l.status) && matches(l))
    .sort((a, b) =>
      group === "afgerond" ? lastActivity(b).localeCompare(lastActivity(a)) : lastActivity(a).localeCompare(lastActivity(b)),
    );
  const sections =
    group === "afgerond"
      ? [{ title: "", leads: inGroup }]
      : [
          { title: "Aan u", leads: inGroup.filter(isOwnerTurn) },
          { title: "Wacht op klant of monteur", leads: inGroup.filter((l) => !isOwnerTurn(l)).sort(byWaitingStep), grouped: true },
        ].filter((s) => s.leads.length > 0);

  return (
    <AppShell session={session} wide>
      {/* Kop */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            Werkly <span aria-hidden="true">›</span> <span className="font-medium text-foreground">Aanvragen</span>
          </p>
          <h1 className="display-md mt-1 text-4xl">{greeting()}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-medium first-letter:uppercase">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
            </svg>
            <span className="first-letter:uppercase">{dayLong(today)}</span>
          </span>
          <Link href="/dashboard/agenda" className={btn.primary}>Agenda openen</Link>
        </div>
      </div>

      {/* Aandachtspunten, als er iets is */}
      {alertList.length > 0 && (
        <div className="mt-6 rounded-2xl border border-signal/60 bg-signal/15">
          <Link href={`/dashboard/${alertList[0].id}?tab=${alertList[0].tab ?? "overview"}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-signal/10">
            <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-signal text-xs font-bold text-petrol">!</span>
            <span className="min-w-0 flex-1">
              <strong>{alertList[0].name}:</strong> {alertList[0].text}
            </span>
            <span aria-hidden="true" className="text-muted">›</span>
          </Link>
          {alertList.length > 1 && (
            <details className="group border-t border-signal/40">
              <summary className="flex min-h-10 cursor-pointer list-none items-center px-4 text-sm font-medium text-petrol [&::-webkit-details-marker]:hidden">
                Nog {alertList.length - 1} {alertList.length === 2 ? "punt" : "punten"} die aandacht vragen
              </summary>
              <ul className="divide-y divide-signal/30 border-t border-signal/40">
                {alertList.slice(1).map((a, i) => (
                  <li key={a.id + i}>
                    <Link href={`/dashboard/${a.id}?tab=${a.tab ?? "overview"}`} className="block px-4 py-2.5 text-sm hover:bg-signal/10">
                      <strong>{a.name}:</strong> {a.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Kerncijfers */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <a href="#aan-u" className="group flex flex-col justify-between rounded-2xl bg-petrol p-4 text-white sm:p-5 transition-transform duration-100 active:scale-[0.98]">
          <span className="flex items-center justify-between text-sm font-medium text-teal-50/85">
            Aan u
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">›</span>
          </span>
          <span className="tabular mt-2 text-3xl font-semibold tracking-tight sm:mt-4 sm:text-4xl">{aanU.length}</span>
          <span className="mt-1 text-sm text-teal-50/75 sm:mt-3">{aanU.length === 1 ? "taak wacht op u" : "taken wachten op u"}</span>
        </a>
        <Kpi label="Nieuwe aanvragen" value={String(nieuw.length)} href="/dashboard?filter=open#lijst" note={`${nieuwDezeWeek} binnen deze week`} />
        <Kpi
          label="Omzet deze maand"
          value={formatEur(thisMonth.total)}
          href="/dashboard/revenue"
          badge={change === null ? undefined : { text: `${change > 0 ? "+" : ""}${change}%`, good: change >= 0 }}
          note="t.o.v. vorige maand"
        />
        <Kpi label="Nog te ontvangen" value={formatEur(open)} href="/dashboard/revenue/openstaand" note={`${openCount} ${openCount === 1 ? "factuur" : "facturen"} open`} />
      </div>

      {/* Aan u en Vandaag */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section id="aan-u" aria-labelledby="aan-u-title" className="scroll-mt-24 rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <h2 id="aan-u-title" className="text-base font-semibold">Aan u</h2>
            {aanU.length > 6 && <a href="#lijst" className="text-sm font-medium text-brand-strong hover:underline">Alle {aanU.length} bekijken</a>}
          </div>
          {aanU.length === 0 ? (
            <p className="px-5 pb-6 pt-3 text-muted">Niets dat op u wacht. Alles loopt.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {aanU.slice(0, 6).map((l) => {
                const days = daysSince(lastActivity(l));
                return (
                  <li key={l.id}>
                    <Link href={`/dashboard/${l.id}?tab=${tabFor(l.status)}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors duration-100 hover:bg-background active:bg-slate-100">
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: phaseColor(l.status) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{l.customer.name}</span>
                        <span className="block truncate text-sm font-medium text-petrol sm:hidden">{nextAction(l)}</span>
                        <span className="hidden truncate text-sm text-muted sm:block">{l.customer.city}</span>
                      </span>
                      <span className="hidden min-w-0 text-right sm:block">
                        <span className="block text-sm font-medium text-petrol">{nextAction(l)}</span>
                        <span className={`block text-xs ${days >= 3 ? "font-medium text-amber-800" : "text-muted"}`}>
                          {days === 0 ? "Vandaag" : `${days} ${days === 1 ? "dag" : "dagen"} geleden`}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-muted">›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="today" className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="today" className="text-base font-semibold">Vandaag</h2>
            <span className="text-sm text-muted">{todays.length} {todays.length === 1 ? "afspraak" : "afspraken"}</span>
          </div>
          {offToday.length > 0 && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800">
              Niet beschikbaar: {offToday.map((i) => techLabel(i.who).replace(" (eigenaar)", "")).join(", ")}
            </p>
          )}
          {todays.length === 0 ? (
            <p className="mt-3 text-muted">Geen afspraken vandaag.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {todays.map((t) => (
                <li key={t.lead.id + t.kind} className="flex items-center gap-3 rounded-xl bg-background p-3">
                  <span className="tabular w-12 shrink-0 text-lg font-semibold">{t.time}</span>
                  <Link href={`/dashboard/${t.lead.id}?tab=afspraken`} className="min-w-0 flex-1 hover:text-brand-strong">
                    <span className="block truncate font-medium">{t.lead.customer.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {t.kind} met {techLabel(t.tech)}
                      {t.date < today && ", nog niet afgerond"}
                    </span>
                  </Link>
                  {t.tech === OWNER && (
                    <Link href={`/technician/${t.lead.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong active:scale-[0.97]">
                      Afronden
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <>
              <p className="mt-5 text-sm font-medium text-muted">Hierna</p>
              <ul className="mt-2 space-y-1">
                {upcoming.map((u) => (
                  <li key={u.href + u.date + u.time}>
                    <Link href={u.href} className="flex items-baseline gap-3 rounded-lg px-1 py-1.5 hover:bg-background">
                      <span className="w-24 shrink-0 text-sm font-medium first-letter:uppercase">
                        {dayShort(u.date)}
                        {u.time !== "00:00" && <span className="tabular block text-xs font-normal text-muted">{u.time}</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{u.title}</span>
                        <span className="block truncate text-xs text-muted">{u.sub}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Omzet en pijplijn */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section aria-labelledby="omzet-title" className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="omzet-title" className="text-base font-semibold">Omzet per maand</h2>
            <Link href="/dashboard/revenue" className="text-sm font-medium text-brand-strong hover:underline">Alle cijfers</Link>
          </div>
          <div className="mt-2">
            <RevenueChart series={chart} max={chartMax} />
          </div>
        </section>

        <section aria-labelledby="pijplijn-title" className="rounded-2xl border border-line bg-surface p-5">
          <h2 id="pijplijn-title" className="text-base font-semibold">Lopende klussen per fase</h2>
          <p className="mt-1 text-sm text-muted">{active.length} lopend</p>
          <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full bg-background" aria-hidden="true">
            {pipeline.filter((p) => p.count > 0).map((p) => (
              <span key={p.id} className="h-full" style={{ flexGrow: p.count, background: p.color }} />
            ))}
          </div>
          <ul className="mt-5 space-y-2.5">
            {pipeline.map((p) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                <span className="flex-1">{p.label}</span>
                <span className="tabular font-semibold">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Alle aanvragen */}
      <section id="lijst" aria-labelledby="lijst-title" className="mt-4 scroll-mt-24 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 id="lijst-title" className="text-base font-semibold">Alle aanvragen</h2>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Aanvragen per groep" className="flex rounded-xl bg-background p-1 ring-1 ring-inset ring-line">
              {GROUPS.map((g) => {
                const on = g.id === group;
                return (
                  <Link
                    key={g.id}
                    href={`/dashboard?filter=${g.id}${q ? `&q=${encodeURIComponent(q)}` : ""}#lijst`}
                    aria-current={on ? "page" : undefined}
                    className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-100 ${
                      on ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {g.label}
                    <span className="tabular text-xs text-muted">{countOf(g.id)}</span>
                  </Link>
                );
              })}
            </nav>
            <form role="search" action="/dashboard#lijst" className="relative">
              <input type="hidden" name="filter" value={group} />
              <label htmlFor="q" className="sr-only">Zoek op naam, postcode of plaats</label>
              <input
                id="q"
                name="q"
                type="search"
                autoComplete="off"
                defaultValue={sp.q ?? ""}
                placeholder="Zoek naam of plaats"
                className="min-h-11 w-56 rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-slate-500 focus:border-brand"
              />
            </form>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="border-t border-line p-6">
            {q ? (
              <>
                <p className="font-medium">Geen aanvragen gevonden voor &ldquo;{q}&rdquo;.</p>
                <Link href={`/dashboard?filter=${group}#lijst`} className={`${btn.secondary} mt-4`}>Zoekopdracht wissen</Link>
              </>
            ) : (
              <p className="text-muted">Geen aanvragen in deze groep.</p>
            )}
          </div>
        ) : (
          sections.map((s) => (
            <div key={s.title || "alle"}>
              {s.title && (
                <h3 className="border-t border-line bg-background px-5 py-2 text-sm font-semibold text-muted">
                  {s.title} <span className="tabular font-normal">{s.leads.length}</span>
                </h3>
              )}
              <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_8rem_1rem] gap-4 border-t border-line px-5 py-2 text-xs font-medium text-muted md:grid" aria-hidden="true">
                <span>Klant</span>
                <span>Fase</span>
                <span>Volgende stap</span>
                <span className="text-right">Bedrag</span>
                <span />
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {s.leads.map((l, idx) => {
                  const wait = waitingOn(l);
                  const newStep = "grouped" in s && s.grouped && (idx === 0 || s.leads[idx - 1].status !== l.status);
                  return (
                    <li key={l.id}>
                      {newStep && (
                        <p className="flex items-center gap-2 bg-surface px-5 pb-1 pt-4 text-xs font-medium text-muted">
                          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: phaseColor(l.status) }} />
                          {STEP_TITLE[l.status] ?? STATUS_LABEL[l.status]}
                          <span className="tabular grid h-5 min-w-5 place-items-center rounded-md bg-background px-1 text-[11px] font-semibold text-foreground ring-1 ring-inset ring-line">
                            {s.leads.filter((x) => x.status === l.status).length}
                          </span>
                        </p>
                      )}
                      <Link
                        href={`/dashboard/${l.id}?tab=${tabFor(l.status)}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors duration-100 hover:bg-background active:bg-slate-100 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_8rem_1rem]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{l.customer.name}</span>
                          <span className="block truncate text-sm text-muted">{l.customer.city}</span>
                        </span>
                        <span className="justify-self-end md:justify-self-start">
                          <StatusBadge status={l.status} />
                        </span>
                        <span className="col-span-2 min-w-0 md:col-span-1">
                          <span className={`block truncate text-sm font-medium ${wait ? "text-muted" : "text-petrol"}`}>
                            {wait ? `Wacht op ${wait}` : nextAction(l)}
                          </span>
                          <span className="block truncate text-xs text-muted">{moment(l)}</span>
                        </span>
                        <span className="tabular hidden text-right text-sm md:block">{amount(l)}</span>
                        <span aria-hidden="true" className="hidden text-muted md:block">›</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  href,
  note,
  badge,
}: {
  label: string;
  value: string;
  href: string;
  note: string;
  badge?: { text: string; good: boolean };
}) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col justify-between rounded-2xl border border-line bg-surface p-4 sm:p-5 transition-[border-color,transform] duration-100 hover:border-brand/50 active:scale-[0.98]">
      <span className="flex items-center justify-between text-sm font-medium text-muted">
        {label}
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">›</span>
      </span>
      <span className="tabular mt-2 truncate text-xl font-semibold tracking-tight sm:mt-4 sm:text-3xl">{value}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted sm:mt-3 sm:text-sm">
        {badge && (
          <span className={`tabular rounded-md px-1.5 py-0.5 text-xs font-semibold ${badge.good ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
            {badge.text}
          </span>
        )}
        {note}
      </span>
    </Link>
  );
}

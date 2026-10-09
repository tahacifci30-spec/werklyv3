import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addNote,
  generateQuoteNow,
  markPaid,
  planAppointment,
  proposeSlots,
  saveInvoice,
  saveQuote,
  sendInvoice,
  approveAndSend,
  setOutcome,
  reopenQuote,
} from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { ConfirmForm } from "@/components/ConfirmForm";
import { CopyButton } from "@/components/CopyButton";
import { Flash } from "@/components/Flash";
import { AppointmentCard } from "@/components/lead/AppointmentCard";
import { NoteForm } from "@/components/lead/NoteForm";
import { ProposalForm } from "@/components/lead/ProposalForm";
import { QuoteEditor } from "@/components/lead/QuoteEditor";
import { ScheduleForm } from "@/components/lead/ScheduleForm";
import { WorkLink } from "@/components/lead/WorkLink";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, SectionTitle, StatusBadge, btn, dateTimeNl, dayNl } from "@/components/ui";
import { OWNER, availability, blocks, teamNames, techLabel as whoLabel, type Kind } from "@/lib/agenda";
import { requireSession } from "@/lib/auth";
import { PART_LABEL, dayShort, todayNl } from "@/lib/dates";
import type { DayChoice } from "@/lib/types";
import {
  INSTALL_CHECKS,
  INSTALL_PIPE_OPTIONS,
  SOURCE_LABEL,
  SOURCE_STYLE,
  TECH_KEYS,
  TECH_OPTIONS,
  openChecks,
  requestFacts,
  techLabel,
} from "@/lib/dossier";
import { NOTICES } from "@/lib/notices";
import { formatEur, formatRange, quoteTotal } from "@/lib/pricing/engine";
import { getLead, getSettings, listAgendaItems, listLeads } from "@/lib/store";
import type { Lead } from "@/lib/types";
import { durationShort, installDays } from "@/lib/duration";
import { QUOTE_REMINDER_DAYS, nextAction, quoteWaitingDays } from "@/lib/workflow";

export const metadata: Metadata = { title: "Aanvraag" };
export const dynamic = "force-dynamic";

type Tab = "overview" | "customer" | "afspraken" | "offerte" | "factuur" | "log";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; notice?: string }>;
}) {
  const session = await requireSession("owner");
  const { id } = await params;
  const lead = await getLead(id, session.company_id);
  if (!lead) notFound();
  const settings = await getSettings(session.company_id);
  const hd = await headers();
  const origin = `${hd.get("x-forwarded-proto") ?? "http"}://${hd.get("x-forwarded-host") ?? hd.get("host") ?? "localhost:3000"}`;

  const sp = await searchParams;
  const tabs: [Tab, string][] = [
    ["overview", "Overzicht"],
    ["customer", "Klant"],
    ["afspraken", "Afspraken"],
    ...(lead.quote ? ([["offerte", "Offerte"]] as [Tab, string][]) : []),
    ...(lead.invoice ? ([["factuur", "Factuur"]] as [Tab, string][]) : []),
    ["log", "Logboek"],
  ];
  const tab: Tab = tabs.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : "overview";

  const todo = openChecks(lead);
  const facts = requestFacts(lead);
  const base = `/dashboard/${lead.id}`;
  const fullAddress = `${lead.customer.street}, ${lead.customer.postcode} ${lead.customer.city}`;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  const installPhase = ["install_to_plan", "install_planned", "install_done", "invoice_sent", "completed"].includes(lead.status);
  const appt = installPhase ? lead.install_appointment : lead.appointment;

  return (
    <AppShell session={session} wide>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-foreground">
        ← Alle aanvragen
      </Link>

      <div className="mt-1">
        <Flash key={sp.notice} message={sp.notice ? NOTICES[sp.notice] : undefined} />
      </div>

      {/* Kop: wie, status, prijsindicatie, afspraak, volgende actie */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display-md break-words text-4xl">{lead.customer.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <StatusBadge status={lead.status} />
              <span>
                Prijsindicatie <strong className="tabular text-foreground">{formatRange(lead.estimate)}</strong>
              </span>
              {lead.quote && (
                <span>
                  Offerte <strong className="tabular text-foreground">{formatEur(quoteTotal(lead.quote.items))}</strong>
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {installPhase ? "Installatie" : "Bezoek"}{" "}
              <strong className="text-foreground">
                {appt ? `${dayNl(appt.date)} ${appt.time}, ${appt.technician}${installPhase ? `, ${durationShort(installDays(lead))}` : ""}` : installPhase ? `nog niet gepland (duurt ongeveer ${durationShort(installDays(lead))})` : "nog niet gepland"}
              </strong>
            </p>
          </div>
          <div className="w-full rounded-xl bg-brand-soft px-4 py-3 sm:w-auto sm:min-w-64">
            <p className="text-sm font-medium text-brand-strong">Volgende stap</p>
            <p className="mt-0.5 font-semibold">{nextAction(lead)}</p>
            <div className="mt-3">
              <PrimaryAction lead={lead} />
            </div>
          </div>
        </div>
      </div>

      <nav aria-label="Aanvraag" className="-mx-4 mt-5 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-fit sm:overflow-visible sm:rounded-xl sm:bg-background sm:p-1 sm:ring-1 sm:ring-inset sm:ring-line">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`${base}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium ${
              tab === key ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div id="werkvak" data-tab={tab} className="mt-5 scroll-mt-20">
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle>Klant</SectionTitle>
              <Dl rows={[["Naam", lead.customer.name], ["Telefoon", lead.customer.phone], ["E-mail", lead.customer.email], ["Adres", fullAddress]]} />
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">
                Route bekijken ↗
              </a>
            </Card>
            <Card>
              <SectionTitle>Aanvraag</SectionTitle>
              <ul className="space-y-2.5">
                {facts.map((f) => (
                  <li key={f.label} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted">{f.label}</span>
                    <span className="flex min-w-0 flex-col items-end gap-1 text-right">
                      <span className="font-medium">{f.value}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${SOURCE_STYLE[f.source]}`}>
                        {SOURCE_LABEL[f.source]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            {(lead.preferred || lead.install_preferred) && (
              <Card>
                <SectionTitle>Gewenste momenten van de klant</SectionTitle>
                {lead.preferred && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted">Bezoek</p>
                    <PreferredLines lead={lead} />
                  </div>
                )}
                {lead.install_preferred && (
                  <div className={lead.preferred ? "mt-3" : ""}>
                    <p className="mb-1 text-xs font-semibold text-muted">Installatie</p>
                    <PreferredLines lead={lead} kind="install" />
                  </div>
                )}
              </Card>
            )}
            <Card>
              <SectionTitle>{todo.length > 0 && !lead.check.completed_at ? `${todo.length} punten controleren tijdens het bezoek` : "Controle bij het bezoek"}</SectionTitle>
              {lead.check.completed_at ? (
                <p className="text-sm text-emerald-800">Het bezoek is afgerond en de punten zijn gecontroleerd. Zie het tabblad Afspraken.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {todo.map((k) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span>{TECH_OPTIONS[k].label}</span>
                      <span className="text-amber-900">Onbekend</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <SectionTitle>Prijsindicatie</SectionTitle>
              <p className="tabular text-3xl font-semibold">{formatRange(lead.estimate)}</p>
              {lead.estimate.unknownFactors.length > 0 ? (
                <p className="mt-2 text-sm text-muted">
                  Bredere range door onbekend: {lead.estimate.unknownFactors.join(", ")}.
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">Op basis van de antwoorden van de klant.</p>
              )}
            </Card>
            {lead.customer_photos.length > 0 && (
              <Card className="lg:col-span-2">
                <SectionTitle>Foto&apos;s van de klant ({lead.customer_photos.length})</SectionTitle>
                <Photos names={lead.customer_photos} who="de klant" />
              </Card>
            )}
            <Card className="lg:col-span-2">
              <SectionTitle>Interne notities</SectionTitle>
              {lead.notes.length === 0 ? (
                <p className="text-sm text-muted">Nog geen notities. Alleen uw team ziet deze.</p>
              ) : (
                <ul className="space-y-3">
                  {[...lead.notes].reverse().map((n, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="whitespace-pre-line break-words">{n.text}</p>
                      <p className="mt-1 text-xs text-muted">
                        {n.by} · {dateTimeNl(n.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <NoteForm action={addNote.bind(null, lead.id)} />
            </Card>
          </div>
        )}

        {tab === "customer" && (
          <Card>
            <SectionTitle>Klantgegevens</SectionTitle>
            <Dl
              rows={[
                ["Naam", lead.customer.name],
                ["Soort klant", lead.customer.company ? `Zakelijk: ${lead.customer.company} (bedragen excl. btw)` : "Particulier (bedragen incl. btw)"],
                ["Telefoon", lead.customer.phone],
                ["E-mail", lead.customer.email],
                ["Adres", fullAddress],
                ["Aanvraag ontvangen", dateTimeNl(lead.created_at)],
                ["Toestemming gegeven", dateTimeNl(lead.consent_at)],
              ]}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <a className={btn.secondary} href={`tel:${lead.customer.phone.replace(/\s/g, "")}`}>
                Bellen
              </a>
              <a className={btn.secondary} href={`mailto:${lead.customer.email}`}>
                E-mailen
              </a>
              <a className={btn.secondary} href={mapsHref} target="_blank" rel="noopener noreferrer">
                Route ↗
              </a>
            </div>
          </Card>
        )}

        {tab === "afspraken" && <AppointmentsTab lead={lead} companyId={session.company_id} notice={sp.notice} />}

        {tab === "offerte" && lead.quote && (
          <Card>
            <SectionTitle>{lead.status === "quote_review" ? "Conceptofferte" : "Offerte"}</SectionTitle>
            <QuoteEditor
              key={JSON.stringify(lead.quote.items)}
              initial={lead.quote.items}
              editable={lead.status === "quote_review"}
              save={saveQuote.bind(null, lead.id)}
              approve={lead.status === "quote_review" ? approveAndSend.bind(null, lead.id) : undefined}
              recipient={lead.customer.email}
              products={settings.products}
            />
            {lead.status === "quote_sent" && lead.quote.sent_at && <QuoteNextSteps lead={lead} company={settings.company_name} origin={origin} />}
            {lead.quote.sent_at && lead.status !== "quote_sent" && (
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                <Link href={`/offerte/${lead.token}`} target="_blank" className={btn.secondary}>
                  Bekijken als klant ↗
                </Link>
              </div>
            )}
            {lead.status === "install_to_plan" && (
              <div className="mt-5">
                <ConfirmForm
                  action={reopenQuote.bind(null, lead.id)}
                  label="Offerte aanpassen"
                  variant="secondary"
                  question="Offerte aanpassen?"
                  note="Bijvoorbeeld voor extra werk. De huidige versie blijft bewaard. Na het versturen geeft de klant opnieuw akkoord."
                  confirmLabel="Ja, aanpassen"
                />
              </div>
            )}
            {(lead.quote.history?.length ?? 0) > 0 && (
              <p className="mt-4 text-sm text-muted">
                Dit is versie {(lead.quote.history?.length ?? 0) + 1}. Eerdere versies staan in het logboek.
              </p>
            )}
          </Card>
        )}

        {tab === "factuur" && lead.invoice && (
          <Card>
            <SectionTitle>{lead.status === "install_done" ? "Conceptfactuur" : `Factuur ${lead.invoice.number ?? ""}`}</SectionTitle>
            <QuoteEditor
              key={JSON.stringify(lead.invoice.items)}
              kind="factuur"
              initial={lead.invoice.items}
              editable={lead.status === "install_done"}
              save={saveInvoice.bind(null, lead.id)}
              approve={lead.status === "install_done" ? sendInvoice.bind(null, lead.id) : undefined}
              recipient={lead.customer.email}
              products={settings.products}
            />
            {lead.invoice.sent_at && (
              <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
                <p>
                  Verstuurd op {dateTimeNl(lead.invoice.sent_at)}
                  {lead.invoice.due_date && <>, te betalen vóór {dayNl(lead.invoice.due_date)}</>}.
                </p>
                {lead.invoice.paid_at ? (
                  <p className="font-medium text-emerald-800">Betaald op {dateTimeNl(lead.invoice.paid_at)}.</p>
                ) : (
                  <p className="font-medium text-amber-900">Nog niet betaald.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={`/factuur/${lead.token}`} label="Factuurlink kopiëren" />
                  <Link href={`/factuur/${lead.token}`} target="_blank" className={btn.secondary}>
                    Bekijken en opslaan als PDF ↗
                  </Link>
                </div>
                {!lead.invoice.paid_at && (
                  <ConfirmForm
                    action={markPaid.bind(null, lead.id)}
                    label="Betaling ontvangen"
                    question={`Is de betaling van ${formatEur(quoteTotal(lead.invoice.items))} ontvangen?`}
                    note="De aanvraag wordt afgerond en telt mee in de omzet. Dit kan niet worden teruggedraaid."
                    confirmLabel="Ja, betaald"
                  />
                )}
              </div>
            )}
          </Card>
        )}

        {tab === "log" && (
          <Card>
            <SectionTitle>Logboek</SectionTitle>
            <ol className="space-y-4">
              {[...lead.log].reverse().map((e, i) => (
                <li key={i} className="grid gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[8rem_1fr]">
                  <time dateTime={e.at} className="tabular text-muted">
                    {dateTimeNl(e.at)}
                  </time>
                  <span className="break-words">{e.text}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------------ */

function Dl({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Photos({ names, who }: { names: string[]; who: string }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {names.map((p, i) => (
        <li key={p}>
          <a href={`/api/photo/${p}`} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photo/${p}`} alt={`Foto ${i + 1} van ${who}`} width={400} height={400} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function PreferredLines({ lead, kind = "visit" }: { lead: Lead; kind?: Kind }) {
  const choices: [string, DayChoice | undefined][] =
    kind === "visit"
      ? [["1e keuze", lead.preferred?.first], ["Reserve", lead.preferred?.second]]
      : [["Voorkeur", lead.install_preferred]];
  const shown = choices.filter(([, c]) => c) as [string, DayChoice][];
  if (shown.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {shown.map(([label, c]) => (
        <li key={label}>
          <span className="text-muted">{label}: </span>
          <strong>
            {dayShort(c.date)}, {PART_LABEL[c.part]}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function PrimaryAction({ lead }: { lead: Lead }) {
  const base = `/dashboard/${lead.id}`;
  const link = (label: string, tab: string) => (
    // Scrolt altijd naar de offerte, factuur of planning onder de tabs.
    <WorkLink href={`${base}?tab=${tab}`} className={btn.primary}>
      {label}
    </WorkLink>
  );
  switch (lead.status) {
    case "new":
      return link("Bezoek inplannen", "afspraken");
    case "visit_planned":
      if (lead.appointment?.declined_at) return link("Opnieuw inplannen", "afspraken");
      if (lead.appointment?.technician === OWNER)
        return (
          <Link href={`/technician/${lead.id}`} className={btn.primary}>
            Bezoek afronden
          </Link>
        );
      return <p className="text-sm text-muted">De monteur rondt het bezoek af. Wijzigen kan bij Afspraken.</p>;
    case "visit_done":
      return (
        <form action={generateQuoteNow.bind(null, lead.id)}>
          <SubmitButton pendingText="Maken…">Conceptofferte maken</SubmitButton>
        </form>
      );
    case "quote_review":
      return link("Offerte controleren", "offerte");
    case "quote_sent":
      return (
        <div>
          <p className="text-sm text-muted">Heeft de klant telefonisch gereageerd?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={setOutcome.bind(null, lead.id, "accepted")}>
              <button type="submit" className="inline-flex min-h-10 items-center rounded-lg border border-brand/30 bg-surface px-3 text-sm font-semibold text-brand-strong transition-colors duration-100 hover:border-brand hover:bg-brand hover:text-white active:scale-[0.97]">
                Klant is akkoord
              </button>
            </form>
            <form action={setOutcome.bind(null, lead.id, "rejected")}>
              <button type="submit" className="inline-flex min-h-10 items-center rounded-lg border border-red-200 bg-surface px-3 text-sm font-semibold text-red-700 transition-colors duration-100 hover:border-red-700 hover:bg-red-700 hover:text-white active:scale-[0.97]">
                Klant zegt nee
              </button>
            </form>
          </div>
        </div>
      );
    case "install_to_plan":
      return link("Installatie inplannen", "afspraken");
    case "install_planned":
      if (lead.install_appointment?.declined_at) return link("Opnieuw inplannen", "afspraken");
      if (lead.install_appointment?.technician === OWNER)
        return (
          <Link href={`/technician/${lead.id}`} className={btn.primary}>
            Installatie afronden
          </Link>
        );
      return <p className="text-sm text-muted">De monteur rondt de installatie af. Wijzigen kan bij Afspraken.</p>;
    case "install_done":
      return link("Factuur controleren", "factuur");
    case "invoice_sent":
      return link("Factuur bekijken", "factuur");
    default:
      return <p className="text-sm text-muted">Deze aanvraag is afgerond.</p>;
  }
}

async function AppointmentsTab({ lead, companyId, notice }: { lead: Lead; companyId: string; notice?: string }) {
  const kind: Kind | null =
    lead.status === "new" || lead.status === "visit_planned"
      ? "visit"
      : lead.status === "install_to_plan" || lead.status === "install_planned"
        ? "install"
        : null;

  const today = todayNl();
  const [all, items, company] = await Promise.all([listLeads(companyId), listAgendaItems(companyId), getSettings(companyId)]);
  const av = kind ? availability(blocks(all, items, company.team), kind, today, teamNames(company.team), 120, lead.id) : {};
  const current = kind === "visit" ? lead.appointment : kind === "install" ? lead.install_appointment : undefined;
  const planned = !!kind && !!current && !current.declined_at && (lead.status === "visit_planned" || lead.status === "install_planned");

  const prefs: [string, DayChoice | undefined][] =
    kind === "visit"
      ? [["Voorkeur klant", lead.preferred?.first], ["Reserve", lead.preferred?.second]]
      : kind === "install"
        ? [["Voorkeur klant", lead.install_preferred]]
        : [];
  const hints = (prefs.filter(([, c]) => c) as [string, DayChoice][]).map(([label, c]) => ({
    date: c.date,
    label: `${label}: ${dayShort(c.date)}, ${PART_LABEL[c.part]}`,
  }));
  const firstPref = hints[0]?.date;

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const phone = lead.customer.phone.replace(/\s/g, "");

  return (
    <div className="grid gap-4">
      {current?.declined_at && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <strong>{whoLabel(current.technician)} kan niet op {dayShort(current.date)} om {current.time}.</strong> Plan hieronder een
          andere monteur of tijd in, of laat de klant een ander moment kiezen.
        </div>
      )}
      {lead.proposal?.callback_at && !lead.proposal.chosen && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <strong>De klant wil teruggebeld worden.</strong> Geen van de voorgestelde momenten paste.{" "}
          <a className="font-semibold underline" href={`tel:${phone}`}>
            Bel {lead.customer.phone}
          </a>
        </div>
      )}

      {notice === "verplaatst" && current && (
        <ChangeShare lead={lead} what={kind === "install" ? "installatie" : "bezoek"} appt={current} company={company.company_name} />
      )}

      {kind && planned && current && (
        <Card>
          <SectionTitle>{kind === "visit" ? "Bezoek" : "Installatie"}</SectionTitle>
          <AppointmentCard
            title={kind === "visit" ? "Bezoek gepland" : "Installatie gepland"}
            detail={`${dayNl(current.date)} om ${current.time} · ${whoLabel(current.technician)}`}
            celebrate={!!notice && ["ingepland", "installatie_ingepland", "verplaatst"].includes(notice)}
          >
            <ScheduleForm
              action={planAppointment.bind(null, lead.id, kind)}
              kind={kind}
              technicians={teamNames(company.team)}
              availability={av}
              today={today}
              defaults={{ date: current.date, time: current.time, technician: current.technician }}
              hints={hints}
              submitLabel="Wijziging opslaan"
              isChange
              defaultDays={kind === "install" ? installDays(lead) : undefined}
            />
          </AppointmentCard>
          {current.technician === OWNER && (
            <div className="mt-4">
              <Link href={`/technician/${lead.id}`} className={btn.primary}>
                {kind === "visit" ? "Bezoek afronden" : "Installatie afronden"}
              </Link>
            </div>
          )}
        </Card>
      )}

      {kind && !planned && (
        <>
          <Card>
            <SectionTitle>{kind === "visit" ? "Bezoek inplannen" : "Installatie inplannen"}</SectionTitle>
            {hints.length > 0 && (
              <div className="mb-4 rounded-xl bg-brand-soft p-3">
                <p className="mb-1 text-sm font-semibold">De klant heeft een voorkeur opgegeven</p>
                <PreferredLines lead={lead} kind={kind} />
              </div>
            )}
            <ScheduleForm
              action={planAppointment.bind(null, lead.id, kind)}
              kind={kind}
              technicians={teamNames(company.team)}
              availability={av}
              today={today}
              defaults={{ date: firstPref, technician: current?.technician }}
              hints={hints}
              submitLabel={kind === "visit" ? "Bezoek inplannen" : "Installatie inplannen"}
              defaultDays={kind === "install" ? installDays(lead) : undefined}
            />
          </Card>

          <Card>
            <SectionTitle>Past het niet? Laat de klant een ander moment kiezen</SectionTitle>
            <p className="mb-4 text-sm text-muted">
              Kies tot drie vrije momenten in de agenda. De klant ontvangt een link, kiest er één met een tik, en de
              afspraak staat direct ingepland.
            </p>
            <ProposalForm
              action={proposeSlots.bind(null, lead.id, kind)}
              kind={kind}
              technicians={teamNames(company.team)}
              availability={av}
              today={today}
              from={firstPref && firstPref > today ? firstPref : today}
            />
            {lead.proposal && <ProposalShare lead={lead} origin={origin} />}
            <div className="mt-4">
              <a className={btn.secondary} href={`tel:${phone}`}>
                Bel klant: {lead.customer.phone}
              </a>
            </div>
          </Card>
        </>
      )}

      <Card>
        <SectionTitle>Overzicht van afspraken</SectionTitle>
        <ul className="space-y-3 text-sm">
          <ApptLine label="Bezoek" a={lead.appointment} />
          <ApptLine label="Installatie" a={lead.install_appointment} />
        </ul>
      </Card>

      {lead.check.completed_at && (
        <Card>
          <SectionTitle>Uitkomst van het bezoek</SectionTitle>
          <ul className="divide-y divide-line">
            {TECH_KEYS.map((k) => {
              const f = lead.check[k];
              return (
                <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>{TECH_OPTIONS[k].label}</span>
                  <span className="flex items-center gap-2">
                    <strong>{techLabel(k, f.value)}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${SOURCE_STYLE[f.source]}`}>
                      {SOURCE_LABEL[f.source]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {lead.check.notes && <p className="mt-4 whitespace-pre-line break-words rounded-lg bg-slate-50 p-3 text-sm">{lead.check.notes}</p>}
          {lead.check.photos.length > 0 && (
            <div className="mt-4">
              <Photos names={lead.check.photos} who="het bezoek" />
            </div>
          )}
        </Card>
      )}

      {lead.install && (
        <Card>
          <SectionTitle>Installatieverslag</SectionTitle>
          <Dl
            rows={[
              ["Volgens offerte", lead.install.as_quoted === "yes" ? "Ja" : "Nee, er is afgeweken"],
              ["Units geplaatst", lead.install.units],
              ["Leidinglengte", INSTALL_PIPE_OPTIONS.find((o) => o.id === lead.install!.pipe_length)?.label ?? lead.install.pipe_length],
              ["Serienummers", lead.install.serials || "–"],
            ]}
          />
          <ul className="mt-4 space-y-1 text-sm">
            {INSTALL_CHECKS.map((c) => (
              <li key={c.id} className={lead.install!.checks[c.id] ? "text-emerald-800" : "text-amber-900"}>
                {lead.install!.checks[c.id] ? "✓" : "✗"} {c.label}
              </li>
            ))}
          </ul>
          {lead.install.extras.length > 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Meerwerk (staat op de conceptfactuur)</p>
              <ul className="mt-1">
                {lead.install.extras.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="break-words">{e.label}</span>
                    <span className="tabular">{formatEur(e.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lead.install.notes && <p className="mt-4 whitespace-pre-line break-words rounded-lg bg-slate-50 p-3 text-sm">{lead.install.notes}</p>}
          {lead.install.photos.length > 0 && (
            <div className="mt-4">
              <Photos names={lead.install.photos} who="de installatie" />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ApptLine({ label, a }: { label: string; a?: Lead["appointment"] }) {
  return (
    <li className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
      <span className="text-muted">{label}</span>
      {a ? (
        <span className="text-right font-medium">
          {dayNl(a.date)} om {a.time}, {whoLabel(a.technician)}
          {a.declined_at && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800 ring-1 ring-inset ring-red-200">Monteur kan niet</span>}
        </span>
      ) : (
        <span className="text-muted">Nog niet gepland</span>
      )}
    </li>
  );
}

/** Link voor de klant, met knoppen om hem via WhatsApp of e-mail te sturen. */
function ProposalShare({ lead, origin }: { lead: Lead; origin: string }) {
  const p = lead.proposal!;
  const url = `${origin}/afspraak/${lead.token}`;
  const first = lead.customer.name.split(" ")[0];
  const what = p.kind === "visit" ? "het bezoek" : "de installatie";
  const text = `Hallo ${first}, het gewenste moment past helaas niet. Kies hier een ander moment voor ${what}: ${url}`;
  let digits = lead.customer.phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `31${digits.slice(1)}`;

  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
      {p.chosen ? (
        <p className="font-medium text-emerald-800">
          De klant koos {dayShort(p.chosen.date)} om {p.chosen.time}.
        </p>
      ) : p.callback_at ? (
        <p className="font-medium text-red-800">De klant wil teruggebeld worden.</p>
      ) : (
        <p className="font-medium">Wacht op de keuze van de klant. Voorgesteld:</p>
      )}
      <ul className="mt-1 list-inside list-disc text-muted">
        {p.slots.map((s) => (
          <li key={s.date + s.time}>
            {dayShort(s.date)} {p.kind === "install" ? "hele dag" : s.time}, {whoLabel(p.technician)}
          </li>
        ))}
      </ul>
      {!p.chosen && (
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton value={`/afspraak/${lead.token}`} label="Link kopiëren" />
          <a className={btn.secondary} href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
            WhatsApp ↗
          </a>
          <a className={btn.secondary} href={`mailto:${lead.customer.email}?subject=${encodeURIComponent("Een ander moment kiezen")}&body=${encodeURIComponent(text)}`}>
            E-mail
          </a>
        </div>
      )}
    </div>
  );
}

/** Kant-en-klaar bericht aan de klant na het wijzigen van een afspraak. */
function ChangeShare({ lead, what, appt, company }: { lead: Lead; what: string; appt: NonNullable<Lead["appointment"]>; company: string }) {
  const first = lead.customer.name.split(" ")[0];
  const when = `${dayShort(appt.date)} om ${appt.time}`;
  const text = `Hallo ${first}, uw ${what} is gewijzigd. Het nieuwe moment is ${when}. Past dat niet? Laat het ons weten. Groet, ${company}`;
  let digits = lead.customer.phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `31${digits.slice(1)}`;
  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm">
      <p className="font-semibold">Stuur de klant het nieuwe moment</p>
      <p className="mt-2 rounded-lg bg-white p-3 text-slate-700">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className={btn.primary} href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          WhatsApp ↗
        </a>
        <a className={btn.secondary} href={`mailto:${lead.customer.email}?subject=${encodeURIComponent("Uw afspraak is gewijzigd")}&body=${encodeURIComponent(text)}`}>
          E-mail
        </a>
        <CopyButton value={text} label="Tekst kopiëren" />
      </div>
    </div>
  );
}

/** Na het versturen: wat de eigenaar nu zelf doet, met een herinnering als het akkoord uitblijft. */
function QuoteNextSteps({ lead, company, origin }: { lead: Lead; company: string; origin: string }) {
  const days = quoteWaitingDays(lead) ?? 0;
  const late = days >= QUOTE_REMINDER_DAYS;
  const first = lead.customer.name.split(" ")[0];
  const link = `${origin}/offerte/${lead.token}`;
  const sendText = `Hallo ${first}, hierbij de offerte voor uw installatie. U kunt hem bekijken en direct online akkoord geven: ${link} Groet, ${company}`;
  const remindText = `Hallo ${first}, heeft u de offerte al kunnen bekijken? Via deze link geeft u akkoord of stelt u een vraag: ${link} Groet, ${company}`;
  const text = late ? remindText : sendText;
  let digits = lead.customer.phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `31${digits.slice(1)}`;
  return (
    <div className="mt-5 rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm">
      <p className="text-base font-semibold">Wat u nu doet</p>
      <ol className="mt-3 space-y-4">
        <li>
          <p className="font-medium">
            {late ? `Al ${days} dagen geen akkoord. Stuur ${first} een herinnering.` : "Stuur de offerte naar de klant"}
          </p>
          <p className="mt-1 text-muted">
            Verstuurd op {dateTimeNl(lead.quote!.sent_at!)}{days > 0 ? `, ${days} ${days === 1 ? "dag" : "dagen"} geleden` : ""}. Werkly verstuurt nog geen e-mail; deel de link zelf.
          </p>
          <p className="mt-2 rounded-lg bg-white p-3 text-slate-700">{text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className={btn.primary} href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
              WhatsApp ↗
            </a>
            <a className={btn.secondary} href={`mailto:${lead.customer.email}?subject=${encodeURIComponent(late ? "Herinnering: uw offerte" : "Uw offerte")}&body=${encodeURIComponent(text)}`}>
              E-mail
            </a>
            <CopyButton value={`/offerte/${lead.token}`} label="Link kopiëren" />
            <Link href={`/offerte/${lead.token}`} target="_blank" className={btn.secondary}>
              Bekijken als klant ↗
            </Link>
          </div>
        </li>
        {!late && (
          <li>
            <p className="font-medium">Wacht op akkoord</p>
            <p className="mt-1 text-muted">
              Heeft de klant na {QUOTE_REMINDER_DAYS} dagen nog niet gereageerd, dan ziet u een melding op uw overzicht.
            </p>
          </li>
        )}
        <li>
          <p className="font-medium">Vraagt de klant iets extra?</p>
          <p className="mt-1 text-muted">Pas de offerte aan en verstuur hem opnieuw. De huidige versie blijft bewaard.</p>
          <div className="mt-2">
            <ConfirmForm
              action={reopenQuote.bind(null, lead.id)}
              label="Offerte aanpassen"
              variant="secondary"
              question="Offerte aanpassen?"
              note="De link toont de klant pas weer een offerte nadat u hem opnieuw verstuurt."
              confirmLabel="Ja, aanpassen"
            />
          </div>
        </li>
      </ol>
    </div>
  );
}

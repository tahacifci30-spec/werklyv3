"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  INSTALL_MINUTES,
  OWNER,
  VISIT_MINUTES,
  WEEKDAY_NAMES,
  WORKWEEK,
  blocks,
  freeSlots,
  overlaps,
  teamNames,
  toMin,
  worksOn,
  type Kind,
  installDates,
} from "@/lib/agenda";
import { INSTALL_DURATIONS, durationShort } from "@/lib/duration";
import { endSession, requireSession, startSession, verifyLogin } from "@/lib/auth";
import { addDays, dayShort, isDay, isTime, todayNl } from "@/lib/dates";
import { USE_SUPABASE } from "@/lib/defaults";
import { INSTALL_CHECKS, INSTALL_PIPE_OPTIONS, TECH_KEYS, TECH_OPTIONS } from "@/lib/dossier";
import { generateInvoiceItems, generateQuoteItems, quoteTotal } from "@/lib/pricing/engine";
import { PRICE_GROUPS, fromDisplay, setPath } from "@/lib/pricing/fields";
import { DEFAULT_RULES } from "@/lib/pricing/rules";
import {
  deleteAgendaItem,
  getLead,
  getLeadByToken,
  getSettings,
  listAgendaItems,
  listLeads,
  nextInvoiceNumber,
  saveAgendaItem,
  saveLead,
  saveSettings,
} from "@/lib/store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { onlyFiles, saveImages, validateImages } from "@/lib/uploads";
import { UNKNOWN, type AgendaItem, type InstallReport, type Lead, type LeadStatus, type QuoteItem } from "@/lib/types";

export type FormState = { error?: string; ok?: boolean } | undefined;

const stamp = () => new Date().toISOString();

async function owned(id: string, role: "owner" | "technician" = "owner") {
  const session = await requireSession(role);
  const lead = await getLead(id, session.company_id);
  if (!lead) throw new Error("Aanvraag niet gevonden");
  return { lead, session };
}

function move(lead: Lead, status: LeadStatus, text: string) {
  lead.status = status;
  lead.log.push({ at: stamp(), text });
}

function refresh(id: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${id}`);
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/revenue");
  revalidatePath("/technician");
}

/** Alles wat de agenda bezet: afspraken, eigen items en dagen waarop iemand niet kan werken. */
async function allBlocks(companyId: string) {
  const [leads, items, settings] = await Promise.all([listLeads(companyId), listAgendaItems(companyId), getSettings(companyId)]);
  return blocks(leads, items, settings.team);
}

async function team(companyId: string) {
  return (await getSettings(companyId)).team;
}

/** Toont na een actie een korte bevestiging bovenaan de pagina (?notice=code). */
function done(id: string, notice: string, tab?: string): never {
  refresh(id);
  redirect(`/dashboard/${id}?${tab ? `tab=${tab}&` : ""}notice=${notice}`);
}

/* ---------- Inloggen ---------- */

const attempts = new Map<string, number[]>();

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const key = `${ip}|${email}`;
  const recent = (attempts.get(key) ?? []).filter((t) => Date.now() - t < 10 * 60_000);
  if (recent.length >= 5) {
    return { error: "Te veel pogingen. Wacht 10 minuten en probeer het opnieuw." };
  }

  const user = verifyLogin(email, password);
  if (!user) {
    attempts.set(key, [...recent, Date.now()]);
    return { error: "E-mailadres of wachtwoord klopt niet. Probeer het opnieuw." };
  }
  attempts.delete(key);
  await startSession(email);
  redirect(user.role === "owner" ? "/dashboard" : "/technician/agenda");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/* ---------- Afspraken plannen (eigenaar) ---------- */

const PLANNABLE: Record<Kind, LeadStatus[]> = {
  visit: ["new", "visit_planned"],
  install: ["install_to_plan", "install_planned"],
};

export async function planAppointment(
  id: string,
  kind: Kind,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { lead, session } = await owned(id);
  if (!PLANNABLE[kind].includes(lead.status)) return { error: "Voor deze aanvraag kan nu geen afspraak worden ingepland." };

  const date = String(form.get("date") ?? "");
  const time = String(form.get("time_custom") ?? "") || String(form.get("time") ?? "");
  const technician = String(form.get("technician") ?? "");
  if (!isDay(date)) return { error: "Kies een datum." };
  if (date < todayNl()) return { error: "Die datum ligt in het verleden." };
  if (!isTime(time)) return { error: "Kies een tijd uit de lijst, of vul zelf een tijd in." };
  const roster = await team(session.company_id);
  if (!teamNames(roster).includes(technician)) return { error: "Kies een monteur." };
  if (!worksOn(roster, technician, date)) {
    return { error: `${technician} werkt volgens het rooster niet op ${WEEKDAY_NAMES[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]}. Kies een andere dag of pas het rooster aan bij Instellingen.` };
  }

  const days = kind === "install" ? Number(form.get("days")) : 0;
  if (kind === "install" && !(INSTALL_DURATIONS as readonly number[]).includes(days)) return { error: "Kies hoe lang de installatie duurt." };

  const bs = await allBlocks(session.company_id);
  const length = kind === "install" ? (days === 0.5 ? 240 : INSTALL_MINUTES) : VISIT_MINUTES;
  const dates = kind === "install" ? installDates(date, Math.ceil(days)) : [date];
  for (const [i, d] of dates.entries()) {
    if (overlaps(bs, technician, d, i === 0 ? toMin(time) : toMin("08:00"), length, lead.id)) {
      return {
        error:
          i === 0
            ? `${technician} heeft op dat moment al een afspraak. Kies een andere tijd of monteur.`
            : `${technician} is op ${dayShort(d)} (dag ${i + 1} van de installatie) niet vrij. Kies een andere startdag of monteur.`,
      };
    }
    if (!worksOn(roster, technician, d)) return { error: `${technician} werkt niet op ${dayShort(d)} (dag ${i + 1} van de installatie).` };
  }

  const previous = kind === "visit" ? lead.appointment : lead.install_appointment;
  const changed = !!previous && !previous.declined_at;
  const appt = { date, time, technician, ...(kind === "install" ? { days } : {}) };
  if (kind === "visit") {
    lead.appointment = appt;
    move(lead, "visit_planned", `${changed ? "Bezoek verplaatst" : "Bezoek ingepland"} (${dayShort(date)} ${time}, ${technician})`);
  } else {
    lead.install_appointment = appt;
    move(lead, "install_planned", `${changed ? "Installatie verplaatst" : "Installatie ingepland"} (${dayShort(date)} ${time}, ${technician}, ${durationShort(days)})`);
  }
  lead.proposal = undefined;
  await saveLead(lead);
  // Bij een wijziging kan de eigenaar de klant direct een bericht sturen.
  if (changed && form.get("notify") === "on") done(id, "verplaatst", "afspraken");
  done(id, kind === "visit" ? "ingepland" : "installatie_ingepland", "afspraken");
}

/** De eigenaar stelt maximaal drie momenten voor; de klant kiest via een link. */
export async function proposeSlots(
  id: string,
  kind: Kind,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { lead, session } = await owned(id);
  if (!PLANNABLE[kind].includes(lead.status)) return { error: "Voor deze aanvraag kan nu geen voorstel worden gedaan." };

  const technician = String(form.get("technician") ?? "");
  if (!teamNames(await team(session.company_id)).includes(technician)) return { error: "Kies een monteur." };
  const picked = form.getAll("slot").map(String);
  if (picked.length < 1) return { error: "Kies minstens één moment." };
  if (picked.length > 3) return { error: "Kies maximaal drie momenten." };

  const bs = await allBlocks(session.company_id);
  const slots = [];
  for (const p of picked) {
    const [date, time] = p.split("|");
    if (!isDay(date) || !isTime(time) || !freeSlots(bs, technician, date, kind, lead.id).includes(time)) {
      return { error: "Een van de gekozen momenten is niet meer vrij. Kies opnieuw." };
    }
    slots.push({ date, time });
  }
  slots.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  lead.proposal = { kind, technician, slots, created_at: stamp() };
  lead.log.push({ at: stamp(), text: `Voorstel met ${slots.length} moment(en) gemaakt voor de klant` });
  await saveLead(lead);
  refresh(id);
  return { ok: true };
}

/* ---------- Offerte ---------- */

export async function generateQuoteNow(id: string) {
  const { lead, session } = await owned(id);
  if (lead.status !== "visit_done") return;
  const { pricing } = await getSettings(session.company_id);
  lead.quote = { items: generateQuoteItems(lead, pricing), generated_at: stamp() };
  move(lead, "quote_review", "Conceptofferte gemaakt");
  await saveLead(lead);
  done(id, "concept", "offerte");
}

function parseItems(form: FormData): { items: QuoteItem[] } | { error: string } {
  const labels = form.getAll("label").map(String);
  const amounts = form.getAll("amount").map((v) => Number(String(v).replace(",", ".")));
  const items: QuoteItem[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim();
    if (!label && !amounts[i]) continue;
    if (!label) return { error: `Regel ${i + 1} heeft geen omschrijving.` };
    if (!Number.isFinite(amounts[i])) return { error: `Regel ${i + 1} heeft geen geldig bedrag.` };
    items.push({ id: `i${i}${Date.now().toString(36)}`, label, amount: Math.round(amounts[i]) });
  }
  if (items.length === 0) return { error: "Er is minimaal één regel nodig." };
  return { items };
}

export async function saveQuote(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { lead } = await owned(id);
  if (!lead.quote) return { error: "Er is nog geen conceptofferte." };
  if (lead.status !== "quote_review") return { error: "Een verstuurde offerte kan niet meer worden aangepast." };
  const parsed = parseItems(form);
  if ("error" in parsed) return { error: parsed.error };

  lead.quote.items = parsed.items;
  lead.log.push({ at: stamp(), text: "Offerte aangepast" });
  await saveLead(lead);
  refresh(id);
  return { ok: true };
}

export async function approveAndSend(id: string) {
  const { lead } = await owned(id);
  if (lead.status !== "quote_review" || !lead.quote) return;
  lead.quote.reviewed_at = stamp();
  lead.quote.sent_at = stamp();
  lead.log.push({ at: lead.quote.reviewed_at, text: "Offerte gecontroleerd" });
  move(lead, "quote_sent", `Offerte verstuurd naar ${lead.customer.email} (${quoteTotal(lead.quote.items)} euro)`);
  await saveLead(lead);
  done(id, "verstuurd", "offerte");
}

export async function setOutcome(id: string, outcome: "accepted" | "rejected") {
  const { lead } = await owned(id);
  if (lead.status !== "quote_sent") return;
  if (lead.quote) lead.quote.decided_at = stamp();
  if (outcome === "accepted") move(lead, "install_to_plan", "Offerte akkoord, installatie moet worden ingepland");
  else move(lead, "rejected", "Klant heeft de offerte afgewezen");
  await saveLead(lead);
  done(id, outcome === "accepted" ? "akkoord" : "afgewezen", outcome === "accepted" ? "afspraken" : undefined);
}

/**
 * Offerte opnieuw openen om aan te passen, bijvoorbeeld omdat de klant extra werk vraagt.
 * De vorige versie blijft bewaard; na het opnieuw versturen moet de klant opnieuw akkoord geven.
 */
export async function reopenQuote(id: string) {
  const { lead } = await owned(id);
  if (!lead.quote || !["quote_sent", "install_to_plan"].includes(lead.status)) return;
  const q = lead.quote;
  q.history = [...(q.history ?? []), { items: q.items, sent_at: q.sent_at, decided_at: q.decided_at, reopened_at: stamp() }];
  q.sent_at = undefined;
  q.decided_at = undefined;
  q.reviewed_at = undefined;
  move(lead, "quote_review", `Offerte heropend om aan te passen (versie ${q.history.length + 1}). De klant geeft na het versturen opnieuw akkoord.`);
  await saveLead(lead);
  done(id, "heropend", "offerte");
}

/** Alle meldingen als gelezen markeren. */
export async function markNotificationsSeen() {
  const session = await requireSession("owner");
  const current = await getSettings(session.company_id);
  await saveSettings(session.company_id, { ...current, notifications_seen_at: stamp(), notifications_read: [] });
  revalidatePath("/dashboard", "layout");
}

/** Eén melding openen: die is daarmee gelezen, en u gaat naar de aanvraag waar hij over gaat. */
export async function openNotification(id: string, href: string) {
  const session = await requireSession("owner");
  const current = await getSettings(session.company_id);
  const read = current.notifications_read ?? [];
  if (!read.includes(id)) {
    await saveSettings(session.company_id, { ...current, notifications_read: [...read, id].slice(-300) });
  }
  revalidatePath("/dashboard", "layout");
  redirect(href.startsWith("/dashboard/") ? href : "/dashboard/meldingen");
}

/** Vaste producten opslaan (Instellingen). */
export async function saveProducts(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession("owner");
  const labels = form.getAll("p_label").map((v) => String(v).trim().slice(0, 80));
  const amounts = form.getAll("p_amount").map((v) => Number(String(v).replace(",", ".")));
  const products = labels
    .map((label, i) => ({ label, amount: Math.round((amounts[i] ?? 0) * 100) / 100 }))
    .filter((p) => p.label);
  if (products.some((p) => !Number.isFinite(p.amount) || p.amount < 0)) return { error: "Vul bij elk product een geldig bedrag in." };
  const current = await getSettings(session.company_id);
  await saveSettings(session.company_id, { ...current, products: products.slice(0, 60) });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/* ---------- Factuur ---------- */

export async function saveInvoice(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { lead } = await owned(id);
  if (!lead.invoice || lead.status !== "install_done") return { error: "Deze factuur kan niet meer worden aangepast." };
  const parsed = parseItems(form);
  if ("error" in parsed) return { error: parsed.error };
  lead.invoice.items = parsed.items;
  lead.log.push({ at: stamp(), text: "Factuur aangepast" });
  await saveLead(lead);
  refresh(id);
  return { ok: true };
}

export async function sendInvoice(id: string) {
  const { lead, session } = await owned(id);
  if (lead.status !== "install_done" || !lead.invoice) return;
  const settings = await getSettings(session.company_id);
  lead.invoice.number = await nextInvoiceNumber(session.company_id);
  lead.invoice.sent_at = stamp();
  lead.invoice.due_date = addDays(todayNl(), settings.legal.payment_days);
  move(lead, "invoice_sent", `Factuur ${lead.invoice.number} verstuurd (${quoteTotal(lead.invoice.items)} euro)`);
  await saveLead(lead);
  done(id, "factuur_verstuurd", "factuur");
}

export async function markPaid(id: string) {
  const { lead } = await owned(id);
  if (lead.status !== "invoice_sent" || !lead.invoice) return;
  lead.invoice.paid_at = stamp();
  move(lead, "completed", "Betaling ontvangen, aanvraag afgerond");
  await saveLead(lead);
  done(id, "betaald", "factuur");
}

/* ---------- Notities ---------- */

export async function addNote(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { lead, session } = await owned(id);
  const text = String(form.get("text") ?? "").trim();
  if (!text) return { error: "Schrijf eerst een notitie." };
  if (text.length > 1000) return { error: "Een notitie mag maximaal 1000 tekens zijn." };
  lead.notes.push({ at: stamp(), by: session.name, text });
  lead.log.push({ at: stamp(), text: "Notitie toegevoegd" });
  await saveLead(lead);
  refresh(id);
  return { ok: true };
}

/* ---------- Klant: offertelink en afspraaklink (geen login, geheime link) ---------- */


/** De klant geeft via de offertelink akkoord (naar "Installatie plannen") of niet (afgerond). De eigenaar plant zelf. */
export async function decideQuote(token: string, decision: "accepted" | "rejected") {
  const lead = await getLeadByToken(token);
  if (!lead || lead.status !== "quote_sent" || !lead.quote) return;
  lead.quote.decided_at = stamp();
  if (decision === "accepted") {
    move(lead, "install_to_plan", "Klant is akkoord via de offertelink, installatie plannen");
  } else {
    move(lead, "rejected", "Klant heeft de offerte afgewezen via de offertelink");
  }
  await saveLead(lead);
  refresh(lead.id);
  redirect(`/offerte/${token}`);
}

export async function chooseSlot(token: string, index: number) {
  const lead = await getLeadByToken(token);
  const p = lead?.proposal;
  if (!lead || !p || p.chosen) redirect(`/afspraak/${token}`);
  const slot = p.slots[index];
  if (!slot) redirect(`/afspraak/${token}`);

  const bs = await allBlocks(lead.company_id);
  if (!freeSlots(bs, p.technician, slot.date, p.kind, lead.id).includes(slot.time)) {
    redirect(`/afspraak/${token}?bezet=1`);
  }
  const appt = { date: slot.date, time: slot.time, technician: p.technician };
  p.chosen = slot;
  p.callback_at = undefined;
  if (p.kind === "visit") {
    lead.appointment = appt;
    move(lead, "visit_planned", `Klant koos ${dayShort(slot.date)} ${slot.time} (${p.technician})`);
  } else {
    lead.install_appointment = appt;
    move(lead, "install_planned", `Klant koos ${dayShort(slot.date)} ${slot.time} voor de installatie (${p.technician})`);
  }
  await saveLead(lead);
  refresh(lead.id);
  redirect(`/afspraak/${token}`);
}

export async function requestCallback(token: string) {
  const lead = await getLeadByToken(token);
  const p = lead?.proposal;
  if (!lead || !p || p.chosen) redirect(`/afspraak/${token}`);
  p.callback_at = stamp();
  lead.log.push({ at: stamp(), text: "Klant past geen van de voorgestelde momenten en wil teruggebeld worden" });
  await saveLead(lead);
  refresh(lead.id);
  redirect(`/afspraak/${token}`);
}

/* ---------- Instellingen ---------- */

export async function saveCompany(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession("owner");
  const company_name = String(form.get("company_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  if (company_name.length < 2) return { error: "Vul de bedrijfsnaam in." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Vul een geldig e-mailadres in." };
  const current = await getSettings(session.company_id);
  await saveSettings(session.company_id, { ...current, company_name, phone, email });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveLegal(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession("owner");
  const address = String(form.get("address") ?? "").trim().slice(0, 200);
  const kvk = String(form.get("kvk") ?? "").replace(/\s/g, "");
  const btw = String(form.get("btw") ?? "").replace(/\s/g, "").toUpperCase();
  const iban = String(form.get("iban") ?? "").replace(/\s/g, "").toUpperCase();
  const days = Number(form.get("payment_days"));
  if (kvk && !/^\d{8}$/.test(kvk)) return { error: "Een KvK-nummer heeft 8 cijfers." };
  if (btw && !/^NL\d{9}B\d{2}$/.test(btw)) return { error: "Een btw-nummer ziet eruit als NL123456789B01." };
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return { error: "Controleer het IBAN, bijvoorbeeld NL91ABNA0417164300." };
  if (!Number.isInteger(days) || days < 1 || days > 60) return { error: "De betaaltermijn is tussen 1 en 60 dagen." };
  const current = await getSettings(session.company_id);
  await saveSettings(session.company_id, { ...current, legal: { address, kvk, btw, iban, payment_days: days } });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function savePricing(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession("owner");
  const current = await getSettings(session.company_id);
  let rules = current.pricing;
  for (const group of PRICE_GROUPS) {
    for (const field of group.fields) {
      const raw = String(form.get(field.path) ?? "").replace(",", ".").trim();
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n)) {
        return { error: `“${field.label}” is geen geldig getal.` };
      }
      if (field.unit === "pct" && (n < 0 || n > 300)) {
        return { error: `“${field.label}” moet tussen 0 en 300 liggen.` };
      }
      rules = setPath(rules, field.path, fromDisplay(field, n));
    }
  }
  if (rules.spreadLow >= rules.spreadHigh) {
    return { error: "De ondergrens moet lager zijn dan de bovengrens." };
  }
  await saveSettings(session.company_id, { ...current, pricing: rules });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function resetPricing(): Promise<void> {
  const session = await requireSession("owner");
  const current = await getSettings(session.company_id);
  await saveSettings(session.company_id, { ...current, pricing: DEFAULT_RULES });
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?notice=reset");
}

/* ---------- Demo-aanvraag (website) ---------- */

const demoHits = new Map<string, number[]>();

export async function requestDemo(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "")) return { ok: true }; // honeypot
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const recent = (demoHits.get(ip) ?? []).filter((t) => Date.now() - t < 60 * 60_000);
  if (recent.length >= 5) return { error: "Er zijn te veel aanvragen vanaf dit netwerk. Probeer het later opnieuw." };
  demoHits.set(ip, [...recent, Date.now()]);

  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const company = String(form.get("company") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().slice(0, 160);
  const plan = String(form.get("plan") ?? "").slice(0, 20);
  if (name.length < 2) return { error: "Vul uw naam in." };
  if (company.length < 2) return { error: "Vul de naam van uw bedrijf in." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Vul een geldig e-mailadres in." };
  if (form.get("consent") !== "on") return { error: "Geef toestemming om contact met u op te nemen." };

  if (USE_SUPABASE) {
    const { error } = await supabaseAdmin()
      .from("demo_requests")
      .insert({ name, company, email, plan, consent_at: stamp() });
    if (error) {
      console.error("[demo_requests]", error.message);
      return { error: "Versturen is niet gelukt. Probeer het later opnieuw." };
    }
    return { ok: true };
  }

  const file = path.join(process.cwd(), "data", "demo-requests.json");
  let list: unknown[] = [];
  try {
    list = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  list.push({ at: stamp(), name, company, email, plan });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(list, null, 2), "utf8");
  return { ok: true };
}

/* ---------- Monteur ---------- */

/** Alleen de monteur die op de afspraak staat mag deze afronden of afmelden. */
async function technicianLead(id: string) {
  const session = await requireSession();
  const lead = await getLead(id, session.company_id);
  if (!lead) return null;
  const kind: Kind | null =
    lead.status === "visit_planned" ? "visit" : lead.status === "install_planned" ? "install" : null;
  const appt = kind === "visit" ? lead.appointment : kind === "install" ? lead.install_appointment : undefined;
  if (!kind || !appt || appt.declined_at || appt.technician !== session.name) return null;
  return { lead, session, kind, appt };
}

export async function completeVisit(id: string, _: FormState, form: FormData): Promise<FormState> {
  const ctx = await technicianLead(id);
  if (!ctx || ctx.kind !== "visit") return { error: "Dit bezoek staat niet meer open." };
  const { lead, session } = ctx;

  for (const key of TECH_KEYS) {
    const v = String(form.get(key) ?? UNKNOWN);
    const valid = TECH_OPTIONS[key].options.some((o) => o.id === v);
    lead.check[key] = valid ? { value: v, source: "verified" } : { value: UNKNOWN, source: "unknown" };
  }
  const missing = TECH_KEYS.filter((k) => lead.check[k].source !== "verified");
  if (missing.length > 0 && form.get("confirm_incomplete") !== "on") {
    return { error: `${missing.length} punt(en) nog niet ingevuld. Vul ze in, of vink aan dat u zonder afrondt.` };
  }

  lead.check.notes = String(form.get("notes") ?? "").slice(0, 2000);

  const files = onlyFiles(form.getAll("photos"));
  const photoError = validateImages(files, lead.check.photos.length);
  if (photoError) return { error: photoError };
  lead.check.photos.push(...(await saveImages(files)));

  lead.check.completed_at = stamp();
  lead.log.push({ at: stamp(), text: `Bezoek afgerond door ${session.name}` });

  // De conceptofferte staat direct klaar: de eigenaar hoeft alleen te controleren.
  const { pricing } = await getSettings(session.company_id);
  lead.quote = { items: generateQuoteItems(lead, pricing), generated_at: stamp() };
  move(lead, "quote_review", "Conceptofferte gemaakt");
  await saveLead(lead);
  refresh(id);
  redirect(session.role === "owner" ? `/dashboard/${id}?tab=afspraken` : "/technician?done=1");
}

export async function completeInstall(id: string, _: FormState, form: FormData): Promise<FormState> {
  const ctx = await technicianLead(id);
  if (!ctx || ctx.kind !== "install") return { error: "Deze installatie staat niet meer open." };
  const { lead, session } = ctx;

  const asQuoted = String(form.get("as_quoted") ?? "");
  if (asQuoted !== "yes" && asQuoted !== "no") return { error: "Geef aan of de installatie is uitgevoerd volgens de offerte." };
  const units = String(form.get("units") ?? "").trim();
  if (!/^[1-9]\d?$/.test(units)) return { error: "Vul het aantal geplaatste units in (1 tot 99)." };
  const pipe = String(form.get("pipe_length") ?? "");
  if (!INSTALL_PIPE_OPTIONS.some((o) => o.id === pipe)) return { error: "Kies de werkelijke leidinglengte." };

  const checks: Record<string, boolean> = {};
  for (const c of INSTALL_CHECKS) checks[c.id] = form.get(c.id) === "on";
  const open = INSTALL_CHECKS.filter((c) => !checks[c.id]);
  if (open.length > 0 && form.get("confirm_incomplete") !== "on") {
    return { error: `${open.length} controlepunt(en) nog niet afgevinkt. Vink ze af, of bevestig dat u zonder afrondt.` };
  }

  const labels = form.getAll("extra_label").map(String);
  const amounts = form.getAll("extra_amount").map((v) => Number(String(v).replace(",", ".")));
  const extras: QuoteItem[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim();
    if (!label && !amounts[i]) continue;
    if (!label) return { error: `Meerwerk ${i + 1} heeft geen omschrijving.` };
    if (!Number.isFinite(amounts[i]) || amounts[i] <= 0) return { error: `Meerwerk ${i + 1} heeft geen geldig bedrag.` };
    extras.push({ id: `x${i}${Date.now().toString(36)}`, label: label.slice(0, 120), amount: Math.round(amounts[i]) });
  }

  const files = onlyFiles(form.getAll("photos"));
  const photoError = validateImages(files, 0);
  if (photoError) return { error: photoError };

  const report: InstallReport = {
    as_quoted: asQuoted,
    units,
    pipe_length: pipe,
    checks,
    serials: String(form.get("serials") ?? "").trim().slice(0, 300),
    notes: String(form.get("notes") ?? "").trim().slice(0, 2000),
    photos: await saveImages(files),
    extras,
    completed_at: stamp(),
  };
  lead.install = report;
  lead.invoice = { items: generateInvoiceItems(lead), created_at: stamp() };
  lead.log.push({ at: stamp(), text: `Installatie afgerond door ${session.name}` });
  move(lead, "install_done", "Conceptfactuur gemaakt");
  await saveLead(lead);
  refresh(id);
  redirect(session.role === "owner" ? `/dashboard/${id}?tab=afspraken` : "/technician?done=2");
}

/** De monteur meldt dat hij op het ingeplande moment niet kan. De eigenaar ziet dit direct. */
export async function declineAppointment(id: string) {
  const ctx = await technicianLead(id);
  if (!ctx) redirect("/technician");
  const { lead, session, kind, appt } = ctx;
  appt.declined_at = stamp();
  lead.log.push({
    at: stamp(),
    text: `${session.name} kan niet op ${dayShort(appt.date)} ${appt.time} (${kind === "visit" ? "bezoek" : "installatie"})`,
  });
  await saveLead(lead);
  refresh(id);
  redirect(session.role === "owner" ? `/dashboard/${id}?tab=afspraken` : "/technician?declined=1");
}

/* ---------- Eigen agenda-items en niet beschikbaar ---------- */

/**
 * Een afspraak in de agenda zetten of wijzigen ("Overige"). Iedereen mag dit voor zichzelf doen, de eigenaar ook voor een
 * collega. Niet beschikbaar of ziek doorgeven kan alleen de eigenaar: monteurs regelen dat onderling met de eigenaar.
 */
export async function saveAgendaEntry(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const owner = session.role === "owner";
  const id = String(form.get("id") ?? "");
  const kind = form.get("kind") === "off" && owner ? "off" : "item";
  const date = String(form.get("date") ?? "");
  const dateTo = String(form.get("date_to") ?? "");
  const multi = isDay(String(form.get("date_to") ?? "")) && String(form.get("date_to")) > String(form.get("date") ?? "");
  const wholeDay = form.get("whole_day") === "on" || multi;
  const start = wholeDay ? "" : String(form.get("start") ?? "");
  const end = wholeDay ? "" : String(form.get("end") ?? "");
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  const description = String(form.get("description") ?? "").trim().slice(0, 500);
  const who = owner ? String(form.get("who") ?? "") : session.name;

  const roster = await team(session.company_id);
  if (!teamNames(roster).includes(who)) return { error: "Kies voor wie dit geldt." };
  if (!isDay(date)) return { error: "Kies een datum." };

  const existing = id ? (await listAgendaItems(session.company_id)).find((i) => i.id === id) : undefined;
  if (id && !existing) return { error: "Deze afspraak bestaat niet meer." };
  if (existing && !owner && existing.who !== session.name && existing.created_by !== session.name) {
    return { error: "U kunt alleen uw eigen afspraken wijzigen." };
  }
  if (!existing && date < todayNl()) return { error: "Die datum ligt in het verleden." };

  if (kind === "item" && !title) return { error: "Vul een titel in." };
  if (!wholeDay) {
    if (!isTime(start) || !isTime(end)) return { error: "Kies een begin- en eindtijd, of kies hele dag." };
    if (toMin(end) <= toMin(start)) return { error: "De eindtijd moet na de begintijd liggen." };
  }
  if (dateTo && (!isDay(dateTo) || dateTo < date)) return { error: "De einddatum moet op of na de begindatum liggen." };

  const item: AgendaItem = {
    id: existing?.id ?? crypto.randomUUID(),
    company_id: session.company_id,
    kind,
    title: title || "Niet beschikbaar",
    date,
    ...(dateTo && dateTo > date ? { date_to: dateTo } : {}),
    ...(start && end ? { start, end } : {}),
    ...(description && kind === "item" ? { description } : {}),
    who,
    created_by: existing?.created_by ?? session.name,
  };
  await saveAgendaItem(item);
  revalidateAgenda();
  return { ok: true };
}

function revalidateAgenda() {
  revalidatePath("/dashboard/agenda");
  revalidatePath("/technician/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/technician");
}

/** Wijst een bestaande afspraak toe aan een andere monteur (bijvoorbeeld als de eerste ziek is). Alleen de eigenaar. */
export async function reassignAppointment(id: string, kind: Kind, tech: string) {
  const { lead, session } = await owned(id);
  const appt = kind === "install" ? lead.install_appointment : lead.appointment;
  if (!appt) return;
  const roster = await team(session.company_id);
  if (!teamNames(roster).includes(tech) || !worksOn(roster, tech, appt.date)) return;
  const length = kind === "install" ? INSTALL_MINUTES : VISIT_MINUTES;
  if (overlaps(await allBlocks(session.company_id), tech, appt.date, toMin(appt.time), length, lead.id)) return;
  const from = appt.technician;
  appt.technician = tech;
  lead.log.push({ at: stamp(), text: `${kind === "install" ? "Installatie" : "Bezoek"} overgedragen van ${from} aan ${tech}` });
  await saveLead(lead);
  refresh(id);
  revalidateAgenda();
}

/** Snel iemand voor één dag afmelden (bijvoorbeeld bij ziekte), of die melding weer weghalen. Alleen de eigenaar. */
export async function setUnavailable(who: string, date: string, reason: string, undo?: string) {
  const session = await requireSession("owner");
  if (undo) {
    await deleteAgendaItem(undo, session.company_id);
  } else {
    if (!teamNames(await team(session.company_id)).includes(who) || !isDay(date)) return;
    await saveAgendaItem({
      id: crypto.randomUUID(),
      company_id: session.company_id,
      kind: "off",
      title: reason === "Ziek" ? "Ziek" : "Niet beschikbaar",
      date,
      who,
      created_by: session.name,
    });
  }
  revalidateAgenda();
}

export async function removeAgendaItem(id: string) {
  const session = await requireSession();
  const items = await listAgendaItems(session.company_id);
  const item = items.find((i) => i.id === id);
  // Een monteur mag alleen zijn eigen afspraken verwijderen.
  if (!item || (session.role !== "owner" && item.who !== session.name && item.created_by !== session.name)) return;
  await deleteAgendaItem(id, session.company_id);
  revalidateAgenda();
}

/** Weekrooster en teamleden opslaan (Instellingen > Team). */
export async function saveTeam(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession("owner");
  const current = await getSettings(session.company_id);
  const members = current.team
    .map((m, i) => ({
      name: m.name,
      days: [0, 1, 2, 3, 4, 5, 6].filter((d) => form.get(`d-${i}-${d}`) === "on"),
      remove: form.get(`rm-${i}`) === "on",
    }))
    .filter((m) => !m.remove || m.name === OWNER);
  const added = String(form.get("new_name") ?? "").trim().slice(0, 60);
  if (added) {
    if (members.some((m) => m.name.toLowerCase() === added.toLowerCase())) return { error: `${added} staat al in het team.` };
    members.push({ name: added, days: WORKWEEK, remove: false });
  }
  if (members.some((m) => m.days.length === 0)) return { error: "Kies voor iedereen minstens één werkdag, of verwijder de persoon." };
  await saveSettings(session.company_id, { ...current, team: members.map(({ name, days }) => ({ name, days })) });
  revalidateAgenda();
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/* ---------- Betalingsherinnering ---------- */

/** Legt vast dat er een herinnering naar de klant is gestuurd. */
export async function logReminder(id: string) {
  const { lead } = await owned(id);
  if (lead.status !== "invoice_sent" || !lead.invoice) return;
  lead.invoice.reminders = [...(lead.invoice.reminders ?? []), stamp()];
  lead.log.push({ at: stamp(), text: `Betalingsherinnering ${lead.invoice.reminders.length} verstuurd` });
  await saveLead(lead);
  revalidatePath("/dashboard/revenue/openstaand");
  revalidatePath(`/dashboard/${id}`);
  redirect("/dashboard/revenue/openstaand?notice=herinnering");
}

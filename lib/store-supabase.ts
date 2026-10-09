import "server-only";
import { formatInvoiceNumber, mergeSettings } from "./defaults";
import { supabaseAdmin } from "./supabase-admin";
import type { AgendaItem, Lead, Settings } from "./types";
import { normalizeStatus } from "./workflow";

type Row = {
  id: string;
  company_id: string;
  created_at: string;
  customer: Lead["customer"];
  answers: Lead["answers"];
  estimate: Lead["estimate"];
  status: string;
  preferred: Lead["preferred"] | null;
  install_preferred: Lead["install_preferred"] | null;
  appointment: Lead["appointment"] | null;
  install_appointment: Lead["install_appointment"] | null;
  proposal: Lead["proposal"] | null;
  tech_check: Lead["check"];
  quote: Lead["quote"] | null;
  install: Lead["install"] | null;
  invoice: Lead["invoice"] | null;
  token: string;
  consent_at: string;
  customer_photos: string[];
  notes: Lead["notes"];
  log: Lead["log"];
};

const fromRow = (r: Row): Lead => ({
  id: r.id,
  company_id: r.company_id,
  created_at: r.created_at,
  customer: r.customer,
  answers: r.answers,
  estimate: r.estimate,
  status: normalizeStatus(r.status),
  preferred: r.preferred ?? undefined,
  install_preferred: r.install_preferred ?? undefined,
  appointment: r.appointment ?? undefined,
  install_appointment: r.install_appointment ?? undefined,
  proposal: r.proposal ?? undefined,
  check: r.tech_check,
  quote: r.quote ?? undefined,
  install: r.install ?? undefined,
  invoice: r.invoice ?? undefined,
  token: r.token,
  consent_at: r.consent_at,
  customer_photos: r.customer_photos ?? [],
  notes: r.notes ?? [],
  log: r.log ?? [],
});

const toRow = (l: Lead): Row => ({
  id: l.id,
  company_id: l.company_id,
  created_at: l.created_at,
  customer: l.customer,
  answers: l.answers,
  estimate: l.estimate,
  status: l.status,
  preferred: l.preferred ?? null,
  install_preferred: l.install_preferred ?? null,
  appointment: l.appointment ?? null,
  install_appointment: l.install_appointment ?? null,
  proposal: l.proposal ?? null,
  tech_check: l.check,
  quote: l.quote ?? null,
  install: l.install ?? null,
  invoice: l.invoice ?? null,
  token: l.token,
  consent_at: l.consent_at,
  customer_photos: l.customer_photos,
  notes: l.notes,
  log: l.log,
});

function fail(action: string, error: { message: string }): never {
  console.error(`[supabase] ${action}:`, error.message);
  throw new Error(`Opslag mislukt (${action})`);
}

export async function listLeads(companyId: string): Promise<Lead[]> {
  const { data, error } = await supabaseAdmin()
    .from("requests")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) fail("listLeads", error);
  return (data as Row[]).map(fromRow);
}

export async function getLead(id: string, companyId: string): Promise<Lead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabaseAdmin()
    .from("requests")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) fail("getLead", error);
  return data ? fromRow(data as Row) : null;
}

export async function getLeadByToken(token: string): Promise<Lead | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data, error } = await supabaseAdmin()
    .from("requests")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) fail("getLeadByToken", error);
  return data ? fromRow(data as Row) : null;
}

export async function saveLead(lead: Lead): Promise<void> {
  const { error } = await supabaseAdmin().from("requests").upsert(toRow(lead));
  if (error) fail("saveLead", error);
}

type SettingsRow = {
  company_name: string;
  phone: string;
  email: string;
  pricing: Settings["pricing"];
  details: { legal?: Settings["legal"]; invoice_seq?: number; team?: Settings["team"]; demo_seeded?: boolean; products?: Settings["products"]; notifications_seen_at?: string; notifications_read?: string[] } | null;
};

export async function getSettings(companyId: string): Promise<Settings> {
  const { data, error } = await supabaseAdmin()
    .from("company_settings")
    .select("company_name, phone, email, pricing, details")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) fail("getSettings", error);
  if (!data) return mergeSettings(null);
  const r = data as SettingsRow;
  return mergeSettings({
    company_name: r.company_name,
    phone: r.phone,
    email: r.email,
    pricing: r.pricing,
    legal: r.details?.legal,
    invoice_seq: r.details?.invoice_seq,
    team: r.details?.team,
    demo_seeded: r.details?.demo_seeded,
    products: r.details?.products,
    notifications_seen_at: r.details?.notifications_seen_at,
    notifications_read: r.details?.notifications_read,
  });
}

export async function saveSettings(companyId: string, s: Settings): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("company_settings")
    .upsert({
      company_id: companyId,
      company_name: s.company_name,
      phone: s.phone,
      email: s.email,
      pricing: s.pricing,
      details: { legal: s.legal, invoice_seq: s.invoice_seq, team: s.team, demo_seeded: s.demo_seeded, products: s.products, notifications_seen_at: s.notifications_seen_at, notifications_read: s.notifications_read },
      updated_at: new Date().toISOString(),
    });
  if (error) fail("saveSettings", error);
}

/** Geeft het volgende factuurnummer en slaat de teller op. */
export async function nextInvoiceNumber(companyId: string): Promise<string> {
  const s = await getSettings(companyId);
  s.invoice_seq += 1;
  await saveSettings(companyId, s);
  return formatInvoiceNumber(new Date().getFullYear(), s.invoice_seq);
}

/* ---------- Eigen agenda-items en niet-beschikbaar ---------- */

export async function listAgendaItems(companyId: string): Promise<AgendaItem[]> {
  const { data, error } = await supabaseAdmin().from("agenda_items").select("*").eq("company_id", companyId);
  if (error) fail("listAgendaItems", error);
  return (data ?? []) as AgendaItem[];
}

export async function saveAgendaItem(item: AgendaItem): Promise<void> {
  const { error } = await supabaseAdmin().from("agenda_items").upsert(item);
  if (error) fail("saveAgendaItem", error);
}

export async function deleteAgendaItem(id: string, companyId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("agenda_items").delete().eq("id", id).eq("company_id", companyId);
  if (error) fail("deleteAgendaItem", error);
}

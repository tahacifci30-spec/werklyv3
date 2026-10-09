import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card, dayNl } from "@/components/ui";
import { KIND_LABEL, type Kind } from "@/lib/agenda";
import { requireSession } from "@/lib/auth";
import { todayNl } from "@/lib/dates";
import { optionLabel } from "@/lib/intake/questions";
import { openChecks } from "@/lib/dossier";
import { listLeads } from "@/lib/store";
import type { Appointment, Lead } from "@/lib/types";

export const metadata: Metadata = { title: "Mijn bezoeken" };
export const dynamic = "force-dynamic";

const BANNERS: Record<string, string> = {
  "done:1": "Bezoek afgerond. De conceptofferte staat klaar voor de eigenaar.",
  "done:2": "Installatie afgerond. De conceptfactuur staat klaar voor de eigenaar.",
  "declined:1": "Gemeld bij de eigenaar. Die plant een ander moment in.",
};

type Item = { lead: Lead; kind: Kind; appt: Appointment };

export default async function TechnicianPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; declined?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const banner = sp.done ? BANNERS[`done:${sp.done}`] : sp.declined ? BANNERS[`declined:${sp.declined}`] : undefined;

  const all = await listLeads(session.company_id);
  const items: Item[] = [];
  for (const l of all) {
    if (l.status === "visit_planned" && l.appointment && !l.appointment.declined_at && l.appointment.technician === session.name)
      items.push({ lead: l, kind: "visit", appt: l.appointment });
    if (l.status === "install_planned" && l.install_appointment && !l.install_appointment.declined_at && l.install_appointment.technician === session.name)
      items.push({ lead: l, kind: "install", appt: l.install_appointment });
  }
  items.sort((a, b) => `${a.appt.date}${a.appt.time}`.localeCompare(`${b.appt.date}${b.appt.time}`));

  const today = todayNl();
  const groups = [
    ["Vandaag", items.filter((i) => i.appt.date <= today)],
    ["Binnenkort", items.filter((i) => i.appt.date > today)],
  ] as const;

  return (
    <AppShell session={session}>
      <h1 className="display-md text-4xl">Mijn bezoeken</h1>

      {banner && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-emerald-800">
          {banner}
        </p>
      )}

      {items.length === 0 && (
        <Card className="mt-6">
          <p className="font-medium">Geen afspraken gepland.</p>
          <p className="text-muted">Zodra de eigenaar een bezoek of installatie voor u inplant, ziet u dat hier.</p>
        </Card>
      )}

      {groups.map(
        ([title, list]) =>
          list.length > 0 && (
            <section key={title} className="mt-6">
              <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>
              <ul className="space-y-3">
                {list.map(({ lead: l, kind, appt }) => (
                  <li key={l.id + kind}>
                    <Link
                      href={`/technician/${l.id}`}
                      className="block rounded-2xl border border-line bg-surface p-4 shadow-sm transition-[background-color,border-color,color,transform] duration-100 ease-out active:scale-[0.98] hover:border-brand"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-words text-lg font-semibold">{l.customer.name}</span>
                        <span className="tabular shrink-0 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-strong">
                          {title === "Vandaag" && appt.date === today ? appt.time : `${dayNl(appt.date)} ${appt.time}`}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-brand-strong">{KIND_LABEL[kind]}</p>
                      <p className="mt-1 break-words text-sm text-muted">
                        {l.customer.street}, {l.customer.city} · {optionLabel("spaces", l.answers.spaces)}
                      </p>
                      {kind === "visit" && (
                        <p className="mt-2 text-sm font-medium text-amber-900">{openChecks(l).length} punten controleren</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </AppShell>
  );
}

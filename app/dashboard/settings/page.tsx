import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { CopyButton } from "@/components/CopyButton";
import { Flash } from "@/components/Flash";
import { CompanyForm, LegalForm, PricingForm, ProductsForm, TeamForm } from "@/components/settings/SettingsForms";
import { Card, SectionTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NOTICES } from "@/lib/notices";
import { estimatePrice, formatRange } from "@/lib/pricing/engine";
import { PRICE_GROUPS, getPath, toDisplay } from "@/lib/pricing/fields";
import { getSettings } from "@/lib/store";

export const metadata: Metadata = { title: "Instellingen" };
export const dynamic = "force-dynamic";

const EXAMPLES: [string, Record<string, string>][] = [
  ["1 ruimte, 20 tot 30 m², rijtjeswoning, buitenunit aan de gevel", { spaces: "living", area: "20_30", property: "terraced", outdoor: "facade", existing: "none" }],
  ["Woonkamer en slaapkamer, 30 tot 40 m², vrijstaand, buitenunit op het dak, één buitenunit", { spaces: "living_bedroom", area: "30_40", property: "detached", outdoor: "roof", system: "multisplit" }],
  ["Alles onbekend", { spaces: "unknown", area: "unknown", property: "unknown", outdoor: "unknown", existing: "unknown" }],
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await requireSession("owner");
  const { notice } = await searchParams;
  const s = await getSettings(session.company_id);

  const values: Record<string, number> = {};
  for (const g of PRICE_GROUPS) for (const f of g.fields) values[f.path] = toDisplay(f, getPath(s.pricing, f.path));

  const embed = `<iframe src="/intake" title="Prijsindicatie aanvragen" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`;

  return (
    <AppShell session={session}>
      <h1 className="display-md text-4xl">Instellingen</h1>
      <div className="mt-4">
        <Flash key={notice} message={notice ? NOTICES[notice] : undefined} />
      </div>

      <div className="grid gap-4">
        <Card>
          <SectionTitle>Bedrijf</SectionTitle>
          <CompanyForm values={{ company_name: s.company_name, phone: s.phone, email: s.email }} />
        </Card>

        <Card>
          <SectionTitle>Team en werkdagen</SectionTitle>
          <TeamForm team={s.team} />
        </Card>

        <Card>
          <SectionTitle>Vaste producten</SectionTitle>
          <ProductsForm products={s.products} />
        </Card>

        <Card>
          <SectionTitle>Gegevens voor de factuur</SectionTitle>
          <LegalForm values={s.legal} />
        </Card>

        <Card>
          <SectionTitle>Klantformulier delen</SectionTitle>
          <p className="text-sm text-muted">
            Zet het formulier op uw website of deel de link. Aanvragen komen direct in uw overzicht.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton value="/intake" label="Link kopiëren" />
          </div>
          <label htmlFor="embed" className="mt-5 block text-sm font-medium">
            Code om het formulier in uw website te zetten
          </label>
          <textarea id="embed" readOnly rows={3} value={embed} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs" />
          <p className="mt-1 text-xs text-muted">Vervang het pad door het volledige adres van uw Werkly-omgeving.</p>
        </Card>

        <Card>
          <SectionTitle>Prijsregels prijsindicatie</SectionTitle>
          <p className="mb-5 text-sm text-muted">
            De prijsindicatie in het klantformulier en de conceptofferte komen uit deze regels. Bedragen zijn inclusief btw.
            Bestaande aanvragen behouden de prijs die de klant zag.
          </p>
          <PricingForm values={values} />
        </Card>

        <Card>
          <SectionTitle>Voorbeeldberekeningen met de opgeslagen regels</SectionTitle>
          <ul className="divide-y divide-line text-sm">
            {EXAMPLES.map(([label, answers]) => (
              <li key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 max-w-md text-muted">{label}</span>
                <strong className="tabular">{formatRange(estimatePrice(answers, s.pricing))}</strong>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}

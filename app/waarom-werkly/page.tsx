import type { Metadata } from "next";
import Link from "next/link";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";

export const metadata: Metadata = {
  title: "Waarom Werkly",
  description: "Meer aanvragen, minder heen en weer bellen en een factuur die niet vergeten wordt. Reken zelf uit wat het oplevert.",
};

const icons: Record<string, string> = {
  growth: "M3 17l6-6 4 4 8-8M15 7h6v6",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  doc: "M7 3h10l3 3v15H7zM10 12h7M10 16h7",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
};

/** Het eurosymbool is een gevuld beeld (eigen ontwerp); de andere iconen zijn lijntekeningen. */
const EURO_PATH =
  "M352.01,304.27c1.42-.75,2.83-1.32,3.92-1.2,1.01.11,2.42,2.01,2.42,3.34v47.75c0,3.68-1.9,7.29-5.07,9.22-29.66,18.07-63.47,28.11-98.37,29.12-39.93,1.11-79.13-9.96-112.48-31.77-35.64-23.31-62.91-57.43-77.51-97.68l-59.2-.03c-3.95,0-6.32-3.49-5.57-7.16l8.73-33.12c1.6-3.77,4.79-6.36,8.9-6.85l36.41-.03c-1.41-13.56-1.32-26.21,0-39.17H5.68c-1.76,0-3.59-1-4.42-2.06-.95-1.22-1.52-3.39-1.09-5l9.04-33.36c1.65-3.38,4.92-6.68,9.07-6.68l46.61-.06C87.19,68.13,138.85,21.51,202.19,5.77c43.34-10.77,88.97-6.32,129.66,12.12,3.45,1.13,6.28,4.56,5.28,8.41l-9.14,35.11c-.37,1.42-1.45,3.18-2.42,3.68-1.28.65-3.47.44-5.21.11-34.96-18.92-76.08-23.13-114.27-11.5-39.08,11.9-71.47,39.51-89.83,75.83h184.95c3.89.01,5.96,3.61,5.43,6.96l-8.93,33.48c-1.01,3.77-4.87,5.96-8.57,6.73H101.75c-1.75,13.04-1.73,26.13,0,39.18h178.78c3.4.2,6.27,3.29,5.37,6.7l-8.41,32.1c-1.1,4.19-4.65,8.33-9.55,8.33l-151.67.03c18.16,35.92,49.8,63.04,87.81,75.2,51.87,16.59,108.5,3.62,147.92-33.97Z";

/** Kleine verschuiving zodat het icoon optisch in het midden van zijn vlak staat. */
const NUDGE: Record<string, string> = { doc: "translate(-1.5 0)" };

function Icon({ name }: { name: string }) {
  if (name === "euro") {
    return (
      <svg viewBox="-20 -40 438.34 472.58" className="h-6 w-6" fill="currentColor" aria-hidden="true">
        <path d={EURO_PATH} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} transform={NUDGE[name]} />
    </svg>
  );
}

const problems = [
  ["Geen tijd voor een offerte binnen een dag", "U zit onderweg of bij klanten. Wie dagen op een prijs wacht, belt de volgende installateur."],
  ["Eindeloos bellen", "Voor elke aanvraag drie telefoontjes om gegevens, foto's en een afspraak."],
  ["Offertes en facturen kosten uren", "Overtikken in Word of Excel en meerwerk dat op de factuur vergeten wordt."],
];

const benefits = [
  ["growth", "Meer aanvragen", "Het klantformulier is in een minuut ingevuld. Wat makkelijk is, wordt vaker afgemaakt."],
  ["bolt", "Direct antwoord", "De klant ziet meteen een prijsindicatie op uw eigen prijzen. Geen dagen wachten, minder klanten die afhaken."],
  ["chat", "Minder nabellen", "De klant vult zelf alles in: gegevens, foto's van de situatie en een voorkeursmoment. U hoeft niet meer te bellen om iets na te vragen."],
  ["doc", "Sneller van bezoek naar offerte", "De monteur vult de checklist in en de conceptofferte staat klaar. U controleert en verstuurt."],
  ["euro", "Niets blijft liggen", "Meerwerk komt op de factuur en een betalingsherinnering is één klik. U ziet wie nog moet betalen."],
  ["eye", "Overzicht in één blik", "Elke aanvraag met de volgende stap, een agenda met beschikbare monteurs en uw omzet per maand."],
];

const rows: [string, string, string, string][] = [
  ["Klant vult een gericht klantformulier in", "Ja, met prijsindicatie", "Zelf formulier bouwen", "Nee"],
  ["Onbekende gegevens blijven zichtbaar", "Ja, per veld", "Nee", "Nee"],
  ["Monteur-checklist op locatie", "Ja", "Maatwerk", "Soms"],
  ["Conceptofferte uit bezoekgegevens", "Ja", "Nee", "Handmatig"],
  ["Klant geeft online akkoord", "Ja", "Soms", "Ja"],
  ["Agenda met werkdagen per monteur", "Ja", "Soms", "Nee"],
  ["Factuur, betaling en omzet", "Ja", "Soms", "Soms"],
  ["Direct aan de slag, zonder cursus", "Ja, wij richten het in", "Training nodig", "Soms"],
  ["Koppeling met boekhouding (SnelStart)", "Binnenkort", "Soms", "Soms"],
];

export default function WhyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
            <h1 className="display max-w-3xl text-[clamp(2.75rem,7vw,5rem)]">
              Elke aanvraag die blijft liggen, is een klus die u misloopt.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted">
              Installateurs verliezen geen klanten door hun vak, maar door wachten, nabellen en administratie. Werkly haalt dat
              weg, van de eerste aanvraag tot de betaalde factuur.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {problems.map(([t, d]) => (
                <li key={t} className="rounded-2xl border border-red-100 bg-red-50/60 p-5">
                  <p className="font-semibold text-red-900">{t}</p>
                  <p className="mt-1 text-sm text-red-900/80">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="vergelijking" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <h2 className="display-md text-4xl sm:text-5xl">Geen CRM. Geen losse offertetool.</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Veel software begint bij de offerte. Werkly begint eerder: bij de aanvraag die nog niet compleet is.
          </p>
          <div className="mt-8 overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
            <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] items-stretch gap-x-2 bg-slate-50 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted sm:grid-cols-[1.6fr_1.2fr_1fr_1fr] sm:px-6 sm:text-xs">
              <span />
              <span className="flex items-center bg-brand px-2 py-3 text-white sm:px-3">Werkly</span>
              <span className="flex items-center py-3">Algemeen CRM</span>
              <span className="flex items-center py-3">Offerte-software</span>
            </div>
            {rows.map(([label, w, crm, off], i) => (
              <div
                key={label}
                className={`grid grid-cols-[1.3fr_1fr_1fr_1fr] items-stretch gap-x-2 border-t border-line px-3 text-xs sm:grid-cols-[1.6fr_1.2fr_1fr_1fr] sm:px-6 sm:text-sm ${i % 2 ? "bg-slate-50/50" : ""}`}
              >
                <span className="flex items-center py-3.5 pr-2 font-medium">{label}</span>
                <span className="flex items-center gap-1.5 bg-brand-soft px-2 py-3.5 font-semibold text-brand-strong sm:px-3">
                  {w !== "Binnenkort" && <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 5 5 9-10" />
                  </svg>}
                  {w}
                </span>
                {[crm, off].map((c, k) => (
                  <span key={k} className={`flex items-center py-3.5 ${c === "Nee" ? "text-slate-400" : "text-muted"}`}>
                    {c === "Nee" ? "✕ Nee" : c}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="display-md text-4xl sm:text-5xl">Dit lost Werkly op</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map(([icon, t, d]) => (
              <li key={t} className="rounded-2xl border border-line bg-white p-5">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand-strong">
                  <Icon name={icon} />
                </span>
                <p className="mt-4 text-lg font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="rekentool" className="scroll-mt-20 bg-white py-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="display-md text-4xl sm:text-5xl">Reken zelf uit wat het oplevert</h2>
            <p className="mt-2 max-w-2xl text-muted">Vier getallen, direct uitkomst. Pas ze aan naar uw eigen bedrijf.</p>
            <div className="mt-8">
              <RoiCalculator />
            </div>
          </div>
        </section>

        <section className="px-4 pb-16">
          <div className="mx-auto max-w-4xl rounded-3xl bg-petrol px-6 py-10 text-center text-white sm:px-10">
            <h2 className="display-md text-4xl sm:text-5xl">Benieuwd wat het voor u betekent?</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-300">Laten we samen naar uw manier van werken kijken. Vrijblijvend.</p>
            <Link href="/#demo" className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-white px-6 text-sm font-semibold text-slate-900 hover:bg-slate-100">
              Plan een gesprek in
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

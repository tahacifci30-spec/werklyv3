import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { chooseSlot, requestCallback } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Logo } from "@/components/ui";
import { dayLong } from "@/lib/dates";
import { getLeadByToken, getSettings } from "@/lib/store";

export const metadata: Metadata = {
  title: "Kies een moment",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ChooseAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ bezet?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const lead = await getLeadByToken(token);
  const p = lead?.proposal;
  if (!lead || !p) notFound();
  const company = await getSettings(lead.company_id);
  const what = p.kind === "visit" ? "het bezoek" : "de installatie";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <Logo />
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium text-brand">{company.company_name}</p>

        {p.chosen ? (
          <div role="status" className="mt-2">
            <h1 className="display-md text-4xl">Uw afspraak staat</h1>
            <p className="mt-3 text-lg">
              <strong className="inline-block first-letter:uppercase">{dayLong(p.chosen.date)}</strong>
              {p.kind === "install" ? ` (hele dag, vanaf ${p.chosen.time})` : ` om ${p.chosen.time}`}
            </p>
            <p className="mt-2 text-muted">
              {lead.customer.street}, {lead.customer.city}. {p.technician} komt bij u langs. Tot dan!
            </p>
          </div>
        ) : p.callback_at ? (
          <div role="status" className="mt-2">
            <h1 className="display-md text-4xl">We bellen u terug</h1>
            <p className="mt-3 text-muted">
              Bedankt. {company.company_name} neemt contact met u op om een moment af te spreken. Liever direct bellen?{" "}
              <a className="font-medium text-brand underline" href={`tel:${company.phone.replace(/\s/g, "")}`}>
                {company.phone}
              </a>
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Kies een moment</h1>
            <p className="mt-2 text-muted">
              Hallo {lead.customer.name.split(" ")[0]}, uw gewenste moment past helaas niet. Kies hieronder een moment voor{" "}
              {what}.
            </p>
            {sp.bezet && (
              <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Dat moment is net door iemand anders gekozen. Kies een ander moment.
              </p>
            )}
            <ul className="mt-5 space-y-3">
              {p.slots.map((s, i) => (
                <li key={s.date + s.time}>
                  <form action={chooseSlot.bind(null, token, i)}>
                    <SubmitButton pendingText="Bevestigen…" className="w-full justify-between !py-4 text-base">
                      <span className="block first-letter:uppercase">{dayLong(s.date)}</span>
                      <span className="tabular">{p.kind === "install" ? "hele dag" : s.time}</span>
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <form action={requestCallback.bind(null, token)} className="mt-5 border-t border-line pt-5">
              <p className="text-sm text-muted">Past geen van deze momenten?</p>
              <SubmitButton variant="secondary" pendingText="Versturen…" className="mt-2 w-full">
                Bel mij terug
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { resetPricing, saveCompany, saveLegal, savePricing, saveProducts, saveTeam } from "@/app/actions";
import { useState } from "react";
import { OWNER, WEEKDAY_SHORT, techLabel } from "@/lib/agenda";
import type { Product, TeamMember } from "@/lib/types";
import { PRICE_GROUPS } from "@/lib/pricing/fields";
import { ActionForm } from "../ActionForm";
import { SubmitButton } from "../SubmitButton";
import { btn, field } from "../ui";

function Result({ state }: { state: { error?: string; ok?: boolean } | undefined }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
        Opgeslagen.
      </p>
    );
  return null;
}

export function CompanyForm({ values }: { values: { company_name: string; phone: string; email: string } }) {
  return (
    <ActionForm action={saveCompany} className="grid gap-4 sm:grid-cols-2">
      {({ state, pending }) => (
        <>
      <div className="sm:col-span-2">
        <label htmlFor="company_name" className="mb-1.5 block text-sm font-medium">
          Bedrijfsnaam
        </label>
        <input id="company_name" name="company_name" required defaultValue={values.company_name} className={field} />
        <p className="mt-1 text-sm text-muted">Zichtbaar voor klanten in het klantformulier, op de offerte en op de factuur.</p>
      </div>
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
          Telefoonnummer
        </label>
        <input id="phone" name="phone" type="tel" defaultValue={values.phone} className={field} />
      </div>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          E-mailadres
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" spellCheck={false} defaultValue={values.email} className={field} />
      </div>
      <div className="space-y-3 sm:col-span-2">
        <Result state={state} />
        <SubmitButton pending={pending} pendingText="Opslaan…">Opslaan</SubmitButton>
      </div>
</>
      )}
    </ActionForm>
  );
}

export function LegalForm({
  values,
}: {
  values: { address: string; kvk: string; btw: string; iban: string; payment_days: number };
}) {
  return (
    <ActionForm action={saveLegal} className="grid gap-4 sm:grid-cols-2">
      {({ state, pending }) => (
        <>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="mb-1.5 block text-sm font-medium">
              Adres
            </label>
            <input id="address" name="address" autoComplete="street-address" defaultValue={values.address} className={field} placeholder="Straat 1, 5611 AA Eindhoven" />
          </div>
          <div>
            <label htmlFor="kvk" className="mb-1.5 block text-sm font-medium">
              KvK-nummer
            </label>
            <input id="kvk" name="kvk" inputMode="numeric" defaultValue={values.kvk} className={field} placeholder="12345678" />
          </div>
          <div>
            <label htmlFor="btw" className="mb-1.5 block text-sm font-medium">
              Btw-nummer
            </label>
            <input id="btw" name="btw" defaultValue={values.btw} className={field} placeholder="NL123456789B01" />
          </div>
          <div>
            <label htmlFor="iban" className="mb-1.5 block text-sm font-medium">
              IBAN
            </label>
            <input id="iban" name="iban" defaultValue={values.iban} className={field} placeholder="NL91 ABNA 0417 1643 00" />
          </div>
          <div>
            <label htmlFor="payment_days" className="mb-1.5 block text-sm font-medium">
              Betaaltermijn (dagen)
            </label>
            <input id="payment_days" name="payment_days" inputMode="numeric" defaultValue={values.payment_days} className={`${field} tabular`} />
          </div>
          <p className="text-sm text-muted sm:col-span-2">Deze gegevens staan op de factuur.</p>
          <div className="space-y-3 sm:col-span-2">
            <Result state={state} />
            <SubmitButton pending={pending} pendingText="Opslaan…">Opslaan</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function PricingForm({ values }: { values: Record<string, number> }) {
  return (
    <div>
      <ActionForm action={savePricing} className="space-y-8">
      {({ state, pending }) => (
        <>
        {PRICE_GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend className="text-base font-semibold">{g.title}</legend>
            {g.description && <p className="mt-1 text-sm text-muted">{g.description}</p>}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {g.fields.map((f) => {
                const id = `p-${f.path}`;
                return (
                  <div key={f.path}>
                    <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                      {f.label}
                    </label>
                    <div className="relative">
                      {f.unit === "eur" && (
                        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                          €
                        </span>
                      )}
                      <input
                        id={id}
                        name={f.path}
                        inputMode="decimal"
                        required
                        defaultValue={values[f.path]}
                        aria-describedby={f.hint ? `${id}-h` : undefined}
                        className={`${field} tabular ${f.unit === "eur" ? "pl-7" : "pr-8"}`}
                      />
                      {f.unit === "pct" && (
                        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                          %
                        </span>
                      )}
                    </div>
                    {f.hint && (
                      <p id={`${id}-h`} className="mt-1 text-xs text-muted">
                        {f.hint}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div className="space-y-3">
          <Result state={state} />
          <SubmitButton pending={pending} pendingText="Opslaan…">Prijsregels opslaan</SubmitButton>
        </div>
</>
      )}
    </ActionForm>

      <form action={resetPricing} className="mt-4">
        <button type="submit" className={btn.danger}>
          Terugzetten naar standaard
        </button>
      </form>
    </div>
  );
}

/** Wie er werkt en op welke dagen. De agenda en de vrije tijden voor klanten volgen dit rooster. */
export function TeamForm({ team }: { team: TeamMember[] }) {
  return (
    <ActionForm action={saveTeam} className="space-y-4">
      {({ state, pending }) => (
        <>
          <p className="text-sm text-muted">
            Kies per persoon de vaste werkdagen. Op andere dagen plant het systeem niets in. Een losse vrije dag of ziekte geeft u door in de agenda.
          </p>
          <ul className="divide-y divide-line">
            {team.map((m, i) => (
              <li key={m.name} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{techLabel(m.name)}</p>
                  {m.name !== OWNER && (
                    <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                      <input type="checkbox" name={`rm-${i}`} className="h-5 w-5" />
                      Verwijderen
                    </label>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Werkdagen van ${techLabel(m.name)}`}>
                  {WEEKDAY_SHORT.map((d, di) => (
                    <label key={d} className="relative">
                      <input type="checkbox" name={`d-${i}-${di}`} defaultChecked={m.days.includes(di)} className="peer sr-only" />
                      <span className="grid h-11 min-w-11 place-items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                        {d}
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="max-w-sm">
            <label htmlFor="new-member" className="mb-1.5 block text-sm font-medium">Nieuwe monteur toevoegen</label>
            <input id="new-member" name="new_name" maxLength={60} className={field} placeholder="Naam" autoComplete="off" />
            <p className="mt-1 text-xs text-muted">Een nieuwe monteur werkt standaard van maandag tot en met vrijdag. Pas dat hierboven aan.</p>
          </div>
          <Result state={state} />
          <SubmitButton pending={pending} pendingText="Opslaan…">Team opslaan</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** Vaste producten met prijs. Ze duiken op zodra u in een offerte- of factuurregel begint te typen. */
export function ProductsForm({ products }: { products: Product[] }) {
  const [rows, setRows] = useState(products.map((p, i) => ({ key: `p${i}`, label: p.label, amount: String(p.amount) })));
  return (
    <ActionForm action={saveProducts} className="space-y-4">
      {({ state, pending }) => (
        <>
          <p className="text-sm text-muted">
            Producten die u vaak gebruikt. Typt u in een offerteregel bijvoorbeeld &ldquo;bevestigingsmateriaal&rdquo;, dan staat de prijs er meteen bij. Bedragen zijn inclusief btw.
          </p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
                <input
                  name="p_label"
                  aria-label={`Product ${i + 1}`}
                  defaultValue={r.label}
                  autoComplete="off"
                  className={field}
                />
                <input
                  name="p_amount"
                  aria-label={`Prijs product ${i + 1} in euro`}
                  defaultValue={r.amount}
                  inputMode="decimal"
                  autoComplete="off"
                  className={`${field} tabular text-right`}
                />
                <button
                  type="button"
                  aria-label={`Product ${i + 1} verwijderen`}
                  onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}
                  className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRows((l) => [...l, { key: `n${Date.now()}`, label: "", amount: "" }])}
            className="min-h-11 text-sm font-semibold text-brand hover:underline"
          >
            + Product toevoegen
          </button>
          <Result state={state} />
          <SubmitButton pending={pending} pendingText="Opslaan…">Producten opslaan</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

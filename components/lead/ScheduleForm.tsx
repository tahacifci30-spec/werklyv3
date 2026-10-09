"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions";
import { suggest, techLabel, type Availability, type Kind } from "@/lib/agenda";
import { dayLong, dayShort } from "@/lib/dates";
import { ActionForm } from "../ActionForm";
import { MonthPicker } from "../MonthPicker";
import { TimeSelect } from "../TimeSelect";
import { INSTALL_DURATIONS, durationShort } from "@/lib/duration";
import { SubmitButton } from "../SubmitButton";
import { field } from "../ui";

type Hint = { date: string; label: string };

/** Plant een afspraak. De vrije tijden komen uit de agenda (afspraken, eigen items en niet-beschikbaar). */
export function ScheduleForm({
  action,
  kind,
  technicians,
  availability,
  today,
  defaults,
  hints = [],
  submitLabel,
  isChange = false,
  defaultDays,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  kind: Kind;
  technicians: string[];
  availability: Availability;
  today: string;
  defaults?: { date?: string; time?: string; technician?: string };
  hints?: Hint[];
  submitLabel: string;
  /** De afspraak staat al en wordt gewijzigd: toon de optie om de klant te informeren. */
  isChange?: boolean;
  /** Alleen bij een installatie: voorgestelde duur in dagen */
  defaultDays?: number;
}) {
  const [tech, setTech] = useState(defaults?.technician && technicians.includes(defaults.technician) ? defaults.technician : technicians[0]);
  const [date, setDate] = useState(defaults?.date ?? "");
  const [time, setTime] = useState(defaults?.time ?? "");
  const [days, setDays] = useState(defaultDays ?? 1);

  const slots = (date && availability[tech]?.[date]) || [];
  const next = suggest(availability, tech, date || today, 1)[0];

  return (
    <ActionForm action={action} className="space-y-5">
      {({ state, pending }) => (
        <>
          <input type="hidden" name="date" value={date} />
          {kind === "install" && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Hoe lang duurt de installatie?</legend>
              <div className="flex flex-wrap gap-2">
                {INSTALL_DURATIONS.map((d) => (
                  <label key={d} className="relative">
                    <input type="radio" name="days" value={d} checked={days === d} onChange={() => setDays(d)} className="peer sr-only" />
                    <span className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                      {durationShort(d)}
                    </span>
                  </label>
                ))}
              </div>
              {defaultDays !== undefined && <p className="mt-1.5 text-xs text-muted">Geschat op {durationShort(defaultDays)} op basis van het klantformulier.</p>}
            </fieldset>
          )}
          <div className="max-w-xs">
            <label htmlFor={`tech-${kind}`} className="mb-1.5 block text-sm font-medium">
              Monteur
            </label>
            <select
              id={`tech-${kind}`}
              name="technician"
              value={tech}
              onChange={(e) => {
                setTech(e.target.value);
                setTime("");
              }}
              className={field}
            >
              {technicians.map((t) => (
                <option key={t} value={t}>{techLabel(t)}</option>
              ))}
            </select>
          </div>

          {hints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hints.map((h) => (
                <button
                  key={h.date + h.label}
                  type="button"
                  onClick={() => {
                    setDate(h.date);
                    setTime("");
                  }}
                  className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm font-medium hover:border-brand hover:bg-brand-soft"
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium">Datum</p>
            <MonthPicker
              label={`Datum ${kind}`}
              value={date}
              today={today}
              marked={(d) => (availability[tech]?.[d]?.length ?? 0) > 0}
              onSelect={(d) => {
                setDate(d);
                setTime("");
              }}
            />
            <p className="mt-1.5 text-xs text-muted">Een stip betekent dat {techLabel(tech)} die dag nog vrije tijden heeft.</p>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">
              {date ? `Vrije tijden op ${dayLong(date)}` : `Vrije tijden van ${techLabel(tech)}`}
            </legend>
            {!date ? (
              <p className="text-sm text-muted">Kies eerst een datum.</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-amber-900">
                {techLabel(tech)} heeft op deze dag geen vrij moment.
                {next && ` Eerstvolgende vrije moment: ${dayShort(next.date)} om ${next.time}.`}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((t) => (
                  <label key={t} className="relative">
                    <input type="radio" name="time" value={t} checked={time === t} onChange={() => setTime(t)} className="peer sr-only" />
                    <span className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 font-medium peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                      {kind === "install" ? `${t}, ${durationShort(days)}` : t}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="max-w-xs">
            <label htmlFor={`own-time-${kind}`} className="mb-1.5 block text-sm font-medium">
              Of kies zelf een tijd
            </label>
            <TimeSelect id={`own-time-${kind}`} name="time_custom" placeholder="Geen eigen tijd" />
          </div>

          {isChange && (
            <label className="flex min-h-11 items-start gap-3 rounded-xl bg-brand-soft p-3 text-sm">
              <input type="checkbox" name="notify" className="mt-0.5 h-5 w-5 shrink-0" defaultChecked />
              <span>
                <strong>Stuur de wijziging naar de klant.</strong> Na het opslaan krijgt u een kant-en-klaar bericht voor WhatsApp of e-mail.
              </span>
            </label>
          )}

          {state?.error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {state.error}
            </p>
          )}
          <SubmitButton pending={pending} pendingText="Opslaan…">
            {submitLabel}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

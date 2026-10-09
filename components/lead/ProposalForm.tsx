"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions";
import { techLabel, type Availability, type Kind } from "@/lib/agenda";
import { dayLong, dayShort } from "@/lib/dates";
import { ActionForm } from "../ActionForm";
import { MonthPicker } from "../MonthPicker";
import { SubmitButton } from "../SubmitButton";
import { field } from "../ui";

/** De eigenaar kiest in een agenda tot drie vrije momenten; de klant kiest er één via een link. */
export function ProposalForm({
  action,
  kind,
  technicians,
  availability,
  today,
  from,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  kind: Kind;
  technicians: string[];
  availability: Availability;
  today: string;
  /** Eerste dag die in beeld komt (bijvoorbeeld de voorkeur van de klant) */
  from: string;
}) {
  const [tech, setTech] = useState(technicians[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [day, setDay] = useState("");

  const free = (d: string) => availability[tech]?.[d] ?? [];
  const toggle = (value: string) =>
    setPicked((p) => (p.includes(value) ? p.filter((x) => x !== value) : p.length < 3 ? [...p, value] : p));

  return (
    <ActionForm action={action} className="space-y-4">
      {({ state, pending }) => (
        <>
          <div className="max-w-xs">
            <label htmlFor={`ptech-${kind}`} className="mb-1.5 block text-sm font-medium">
              Monteur
            </label>
            <select
              id={`ptech-${kind}`}
              name="technician"
              value={tech}
              onChange={(e) => {
                setTech(e.target.value);
                setPicked([]);
                setDay("");
              }}
              className={field}
            >
              {technicians.map((t) => (
                <option key={t} value={t}>{techLabel(t)}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Kies een dag in de agenda</p>
            <MonthPicker
              label={`Voorstel ${kind}`}
              value={day || (from > today ? from : "")}
              today={today}
              marked={(d) => free(d).length > 0}
              allowed={(d) => free(d).length > 0}
              onSelect={setDay}
            />
            <p className="mt-1.5 text-xs text-muted">Alleen dagen met een stip zijn te kiezen: daar heeft {techLabel(tech)} nog vrije tijden.</p>
          </div>

          {day && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Tijden op {dayLong(day)}</legend>
              <div className="flex flex-wrap gap-2">
                {free(day).map((t) => {
                  const value = `${day}|${t}`;
                  const on = picked.includes(value);
                  const full = !on && picked.length >= 3;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      disabled={full}
                      onClick={() => toggle(value)}
                      className={`min-h-11 rounded-xl border px-4 text-sm font-medium disabled:opacity-40 ${
                        on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:border-brand"
                      }`}
                    >
                      {kind === "install" ? "Hele dag" : t}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium">
              Gekozen voor de klant <span className="font-normal text-muted">({picked.length} van maximaal 3)</span>
            </p>
            {picked.length === 0 ? (
              <p className="text-sm text-muted">Nog niets gekozen.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {picked.map((p) => {
                  const [d, t] = p.split("|");
                  return (
                    <li key={p} className="flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 text-sm font-medium text-brand-strong">
                      <input type="hidden" name="slot" value={p} />
                      {dayShort(d)} {kind === "install" ? "hele dag" : t}
                      <button type="button" onClick={() => toggle(p)} aria-label={`${dayShort(d)} ${t} verwijderen`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white">
                        <span aria-hidden="true">✕</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {state?.error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {state.error}
            </p>
          )}
          <SubmitButton variant="secondary" pending={pending} pendingText="Maken…">
            Voorstel maken
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

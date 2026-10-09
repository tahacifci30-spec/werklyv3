"use client";

import { useMemo } from "react";
import { PART_LABEL, addDays, dayShort, workdaysFrom, ymd } from "@/lib/dates";
import type { DayChoice, DayPart } from "@/lib/types";

/** Kies een dag (komende werkdagen) en een dagdeel. Geen losse datuminvoer nodig. */
export function WhenPicker({
  label,
  value,
  onChange,
  exclude,
  startInDays = 1,
  count = 10,
}: {
  label: string;
  value?: DayChoice;
  onChange: (v: DayChoice | undefined) => void;
  exclude?: string;
  /** Eerste dag die te kiezen is, in dagen vanaf vandaag */
  startInDays?: number;
  /** Aantal werkdagen dat te kiezen is */
  count?: number;
}) {
  const days = useMemo(
    () => workdaysFrom(addDays(ymd(new Date()), startInDays), count).filter((d) => d !== exclude),
    [exclude, startInDays, count],
  );
  const parts: DayPart[] = ["morning", "afternoon", "any"];
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label={`${label}: dag`}>
        {days.map((d) => {
          const on = value?.date === d;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? undefined : { date: d, part: value?.part ?? "any" })}
              className={`min-h-11 rounded-xl border px-1 text-sm font-medium ${
                on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:border-brand"
              }`}
            >
              {dayShort(d)}
            </button>
          );
        })}
      </div>
      {value && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`${label}: dagdeel`}>
          {parts.map((p) => {
            const on = value.part === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, part: p })}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                  on ? "border-brand bg-brand-soft text-brand-strong" : "border-slate-300 bg-white hover:border-brand"
                }`}
              >
                {p === "any" ? "Maakt niet uit" : p === "morning" ? "Ochtend" : "Middag"}
              </button>
            );
          })}
        </div>
      )}
      {value && (
        <p className="mt-1 text-xs text-muted">
          Gekozen: {dayShort(value.date)}, {PART_LABEL[value.part]}
        </p>
      )}
    </div>
  );
}

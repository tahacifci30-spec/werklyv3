import { UNKNOWN } from "../types";

export type Option = { id: string; label: string; hint?: string };

export type Question = {
  id: string;
  title: string;
  help?: string;
  options: Option[];
};

const dontKnow: Option = { id: UNKNOWN, label: "Weet ik niet" };

export const QUESTIONS: Record<string, Question> = {
  spaces: {
    id: "spaces",
    title: "Waar wilt u een airco?",
    options: [
      { id: "living", label: "Woonkamer" },
      { id: "bedroom", label: "Slaapkamer" },
      { id: "living_bedroom", label: "Woonkamer en slaapkamer" },
      { id: "multiple", label: "Meerdere ruimtes", hint: "3 of meer" },
      dontKnow,
    ],
  },
  area: {
    id: "area",
    title: "Hoe groot is de ruimte ongeveer?",
    help: "Bij meerdere ruimtes: de grootste ruimte.",
    options: [
      { id: "lt20", label: "Minder dan 20 m²" },
      { id: "20_30", label: "20 tot 30 m²" },
      { id: "30_40", label: "30 tot 40 m²" },
      { id: "gt40", label: "Meer dan 40 m²" },
      dontKnow,
    ],
  },
  property: {
    id: "property",
    title: "In wat voor woning komt de airco?",
    options: [
      { id: "terraced", label: "Rijtjeswoning" },
      { id: "corner", label: "Hoekwoning of twee-onder-een-kap" },
      { id: "detached", label: "Vrijstaande woning" },
      { id: "apartment", label: "Appartement" },
      dontKnow,
    ],
  },
  outdoor: {
    id: "outdoor",
    title: "Waar kan de buitenunit komen?",
    help: "Dat is het kastje aan de buitenkant van de woning.",
    options: [
      { id: "facade", label: "Aan de gevel" },
      { id: "balcony", label: "Op het balkon" },
      { id: "roof", label: "Op het platte dak" },
      { id: "ground", label: "Op de grond in de tuin" },
      dontKnow,
    ],
  },
  // Alleen bij meerdere ruimtes
  system: {
    id: "system",
    title: "Welke opstelling heeft uw voorkeur?",
    help: "Eén buitenunit voor alle ruimtes, of een eigen unit per ruimte.",
    options: [
      { id: "multisplit", label: "Eén buitenunit", hint: "Voor alle ruimtes samen" },
      { id: "separate", label: "Een eigen unit per ruimte", hint: "Losse units" },
      dontKnow,
    ],
  },
  // Alleen bij één ruimte
  existing: {
    id: "existing",
    title: "Is er al een airco of leidingwerk aanwezig?",
    options: [
      { id: "none", label: "Nee, een nieuwe installatie" },
      { id: "replace", label: "Ja, een airco vervangen" },
      { id: "piping", label: "Ja, het leidingwerk ligt er al" },
      dontKnow,
    ],
  },
};

export const TOTAL_QUESTIONS = 5;

const MULTI = new Set(["living_bedroom", "multiple"]);

/**
 * Vaste routing: welke vraag volgt op de huidige antwoorden?
 * De opties staan vast in QUESTIONS; er wordt niets gegenereerd.
 * Geeft null terug wanneer het formulier klaar is.
 */
export function nextQuestion(answers: Record<string, string>): Question | null {
  if (!answers.spaces) return QUESTIONS.spaces;
  if (!answers.area) return QUESTIONS.area;
  if (!answers.property) return QUESTIONS.property;
  if (!answers.outdoor) return QUESTIONS.outdoor;
  if (MULTI.has(answers.spaces)) {
    return answers.system ? null : QUESTIONS.system;
  }
  return answers.existing ? null : QUESTIONS.existing;
}

export function isComplete(answers: Record<string, string>) {
  return nextQuestion(answers) === null;
}

export function optionLabel(questionId: string, optionId: string | undefined) {
  if (!optionId) return "–";
  return (
    QUESTIONS[questionId]?.options.find((o) => o.id === optionId)?.label ??
    optionId
  );
}

/** Alle geldige antwoorden, gebruikt voor validatie op de server. */
export function isValidAnswer(questionId: string, optionId: string) {
  return !!QUESTIONS[questionId]?.options.some((o) => o.id === optionId);
}

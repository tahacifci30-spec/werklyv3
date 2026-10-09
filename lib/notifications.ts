import type { Lead } from "./types";

/**
 * Meldingen voor de eigenaar: alles wat klanten en monteurs doen, waardoor een aanvraag van fase verandert.
 * Ze komen uit het logboek van de aanvragen, dus er is geen aparte opslag nodig.
 */
export type NoticeKind = "nieuw" | "akkoord" | "afgewezen" | "moment" | "terugbellen" | "afgerond" | "afgemeld";
export type Notice = { id: string; at: string; leadId: string; tab: string; kind: NoticeKind; title: string; text: string };

const RULES: { test: (t: string) => boolean; kind: NoticeKind; tab: string; title: (name: string) => string }[] = [
  { test: (t) => t === "Klant heeft het formulier ingevuld", kind: "nieuw", tab: "overview", title: (n) => `Nieuwe aanvraag van ${n}` },
  { test: (t) => t.startsWith("Klant is akkoord"), kind: "akkoord", tab: "afspraken", title: (n) => `${n} is akkoord met de offerte` },
  { test: (t) => t.startsWith("Klant heeft de offerte afgewezen"), kind: "afgewezen", tab: "offerte", title: (n) => `${n} heeft de offerte afgewezen` },
  { test: (t) => t.startsWith("Klant koos"), kind: "moment", tab: "afspraken", title: (n) => `${n} heeft een moment gekozen` },
  { test: (t) => t.startsWith("Klant past geen van de voorgestelde momenten"), kind: "terugbellen", tab: "afspraken", title: (n) => `${n} wil teruggebeld worden` },
  { test: (t) => t.startsWith("Bezoek afgerond door") || t.startsWith("Installatie afgerond door"), kind: "afgerond", tab: "overview", title: (n) => `Klus bij ${n} afgerond door de monteur` },
  { test: (t) => / kan niet op /.test(t), kind: "afgemeld", tab: "afspraken", title: (n) => `Monteur kan niet bij ${n}` },
];

export function notices(leads: Lead[], limit = 60): Notice[] {
  const out: Notice[] = [];
  for (const l of leads) {
    l.log.forEach((e, i) => {
      const rule = RULES.find((r) => r.test(e.text));
      if (rule) out.push({ id: `${l.id}-${i}`, at: e.at, leadId: l.id, tab: rule.tab, kind: rule.kind, title: rule.title(l.customer.name), text: e.text });
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/**
 * Ongelezen: nieuwer dan "alles gelezen" en nog niet los geopend. Nog nooit iets gelezen: alleen de laatste week,
 * zodat oude voorbeelddata geen stapel meldingen geeft.
 */
export function isUnread(n: Notice, seenAt?: string, read: string[] = []) {
  const since = seenAt ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  return n.at > since && !read.includes(n.id);
}

export const unreadCount = (leads: Lead[], seenAt?: string, read: string[] = []) =>
  notices(leads, 999).filter((n) => isUnread(n, seenAt, read)).length;

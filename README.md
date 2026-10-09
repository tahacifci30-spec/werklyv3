# Werkly

Van aanvraag tot factuur: klantformulier met richtlijnofferte, overzicht, agenda, monteur, offerte, factuur en omzet.

```bash
npm run dev
```

## Verloop

Nieuw > bezoek gepland > offerte controleren > offerte verstuurd > installatie plannen > installatie gepland >
factuur opstellen > wacht op betaling > afgerond (of afgewezen).

- De klant kiest in het formulier een voorkeursmoment. Past dat niet, dan stelt de eigenaar tot 3 vrije momenten voor
  (uit de agenda) en kiest de klant er één via een link.
- De monteur kan een afspraak afmelden ("Ik kan niet"). De eigenaar krijgt een melding bovenaan het overzicht.
- Na het bezoek staat de conceptofferte direct klaar. Na de installatie staat de conceptfactuur klaar, inclusief meerwerk.
- Omzet telt mee zodra een factuur als betaald is gemarkeerd.

## Pagina's

| Route | Wat |
|---|---|
| `/` | Website |
| `/intake` | Klantformulier (5 vragen, richtlijnofferte, voorkeursmoment) |
| `/login` | Inloggen (demo-accounts staan op de pagina, alleen in development) |
| `/dashboard`, `/dashboard/[id]` | Eigenaar: acties, aanvragen, dossier met afspraken, offerte, factuur |
| `/overons` | Over ons: het team |
| `/dashboard/agenda` | Agenda: klik op een dag voor een popup om iets toe te voegen of te wijzigen; weekrooster en ziekmelden |
| `/dashboard/revenue` | Omzet per dag, week, maand en jaar |
| `/dashboard/revenue/openstaand` | Nog te ontvangen: onbetaalde facturen met herinnering |
| `/dashboard/settings` | Bedrijf, factuurgegevens, prijsregels, link en code van het formulier |
| `/technician/agenda` | Monteur: eigen agenda en niet-beschikbare dagen |
| `/technician`, `/technician/[id]` | Monteur: afspraken, checklist bezoek, installatieverslag |
| `/offerte/[token]`, `/factuur/[token]`, `/afspraak/[token]` | Publieke links voor de klant |

## Structuur

- `lib/intake/questions.ts`: vragen en routing (vaste opties)
- `lib/pricing/`: prijsregels en berekening (geen AI)
- `lib/workflow.ts`: statussen en volgende actie
- `lib/agenda.ts`: afspraken en beschikbaarheid per monteur
- `lib/revenue.ts`, `lib/metrics.ts`: omzet en kerncijfers
- `lib/store.ts`: opslag; `store-file.ts` (JSON-bestand) of `store-supabase.ts` (zodra `SUPABASE_SERVICE_ROLE_KEY` is gezet)
- `lib/auth.ts`: sessie (nu ondertekende cookie met demo-gebruikers)
- `app/actions.ts`: alle server actions
- `components/ActionForm.tsx`: formulier dat invoer behoudt bij een fout
- `scripts/build-brand.py`: maakt de logo's in `public/brand/` (`/brand/index.html` is de merkpresentatie)

## Supabase

Voer in de SQL Editor, in deze volgorde, uit: `0001_init.sql`, `0002_storage_and_demo.sql`, `0003_new_flow.sql`, `0004_agenda_and_more.sql`, `0005_agenda_description.sql`
(allemaal in `supabase/migrations/`). Zet daarna in `.env.local` of bij Netlify:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (geheim, geen `NEXT_PUBLIC_`)
- `AUTH_SECRET` (lange willekeurige tekst) en `DEMO_PASSWORD` (online verplicht, anders staat inloggen uit)

Voer `0003`, `0004` en `0005` uit **voordat** u deze versie publiceert, anders mist de database de nieuwe kolommen.
Nog niet in Supabase: inloggen (cookie met demo-gebruikers; tabel `profiles` en policies staan klaar voor Supabase Auth).

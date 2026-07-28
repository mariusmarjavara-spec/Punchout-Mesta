# Deployment — hostingmodell (Oppgave 4)

## Oppdatering — Execution Sprint 4, Oppgave 1/2

Denne rapportens kjernefunn under ("dette repoet har ALDRI hatt en vellykket produksjonsbygg
bekreftet noe sted") er **rettet**: `npm run build` ble kjørt direkte i Execution Sprint 4 og
**lyktes**, i et miljø med internettilgang. Sandkasse-miljøet som skrev denne rapporten hadde
ingen utgående internettilgang, og appen bruker `next/font/google` (`app/layout.tsx`), som
trenger nettverk ved byggetidspunktet — feilen var miljøspesifikk, ikke et reelt produktfunn.
`npm run start` og en manuelt bygget `.next/standalone`-server (se `Dockerfile`) er begge
bekreftet å faktisk serve appen, inkludert `/api/health` og statiske filer (`/motor.js`).

Punkt 1 i sjekklisten under ("Skriv en standard Next.js Dockerfile") er nå gjort — se
`Dockerfile` og `fly.toml` i repo-roten, og `docs/deploy-runbook.md` for full prosedyre. Punkt 4
("Bekreft next build faktisk fullfører") er nå bekreftet. Punktene 2 og 3 (faktisk volum,
faktisk hemmelighet) og selve deployet krever fortsatt reell Fly.io-/Railway-tilgang som ikke
finnes i noe miljø disse rapportene er skrevet i — `Dockerfile`/`fly.toml` er reviderte,
bygg-verifiserte artefakter, ikke et bekreftet, kjørende deploy.

## Beslutning

**Fly.io (eller likeverdig: Railway) — en tradisjonell, langlevende prosess med persistent volum. Ikke Vercel eller annen serverless-plattform.**

## Begrunnelse

Denne sprinten arbeider under en eksplisitt regel: **arkitekturen er frosset**. `lib/backend/persistence.mjs` lagrer all backend-tilstand (Runtime Store, eksportlogg, telemetrilogg, enhetsregister) i én lokal JSON-fil via write-temp-then-rename. Dette er riktig og tilstrekkelig arkitektur for en pilot av denne størrelsen — **forutsatt at hostingmiljøet faktisk gir prosessen en vedvarende, lokal disk mellom kall.**

Serverless-plattformer (Vercel er det mest nærliggende valget gitt eksisterende `@vercel/analytics`-avhengighet) gir **ikke** dette. En serverless-funksjon får et ferskt, tomt filsystem ved hver kalde start; data skrevet til lokal disk kan forsvinne når som helst mellom to kall. Å velge Vercel ville TVINGE frem nøyaktig den typen persistens-omskriving tidligere revisjoner har identifisert som det ENESTE punktet der "frosset arkitektur"-premisset kan briste.

Fly.io og Railway kjører derimot en ordinær, langlevende Node-prosess (`next start`) med et ekte, persistent volum montert på disk — identisk med hvordan hvert eneste testscript i dette engasjementet allerede har verifisert systemet fungerer (`next dev` lokalt, én datamappe, restart-bevist gjentatte ganger). **Null kodeendring kreves.**

## Sammenligning

| | Fly.io / Railway (valgt) | Vercel |
|---|---|---|
| Persistent lokal disk | Ja, ekte volum | Nei — serverless, /tmp er flyktig |
| Krever endring av `lib/backend/persistence.mjs` | **Nei** | Ja — hele persistensmodellen må byttes til en ekstern tjeneste |
| Matcher allerede verifisert oppførsel (`next dev` + lokal fil) | Ja, identisk modell | Nei |
| Kostnad for en 5–10 brukers pilot | Lav (hobby/liten instans-tier) | Lav, men irrelevant gitt persistens-problemet |
| Enkel rollback av et dårlig kode-deploy | Ja (deploy-historie) | Ja (bedre verktøystøtte), men avveies mot persistens-problemet |
| HTTPS | Automatisk (Let's Encrypt via platformen) | Automatisk |

## Hva som faktisk trengs for å utføre deployet (ikke gjort denne sprinten)

Jeg har **ikke** skrevet en `Dockerfile`, `fly.toml` eller tilsvarende i denne sprinten. Dette er en bevisst beslutning, ikke en forglemmelse: jeg har verken Docker, en Fly.io-/Railway-konto, eller internettilgang i dette miljøet til å faktisk bygge eller verifisere en slik konfigurasjon. Å committe en fil jeg ikke kan teste ville brutt denne sprintens eget prinsipp — "dokumenter kun ting du faktisk har verifisert."

Det en person med reell tilgang trenger å gjøre:
1. Skriv en standard Next.js `Dockerfile` (offisielt Next.js-eksempel med `output: "standalone"` i `next.config` er godt utgangspunkt — verifiser at build faktisk lykkes i et miljø MED internettilgang, se `next build`-funnet under).
2. Definer et persistent volum montert på stien `PUNCHOUT_DATA_DIR` peker til.
3. Sett `PUNCHOUT_ADMIN_TOKEN` som en ekte hostinghemmelighet (aldri i kode, aldri i et Dockerfile-lag).
4. Bekreft `next build` faktisk fullfører i det valgte CI/build-miljøet — dette repoet har ALDRI hatt en vellykket produksjonsbygg bekreftet noe sted; det eneste forsøket (i dette isolerte sandkassemiljøet, som mangler all utgående internettilgang) feilet på å hente Google Fonts. Sannsynligvis et ikke-problem i et normalt miljø, men ubekreftet.
5. Kjør `lib/backend/smoke-test.mjs` mot den faktiske URL-en umiddelbart etter første deploy, og etter hvert påfølgende deploy.

## Konsekvens hvis denne beslutningen reverseres senere (f.eks. skalering krever serverless)

Dette ble allerede forhåndsdesignet for i Phase 11: kun de to funksjonene i `lib/backend/persistence.mjs` (`loadPersistedState`/`persistState`) trenger å endres — resten av `state.mjs` og samtlige API-ruter forblir urørt, siden de kun kaller disse to funksjonene. Det er en avgrenset endring, ikke en arkitekturomskriving, men den bør bevisst UNNGÅS for selve piloten ved å velge riktig host nå.

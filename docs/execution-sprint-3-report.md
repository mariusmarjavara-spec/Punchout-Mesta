# Execution Sprint 3 — Pilot UX Hardening: sluttrapport

Sprint mot funnene i `docs/pilot-human-factors-validation.md`. Motoren
(`public/motor.js`), Completion Engine (`lib/engine/*`), Runtime
(`lib/runtime/*`) og adapterplattformen (`lib/adapters/*`) er uendret
gjennom hele sprinten — verifisert etter hver oppgave med
`git diff --stat` mot disse banene (tomt resultat hver gang, se
commit-historikk `fe2d331..c0bc5f8`).

## Implementerte endringer

| Oppgave | Status | Filer |
|---|---|---|
| 1. Påkrevd-konsistens | ✅ Implementert | `start-day-phase.tsx`, `lib/pilot-ux/required-schemas.mjs` |
| 2. Korrigeringsflyt | ✅ Implementert | `operations-phase.tsx`, `completion-screen.tsx`, `lib/pilot-ux/lock-reason.mjs` |
| 3. Offline-/synkstatus | ✅ Implementert | `hooks/use-online-status.ts`, `lib/pilot-ux/sync-status.mjs`, `operations-phase.tsx` |
| 4. Tale pre-flight | ✅ Implementert | `start-day-phase.tsx`, `operations-phase.tsx` |
| 5. Konfigurerbar terminologi | ❌ **Utsatt** | Se "Oppgave 5" under |
| 6. Små UX-forbedringer | ✅ Implementert | `storage-error-overlay.tsx`, `stale-day-banner.tsx`, `handrens-phase.tsx` |
| 7. UX-telemetri | ✅ Implementert | `lib/telemetry/ux-events.mjs`, `types.mjs`, 6 kallsteder |
| 8. Regresjon | ✅ Verifisert etter hver oppgave + samlet til slutt | — |

### Oppgave 1 — Påkrevd-konsistens

`continueFromPreDay()` i `motor.js` (linje 2245–2261) **blokkerer faktisk
allerede** i React-modus når et skjema er markert påkrevd og ubekreftet —
det er ikke kosmetikk. Men `ADMIN_CONFIG.requiredSchemas` (linje 60) er
en hardkodet, tom array i den frosne filen, uten noen konfigureringsvei
inn i den — så i dagens faktiske deploy er **ingenting** noensinne
påkrevd, og React-siden fikk null tilbakemelding når blokkeringen (som
aldri trigges i praksis i dag) inntreffer. Fikset ved å sjekke
påkrevd-og-ubekreftede skjema klientsidig (data motoren allerede
eksponerer) før `continueFromPreDay()` kalles, og vise en tydelig
forklaring i stedet for en stille no-op.

**Viktig, ærlig presisering**: denne fiksen er korrekt og klar for bruk,
men **inaktiv i dagens standardkonfigurasjon** — siden ingenting kan
markeres påkrevd uten å redigere `motor.js` (frosset), kan ingen
pilotbruker faktisk møte "Påkrevd"-inkonsistensen slik
Human Factors-rapporten simulerte den, før noen får et
konfigureringsverktøy for `ADMIN_CONFIG.requiredSchemas` — noe som
selv krever en fremtidig, åpen motor.js-endring.

### Oppgave 2 — Korrigeringsflyt

Låste oppføringer var tidligere helt inerte (ingen klikk-handler i det
hele tatt). Nå åpner et trykk et panel som forklarer *hvorfor* (via ny
`describeLockReason()`, samme flagg-lesing som den eksisterende
statusetiketten) og tilbyr "Logg rettelse" — forhåndsutfyller det
eksisterende tekstfeltet med en fast konvensjon
(`Rettelse til kl HH:MM: `) og sender via eksisterende
`motor.submitEntry()`. Append-only: originaloppføringen røres aldri.

### Oppgave 3 — Offline-/synkstatus

`outboxStatus` var allerede beregnet og live i `MotorSnapshot`, men vist
ingen steder under aktivt arbeid. Ny `useOnlineStatus()`-hook +
`deriveSyncStatus()` gir en diskret pill i Operations-headeren, skjult
når alt er synkronisert. **4 tilstander, ikke 5**: motor.js's
`getOutboxStatus()` slår sammen "venter" og "sender" til ett tall — de
kan ikke skilles uten en motor.js-endring, dokumentert i koden i stedet
for å late som distinksjonen finnes.

### Oppgave 4 — Tale pre-flight

Alle 3 mikrofon-triggerpunkter sjekker nå `navigator.onLine` før
`motor.toggleVoice()` kalles, og viser "Tale krever nettforbindelse"
umiddelbart fremfor en forsinket, reaktiv feilmelding etter at
mikrofonen allerede åpnet.

### Oppgave 5 — Konfigurerbar terminologi (UTSATT)

Planen antok at `public/punchout-config.js` passerte generisk gjennom
til React. Ved faktisk lesing av `motor.js:47-59` viste
`normalizeConfig()` seg å være en streng allow-list (kun `lonnskoder`,
`sjaDefaults`, `kjoretoy`, `externalLinks`, `hoofdordre`) — et nytt
`labels`-felt ville blitt stille forkastet uten en endring i denne
frosne funksjonen. **Stoppet umiddelbart per instruks**, forklart for
bruker, som valgte å utsette hele oppgaven fremfor å bruke unntak eller
omgåelse. Ingen kode er skrevet for denne oppgaven. Vokabular-gapet for
VA/elektro/kommunal drift (dokumentert i Human Factors-rapporten) er
**uendret** av denne sprinten.

### Oppgave 6 — Små UX-forbedringer

- Rå JS-feilmelding i `storage-error-overlay.tsx` skjult bak "Vis
  detaljer" — fast, vennlig tekst vises som standard.
- Stille "X"-dismiss fjernet fra `stale-day-banner.tsx` — bruker må
  velge en av de 3 reelle handlingene.
- Forklarende enkeltlinjer lagt til for "Lønnskoder" og
  "Hovedtimeføring" i `handrens-phase.tsx`.

### Oppgave 7 — UX-telemetri

`emitTelemetry()` i motor.js er privat og ikke eksponert på
`window.Motor`. Ny, parallell `lib/telemetry/ux-events.mjs`
(egen `localStorage`-nøkkel, egen synk-løkke mot eksisterende
`/api/telemetry`, ingen backend-endring) logger 6 anonyme hendelser
(ingen bruker-/enhets-ID): `RequiredSchemaBlocked`, `VoiceBlockedOffline`
(×2 skjermer), `OfflineStateObserved`, `CorrectionAttempted`,
`ExportFailureShown`, `ManualCancel`.

## Nye tester

12 nye regresjonstester i `lib/regression/pilot-ux-cases.mjs` (ren
funksjonstesting av `getUnconfirmedRequiredSchemas`,
`describeLockReason`, `deriveSyncStatus`, og SSR-sikkerheten til
`ux-events.mjs`) — kjøres av `npm test` sammen med alle eksisterende
suiter. 70 caser totalt, alle grønne gjennom hele sprinten. Ingen
jsdom/testing-library i dette repoet (bekreftet), så all ny
komponent-logikk som trengte testdekning ble bevisst hentet ut i rene
funksjoner fremfor forsøkt testet via komponent-rendering.

## Oppgave 9 — Human Factors Replay

Samme 20 personaer, ingen nye. Fokus på de som var direkte berørt av de
5 opprinnelige funnene.

| Persona | Funn | Endring | Frustrasjon før→etter | Trygghet før→etter |
|---|---|---|---|---|
| Kim, 19 (sommerhjelp) | #1 | Ville ikke lenger oppleve inkonsistensen — **men kunne heller ikke i utgangspunktet**, se presisering under Oppgave 1 | 3→3 (uendret i praksis) | 4→4 |
| Silje, 31 (prosjektleder) | #1 | Samme presisering — hennes bekymring ("er dette pilotklart?") er nå kodenivå-adressert, men ikke observerbar i dagens deploy | 5→5 (uendret i praksis) | 6→6 |
| Aisha, 23 (ny maskinfører) | #2 | Direkte og reell: får nå se hvorfor oppføringen er låst og en klar "Logg rettelse"-vei i stedet for panikk | 7→4 | 4→6 |
| Odd, 61 (lite teknisk) | #2, #6 | Korrigeringspanelet er der, men hans kjerneproblem (frykt, ikke feilrettingsbehov) adresseres mer av håndrens-forklaringene og den vennligere lagringsfeilteksten enn av #2 spesifikt | 8→7 | 2→3 |
| Kristin, 52 (jernbane) | #3, #4 | Sterkest berørt: ser nå "Lagret lokalt"/"Synkroniserer…" i stedet for total stillhet, og får "Tale krever nettforbindelse" proaktivt i stedet for gjentatte mislykkede forsøk | 6→3 | 4→7 |
| Fatima, 33 (havn) | #3 | De 2 stille tapte taleregistreringene ville nå vært synlige via sync-pillen mens hun jobber | 4→3 | 6→7 |
| Patrick, 24 (fiber) | #3, #4 | Slipper å forlate jobb uten å vite om eksporten gikk gjennom; slipper gjentatte mikrofontrykk i dårlig dekning | 6→4 | 6→7 |
| Roger, 28 (asfalt) | #4 | Får umiddelbar forklaring i stedet for uforklart feil ved tale offline — liten, men reell forbedring for en allerede trygg bruker | 2→1 | 8→8 |
| Wenche, 39 (formann) | Ingen | Ingen av de 6 leverte oppgavene adresserer formannens manglende lederverktøy (var alltid utenfor scope for denne sprinten) | 6→6 | 5→5 |
| Geir, 45 (Nordkraft) | #1 | Samme presisering som Kim/Silje — hans prinsipielle bekymring om myk håndheving i sikkerhetskritisk kontekst er kodenivå-forberedt, ikke observerbart endret | 4→4 | 5→5 |
| Nora, 29 (VA) | #5 | **Ingen endring** — Oppgave 5 utsatt | 7→7 | 6→6 |
| Ingrid, 38 (elektro) | #5 | **Ingen endring** | 6→6 | 5→5 |
| Camilla, 36 (kommunal) | #5, #6 | Vokabular uendret, men håndrens-forklaringene reduserer noe av forvirringen rundt lønnskoder | 4→3 | 6→6 |

**Lykkes flere på første dag?** For de fire org-dekkede bransjene
(anlegg, havn, jernbane, kraft): ja, spesielt for feltarbeidere i
dekningsutsatte områder (Kristin, Fatima, Patrick) og for nybegynnere
som gjør en tastefeil (Aisha). **Trenger færre hjelp?** Delvis — Odd
trenger fortsatt aktiv oppfølging (hans barriere er ikke løst av denne
sprinten), men den vennligere lagringsfeilteksten og håndrens-forklaring
reduserer noe av friksjonen som førte til hjelpebehov. **Reduseres
frustrasjon, øker trygghet?** Ja, målbart for personaene direkte truffet
av #2/#3/#4 (Aisha, Kristin, Fatima, Patrick) — **ikke** for #1-personaene
(Kim, Silje, Geir) fordi mekanismen forblir inaktiv i dagens
konfigurasjon, og **ikke** for #5-personaene (Nora, Ingrid, Camilla)
fordi den oppgaven ble utsatt.

## Oppgave 10 — Pilot Readiness Review

**Er de to kritiske UX-problemene løst?**
- Problem #2 (ingen korrigeringsvei): **Ja**, reelt og aktivt i alle
  fire org-segmenter fra dag én.
- Problem #1 (Påkrevd-inkonsistens): **Delvis.** Koden er nå korrekt og
  konsistent — men siden ingenting kan markeres påkrevd i dagens
  deploy uten en frosset motor.js-endring, er problemet reelt sett
  **fortsatt uobserverbart, ikke løst i praksis**. Dette er ærlig en
  "fikset, men inaktiv funksjon", ikke en "fikset, aktiv funksjon".

**Er offline-opplevelsen forståelig?** Ja, for aktivt arbeid — pillen
dekker de fire tilstandene dataene faktisk støtter. Ikke verifisert
visuelt i nettleser denne sprinten (se "Manuell gjennomgang" under).

**Er talefunksjonen forutsigbar?** Ja for nettverksfeil spesifikt
(proaktivt blokkert med tydelig melding). **Nei** for feilhørt tale —
det finnes fortsatt ingen korreksjonssteg for fritekst uten
ordre-mønster; dette var aldri en av de to kritiske problemene og er
bevisst ikke adressert denne sprinten.

**Oppleves systemet mer tillitvekkende?** Sannsynligvis ja for de fire
org-segmentene, basert på replay-analysen over — men dette er en
begrunnet vurdering, ikke en målt en; en reell pilot med telemetrien fra
Oppgave 7 vil kunne bekrefte eller avkrefte dette med tall.

**Finnes det nye UX-risikoer?** Ja, fire verdt å følge med på:
1. Korrigeringsflyten er en **tekstkonvensjon**, ikke en strukturell
   kobling — en bruker kan slette forhåndsutfylt tekst og miste
   referansen til originaloppføringen.
2. Sync-status-pillen er et nytt UI-element brukere må lære — kan i
   seg selv bli en kilde til "hva betyr denne?"-spørsmål.
3. Oppgave 1s fiks gir **null umiddelbar pilotgevinst** under dagens
   konfigurasjon (se over) — risiko for at noen antar problemet er
   løst i praksis når det bare er løst i kode.
4. Stale-day-banneret er nå "klissete" (kan ikke skjules uten å
   velge) — riktig avveining for å tvinge en avgjørelse, men bør følges
   med på om det oppleves påtrengende i situasjoner brukeren ikke er
   klar til å avgjøre med det samme.

## Manuell gjennomgang — gjennomført delvis

Dev-server startet rent, Turbopack kompilerte alle nye filer (inkl.
`.mjs`-imports med `@ts-ignore` og den nye `.ts`-hooken) uten feil, og
serverte `HTTP 200` konsekvent. **Ingen `chromium-cli` eller Playwright
var tilgjengelig i dette Windows-miljøet** uten å installere nye
avhengigheter, noe som ble vurdert som utenfor sprintens "ikke gjør
opportunistiske ting"-prinsipp for en engangs-røyktest. En faktisk
klikk-gjennom med skjermbilder av de nye elementene (blokkeringsmelding,
korrigeringspanel, synk-pill, tale-offline-melding) er derfor **ikke**
utført. Anbefales gjort manuelt (eller med en `/run-skill-generator`-
generert prosjektskill) før pilotstart.

## Gjenværende UX-risiko

- Oppgave 5 (terminologi) er utsatt — vokabular-gapet for de 6
  bransjene uten org-pakke er uendret fra forrige rapport.
- Oppgave 1s fiks er kodemessig korrekt, men inaktiv — ingen reell
  risikoreduksjon i dagens konfigurasjon, kun beredskap for fremtiden.
- De fire nye UX-risikoene fra Oppgave 10 over.
- Ingen faktisk browser-klikk-gjennom denne sprinten (se over).

## Supportrisiko

Forventet nedgang i "kom dataene mine frem?"-henvendelser (Oppgave 3)
og "jeg gjorde en feil, kan noen rette den?"-henvendelser (Oppgave 2,
delvis — brukeren kan fortsatt trenge hjelp til å *finne* funksjonen
første gang). Uendret: "hva betyr lønnskode?"-henvendelser reduseres
noe (Oppgave 6), men elimineres ikke. Uendret: bransjer uten org-pakke
vil fortsatt generere "dette er ikke bygget for oss"-tilbakemeldinger
(Oppgave 5 utsatt).

## UX Readiness Score: 7,5 / 10 (opp fra 6,5)

Begrunnelse: to av de fem opprinnelige gjennomgående mønstrene er nå
reelt og aktivt adressert (korrigeringsvei, offline-synlighet), ett er
delvis adressert (tale-offline), ett er kodemessig korrekt men inaktiv i
praksis (påkrevd-inkonsistens), og ett er uendret (vokabular). Poenget
holdes under 8 fordi den manuelle browser-verifikasjonen er ufullstendig
og fordi Oppgave 1s reelle effekt i dagens deploy er null.

## Pilot Readiness Score: 7,5 / 10 for de fire eksisterende
## org-segmentene (uendret 7/10 utenfor dem)

For Mesta/Nordhavn/Banenord/Nordkraft: klar forbedring fra forrige
rapport — de to mest konkrete brukerfrustrasjonene (låste feil, usynlig
synk) er reelt løst. For de 6 bransjene uten org-pakke: **uendret**,
siden Oppgave 5 ble utsatt nøyaktig som planlagt heller enn forsøkt løst
med en snarvei. Anbefaler en kort manuell klikk-gjennom (se "Manuell
gjennomgang") før pilotstart, siden denne sprintens verifikasjon er
kodenivå og ikke visuelt bekreftet.

## Anbefaling

Gå videre til pilot i de fire eksisterende org-segmentene. Ikke utvid
piloten til de 6 bransjene uten org-pakke uten en fremtidig sprint som
adresserer Oppgave 5 — noe som krever et bevisst valg om enten å åpne
`motor.js` for en additiv `normalizeConfig()`-utvidelse, eller bygge en
egen, dokumentert bypass-mekanisme. Vurder en liten oppfølgingssprint
som (a) gir administrator et konfigureringsverktøy for
`ADMIN_CONFIG.requiredSchemas` slik at Oppgave 1s fiks faktisk får
effekt, og (b) gjennomfører en reell browser-klikk-gjennom av alle seks
implementerte oppgaver før pilotstart.

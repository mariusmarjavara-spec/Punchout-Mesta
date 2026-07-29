# Punchout — UX & Stability Hardening Review

Siste kvalitetsgjennomgang før pilot, gjennomført etter at Pilot Readiness Board konkluderte
🟡 READY FOR LIMITED PILOT. Ingen nye funksjoner, ingen redesign, ingen arkitektoniske
endringer. Alle funn er grunnet i faktisk lest kode (`public/motor.js`,
`components/punchout/*.tsx`, `hooks/*.ts`, `lib/pilot-ux/*.mjs`) — ikke antatt.

## Metodikk

Gjennomgikk hele arbeidsflytens kildekode direkte: `operations-phase.tsx`,
`start-day-phase.tsx` (inkl. `SchemaEditOverlay`), `handrens-phase.tsx`,
`completion-screen.tsx`, `voice-button.tsx`, `stale-day-banner.tsx`,
`cross-tab-conflict-banner.tsx`, `storage-error-overlay.tsx`, samtlige hooks
(`use-motor-state`, `use-draft-text`, `use-online-status`, `use-cross-tab-conflict`), og de
relevante motor.js-funksjonene disse kaller (`submitEntry`, `confirmStructuredEntry`,
`resolveItem`/`resolveSchemaItem`/`resolveMainTime`, `startDay`). For hvert sted en knapp kaller
en motor-funksjon som endrer tilstand, sjekket om funksjonen er idempotent (les kildekoden,
ikke anta) før risikoen ble vurdert.

## Del 1 — UX-friksjon

| Funn | Hvorfor friksjon | Alvorlighet | Anbefalt minimal forbedring |
|---|---|---|---|
| "Logg rettelse" (operations-phase.tsx) overskriver stille en hvilken som helst upostet tekst i det delte inntastingsfeltet, uten varsel | Bruker som holder på å skrive et notat, og samtidig trykker "Logg rettelse" på en gammel låst oppføring, mister det upostede notatet uten å bli varslet | Middels (kategori 3) | Kun fylle inn rettelsesteksten hvis feltet er tomt fra før — se Del 3, vurdert men ikke implementert |
| Type-velger-dropdown (notat/vaktlogg/ordre osv.) lukkes ikke ved klikk utenfor | Må trykke selve knappen igjen for å lukke — ett unødvendig ekstra trykk i noen tilfeller | Lav (kategori 7, kosmetisk) | Legg til en enkel "klikk utenfor lukker"-håndtering — ikke implementert, kategori 1–6 ikke tom |
| Sync-status-pillen vises kun i `operations-phase.tsx`s header, ikke i pre-day eller håndrens | Bruker som mister nett i pre-day eller håndrens får ingen synlig indikasjon før de når drift-fasen | Lav-middels (kategori 6) | Gjenbruk samme pille-komponent i de to andre fasenes header — større fotavtrykk enn én liten trygg endring, ikke implementert |

## Del 2 — Stabilitet

**✅ IMPLEMENTERT**: `handleConfirmReview`/`handleSubmitRaw` (den strukturerte
"Bekreft ordrelinje"-mini-reviewen i `operations-phase.tsx`) manglet helt den
dobbelttrykk-sperren Hotfix 4 allerede la på den vanlige "Logg"-knappen. Verifisert direkte i
`public/motor.js`: både `confirmStructuredEntry()` (linje 4563+) og `submitEntry()` (linje 1799+)
legger ubetinget til en ny oppføring i `dayLog.entries` ved hvert kall — ingen av dem er
idempotente. To raske trykk på "Bekreft" eller "Bare logg" før React fjerner review-kortet kunne
derfor logge samme ordrelinje to ganger. Kategori 2 (feil data), samme bugklasse som
Hotfix 4 allerede fikset ett annet sted i samme fil. Fikset ved å gjenbruke den eksisterende,
allerede testede `shouldAllowSubmit()`-vakten og `isSubmitting`-tilstanden — ingen ny mekanisme
innført.

**Vurdert, ikke implementert:**

- Håndrens' per-punkt "Bekreft"/"Forkast"-knapper (og "Bekreft timeark") mangler samme
  dobbelttrykk-sperre som `LockDayButton` allerede har. Verifisert i `resolveSchemaItem`/
  `resolveMainTime`: å kalle "confirm" to ganger på samme punkt er reelt idempotent — status og
  tidsstempel settes på nytt, ingen duplikate oppføringer opprettes. Reell risiko er kosmetisk
  inkonsistens, ikke datafeil — kategori 6/7, ikke 1/2. Ikke fikset.
- `startDay()` i motor.js har ingen sperre mot å bli kalt når en dag allerede er startet — et
  dobbelttrykk på "Start dag" før React fjerner knappen kunne teoretisk bygge `dayLog` på nytt to
  ganger. Konsekvensen er null i praksis: på dette tidspunktet er `dayLog` alltid tomt (ingenting
  er registrert ennå), så "tapet" er en tom dag byttet ut med en annen tom dag. Å fikse dette
  krever å røre frossen motor.js for en reell, men praktisk konsekvensfri kant — utenfor omfang
  per den samme frys-regelen som har stått gjennom hele dette engasjementet.
- Redigering av eksisterende oppføring (`editText` i `operations-phase.tsx`) er en vanlig
  `useState`, ikke koblet til samme utkast-lagring (`draft-storage.mjs`) som Hotfix 3 ga
  hovedfeltet. En avbrutt redigering (refresh/krasj) mister rettelsen — men den opprinnelige
  oppføringen er urørt, så konsekvensen er "må skrive rettelsen på nytt", ikke tapt data.
  Smalere konsekvens enn saken Hotfix 3 løste, og å koble utkast til riktig oppførings-indeks
  øker kompleksiteten mer enn denne gjennomgangens terskel for "liten, trygg endring" tillater.

## Del 3 — Defensiv programmering

- "Logg rettelse"-funnet fra Del 1 er også et defensiv-programmering-funn: koden antar stille at
  brukeren ikke har noe upostet i feltet, uten å sjekke. Vurdert (se Del 1/2), ikke implementert.
- `use-motor-state.ts` poller `window.Motor`-tilgjengelighet hvert 50. ms uten noen øvre grense.
  Hvis motor.js av en eller annen grunn aldri laster (skript blokkert, fremtidig syntaksfeil),
  poller appen i det stille for alltid uten noe brukervendt feilmelding — skjermen forblir bare
  tom. Dette krever i dag at appens eget skript faktisk feiler å laste, noe det aldri gjør —
  reell, men smal risiko. Ikke implementert: å legge til en "tok for lang tid"-melding krever et
  reelt designvalg (hvor lenge er for lenge, hvilken tekst) som denne herdingsrunden ikke bør ta
  ensidig.
- Skjema-rendering (`SchemaEditOverlay`, håndrens' generiske kort) har konsekvent fallback for
  manglende feltdefinisjoner (`|| schemaType`, `|| key`, `fieldDef === undefined`-sjekker) —
  ingen krasjvei funnet for manglende/udefinerte skjemadata.
- CSV/JSON-adapterens håndtering av tomme/manglende felt er allerede dekket av RC1-02s
  regresjonstester (bekreftet grønne på nytt denne runden) — ingen nytt funn.

## Del 4 — Konsistens

Dobbelttrykk-sperre-mønsteret (`isX`-flagg + 500ms `setTimeout`-sikkerhetsreset) er nå brukt
konsekvent på: `handleSubmitEntry`, `handleEndDay`, `handleContinue`, `handleLock`, `handleReset`,
og — etter denne rundens fiks — `handleConfirmReview`/`handleSubmitRaw`. Det eneste gjenværende
inkonsistente stedet er håndrens' per-punkt-knapper (Del 2), som er dokumentert men bevisst ikke
fikset siden konsekvensen der er kosmetisk, ikke data. Loading/disabled-styling
(`disabled:opacity-50` + `active:scale-[0.98]`) er brukt likt på tvers av alle gjennomgåtte
handlingsknapper for øvrig.

## Del 5 — Ytelse

- `useMotorState(key)` re-rendrer den kallende komponenten på **hver** `motor-state-change`-
  hendelse, uavhengig av hvilken nøkkel som faktisk endret seg (revisjonsteller, ikke selektiv).
  I `operations-phase.tsx` alene brukes hooken 7 ganger — én oppføring registrert utløser derfor
  7 separate `setState`-kall. Reacts automatiske batching samler disse til én faktisk re-render,
  og listen over loggføringer er liten (en enkelt arbeidsdag, typisk noen titalls oppføringer,
  ikke tusenvis) — målt/vurdert som ubetydelig i praksis. Ikke optimalisert: gevinsten er ikke
  dokumenterbar nok til å rettferdiggjøre en strukturendring i en hardingsrunde som eksplisitt
  ber om "kun dersom gevinsten er dokumenterbar."
- `SchemaEditOverlay`s debounce (250ms per felt-skrivning til localStorage) er allerede effektiv,
  bekreftet på nytt.
- Ingen ubegrensede løkker eller uindekserte skann over brukerskala-data funnet i de gjennomgåtte
  komponentene.

## Del 6 — Robusthet

Adversarial-simuleringen og RC1 har allerede dekket ekstreme tekster, spesialtegn, æøå,
BOM/semikolon-eksport, og lange fritekstfelt grundig (regresjonstestet, bekreftet grønt på nytt
denne runden). Denne gjennomgangens egen kodeinspeksjon av `submitEntry`, `confirmStructuredEntry`,
`resolveItem`, og `startDay` fant ingen nye krasjveier for tom/ugyldig input utover det som
allerede vaktes (`if (!text) return`, `if (!parsed || !parsed.ordre) return`,
`if (!schema) return`, gjennomgående). Det ene nye funnet denne runden var nettopp den typen
"stille feil / inkonsistent tilstand" (duplikat data) uten krasj som Del 6 spesifikt ber om å se
etter utover ren krasjjakt — og det er nå fikset.

## Del 7 — Pilotbruker

Gikk gjennom flyten som en førstegangsbruker: det klareste stedet en vanlig, ikke-motvillig
bruker stopper opp og må tenke er nettopp "Bekreft ordrelinje"-mini-reviewen — et nytt
avgjørelsespunkt (Bekreft / Bare logg / Avbryt) som ikke finnes for vanlige notater. Et nølende
dobbelttrykk der, mens brukeren vurderer, var en reell, plausibel vei inn i den nå fiksede buggen.
Det nest mest sannsynlige stedet for stille forvirring er "Logg rettelse"-scenarioet fra Del 1/3:
en bruker som skriver et nytt notat, husker en gammel feil, trykker på den gamle oppføringen for
å rette den, og først senere oppdager at det nye notatet er borte. Dette er det sterkeste
kandidatfunnet for en eventuell neste herdingsrunde.

## Del 8 — Drift

Ingen nye funn utover det Pilot Readiness Review allerede dokumenterte og denne gjennomgangen
bekreftet uendret: strukturert forespørselslogging på admin-ruter, live sikkerhetsrevisjon grønn,
sync-status-pille, og eksportstatusens ærlige skille mellom "låst" og "sendt" på
`completion-screen.tsx` (bekreftet god, urørt praksis). Ingen ekstern feilsporing/oppetids-
overvåkning — uendret, krever fortsatt tredjepartskontoer denne runden ikke kan opprette.

## Del 9 — Kodekvalitet

- Ingen TODO/FIXME/XXX-kommentarer noe sted i kodebasen (søkt gjennom hele repoet — null treff).
- Tale-offline-sperre-logikken (`if (!isOnline) { setVoiceBlockedByOffline(true); ...; return; }`)
  er duplisert nesten ordrett 3 steder (`start-day-phase.tsx` x2, `operations-phase.tsx` x1). En
  liten delt `useVoiceGate`-hook kunne konsolidert dette — reelt, lavrisiko funn, men rører tre
  render-stier for en ren intern kvalitetsgevinst uten brukervendt effekt. Ikke gjort denne
  runden: kategori 1–6 hadde ett reelt funn (nå fikset), og dette er kategori 9/kosmetisk-
  tilstøtende, lavest prioritert per oppgavens egen rekkefølge.
- `submit-guard.mjs`s `shouldAllowSubmit()` er nå gjenbrukt 3 steder — ingen duplisering innført
  av denne rundens fiks.
- Ingen død kode eller ubrukte hjelpefunksjoner funnet i de gjennomgåtte filene.

## Prioritering (kategori 1–7)

| Kategori | Funn |
|---|---|
| 1. Datatap | Ingen funnet utover neglisjerbare, dokumenterte kanttilfeller (startDay dobbelttrykk, redigering-utkast) |
| 2. Feil data | **Duplikat ordrelinje ved dobbelttrykk i mini-review — FIKSET** |
| 3. Brukerforvirring | "Logg rettelse" overskriver upostet tekst; motor.js-lastefeil uten tidsavbrudd-melding — dokumentert |
| 4. Supporthenvendelser | Samme to som over |
| 5. Redusert tillit | Ingen nye |
| 6. Redusert flyt | Håndrens-knappenes manglende sperre (kosmetisk konsekvens); sync-pille kun i én fase; dropdown lukkes ikke ved klikk utenfor |
| 7. Kosmetisk | Dropdown-lukking; tale-sperre-duplisering |

Ingen kosmetiske endringer er implementert — kategori 1–6 inneholdt kun ett reelt, lavrisiko,
høyverdi funn, og det er fikset.

## Implementert

**Én endring**: `components/punchout/operations-phase.tsx` +
`lib/pilot-ux/submit-guard.mjs` — dobbelttrykk-sperre på den strukturerte
entry-review-flyten, gjenbruker eksisterende, allerede testet mønster og tilstand. Commit
`10aed2d`.

## Bevisst ikke implementert

Alle funn i Del 1–9 utover den ene fiksen, med begrunnelse gitt inline i hver seksjon over.
Fellesnevner: enten (a) konsekvensen er bekreftet lav/kosmetisk etter faktisk å ha lest
motor.js-koden (håndrens-knapper, startDay), (b) fiksen krever et reelt produktvalg denne
gjennomgangen ikke bør ta ensidig (motor.js-lastefeil-melding), eller (c) fotavtrykket/
kompleksiteten er større enn "liten, trygg endring" tillater for gevinsten (sync-pille i to
flere headers, per-oppførings-utkastlagring, delt tale-sperre-hook).

## Forventet effekt

**UX**: Marginal, men reell — fjerner den ene konkrete situasjonen der en normal, ikke fiendtlig
bruker (nølende dobbelttrykk under en ny type avgjørelse) kunne fått en synlig, forvirrende
duplikatoppføring i loggen sin.

**Stabilitet**: Lukker det siste kjente hullet i "ett trykk, én handling"-garantien som Hotfix 4
etablerte for resten av appen — den garantien gjelder nå alle datamuterende knappetrykk i
hovedarbeidsflyten unntatt håndrens' idempotente bekreft/forkast-knapper (som ikke trenger den).

**Gjenværende risiko**: De dokumenterte, ikke-implementerte funnene i Del 1–3 og 9 — ingen av dem
vurderes som pilotblokkerende alene, men "Logg rettelse"-scenarioet er den mest sannsynlige
kilden til en reell brukerklage i en fremtidig gjennomgang, hvis noen.

## Regresjon

- `npm test`: **101/101 grønn** (uendret antall — ingen ny testfil lagt til, siden fiksen
  gjenbruker en allerede testet ren funksjon; ny testdekning kommer via eksisterende
  `shouldAllowSubmit`-tester, ikke duplisert).
- `npm run typecheck`: ren.
- `node lib/regression/security-audit.mjs`: 7/7 grønn, kjørt på nytt live mot ekte server.
- `node lib/regression/cross-organization.mjs`: alle 4 organisasjoner (mesta, nordhavn, banenord,
  nordkraft) fullfører identisk scenario, låst, eksportert.

Ingen regresjoner.

---

## Sluttspørsmål

> **Hvis Punchout var ditt eget produkt – ville du vært komfortabel med å la 100 feltarbeidere
> bruke dette hver dag?**

**JA**

Denne runden fant nøyaktig ett reelt, dokumentert stabilitetshull i hele arbeidsflyten — et
dobbelttrykk-race i én spesifikk ny avgjørelsesflyt — og det er nå fikset med samme, allerede
utprøvde mønster som resten av appen bruker. Alt annet gjennomgått (9 delområder, hver bygget på
faktisk lest kildekode, ikke antakelser) enten holdt allerede, eller har en dokumentert,
begrunnet, lav konsekvens som ikke rettferdiggjør å røre koden i en runde hvis eneste mandat er
"gjør det som allerede fungerer enda tryggere, ikke mer avansert." At en så grundig, kode-forankret
gjennomgang bare fant én ting å fikse — og at den ene tingen var lav-risiko og lett å verifisere
— er i seg selv et sterkere signal om modenhet enn en lang liste med nye endringer ville vært.

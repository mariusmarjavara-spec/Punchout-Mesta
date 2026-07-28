# Adapter Platform — sluttrapport

Fase: Universal Adapter Platform + Automated Integration Testing. Motoren
(`lib/engine`, `lib/runtime`, `public/motor.js`) og Completion Engine er uendret gjennom hele
denne fasen — verifisert ved at ingen fil under `lib/engine/`, `lib/runtime/`, eller
`public/motor.js` er endret (kun lest, for å bekrefte antakelser i DEL 1).

## Arkitektur

Fundamentet var allerede sunt: `lib/adapters/adapter.mjs` sin `runAdapter()`
(validate→transform→send→handleResponse, kaster aldri) og `envelope.mjs` sin `ExportEnvelope`
var receiver-agnostiske av design, ikke ved tilfeldighet — men bevist mot nøyaktig **én**
adapter (Landax, uttrykkelig fiktiv mapping). Denne fasen la til strukturen rundt det
fundamentet, uten å røre selve fundamentet:

- **`AdapterCapability`** (`capability.mjs`) — 4 capabilities, ett-til-ett-speilbilde av
  `ExportEnvelope`s egne array-felt (`entries`, `schemas`, `timeEntries`, `machineHours`).
  Navngitt distinkt fra `lib/runtime/types.mjs` sitt allerede eksisterende, urelaterte
  `CapabilityProvider`/`CapabilityBinding`-konsept (intern "hvem leverer SJA?") for å unngå
  begrepskollisjon.
- **Adapter Registry** (`registry.mjs`) — data, ingen switch. 4 registrerte adaptere: landax
  (reference), csv (stable), json (stable), dummy (experimental).
- **Strukturert validering** (`validation-helpers.mjs`) — `{code, field, message}` i stedet for
  flate strenger, delt mellom alle 4 adapterne (se Risiko-funn under).
- **Dry Run Framework** (`dry-run-framework.mjs`) — én mekanisme, ikke to. Erstattet
  duplikasjonen mellom `lib/adapters/dry-run.mjs` (frittstående script) og
  `lib/regression/full-day-scenario.mjs` (kjørt i CI for alle 4 organisasjoner).
- **`define-adapter.mjs`** — komplettsjekk + registrering, ingen baseklasse.

## Endringer

**Nye filer**: `capability.mjs`, `registry.mjs`, `validation-helpers.mjs`, `csv-adapter.mjs`,
`json-adapter.mjs`, `dummy-adapter.mjs`, `dry-run-framework.mjs`, `fixtures.mjs`,
`define-adapter.mjs`, `README.md` (alle i `lib/adapters/`);
`lib/regression/adapter-golden.mjs`, `adapter-contract.mjs`, `adapter-failure.mjs`,
`adapter-performance.mjs`.

**Endrede filer**: `adapter.mjs` (strukturerte feil, `runAdapters()` fan-out),
`landax-adapter.mjs` (bruker `validation-helpers.mjs`), `dry-run.mjs` (bruker
`dry-run-framework.mjs` + `fixtures.mjs`), `full-day-scenario.mjs` (bruker registry +
dry-run-framework, valgfri `adapterName`-parameter, default `"landax"`), `run.mjs` (inkluderer
adapter-suitene), `.github/workflows/ci.yml` (2 nye steg).

**Ikke rørt**: `lib/engine/*`, `lib/runtime/*`, `public/motor.js`, `hooks/use-motor-state.ts`.

## Dry Runs

`node lib/adapters/dry-run.mjs` kjører samme fixture-dag gjennom alle 4 registrerte adaptere.
Alle 4 returnerer `ok:true`. `uncoveredCapabilities` viser presist hva hver adapter *ikke* tar
imot: csv dropper `schemas` (bevisst — den registrerer seg ikke for det), dummy dropper alle 4
(bevisst — den er en arkivindeks, ikke en full kopi).

## Contract Testing

12 tester (4 adaptere × 3 fixtures: tom dag, full dag, 50 ordre/skjema). "Ingen datatap" er
sjekket kvantitativt: hver adapters egen `countRecords()` (lest ut av dens *eget* payload-format
— testfilen kjenner ikke adapter-spesifikke feltnavn) må stemme overens med hvor mange poster
`ExportEnvelope` faktisk bar, for hver capability adapteren selv erklærte støtte for. Alle 12
grønne.

## Failure Testing

19 tester: 3 rene pipeline-feil (transform kaster, send kaster/nettverksfeil, handleResponse
kaster på ugyldig respons — alle via syntetiske, ikke-registrerte feil-adaptere, aldri en femte
"ekte" adapter) + 4 adaptere × 4 scenarier (manglende exportId, feil schemaVersion,
tomt organizationId, duplikat-innsending). `runAdapter()` kastet aldri i noen av de 19
tilfellene — hver feil kom tilbake som et strukturert `{ok:false, stage, error}`.

**Reelt funn underveis**: kun `landax-adapter.mjs` sjekket `schemaVersion` før denne fasen — de
tre andre adapterne aksepterte stille enhver versjon. "Feil Runtime-versjon" var altså testet og
håndhevet for 1 av 4 adaptere, ikke 4 av 4. Fikset ved å innføre `validation-helpers.mjs` og la
alle 4 adaptere bruke samme `checkSchemaVersion()`-funksjon — ikke ved å svekke testen til å bare
gjelde Landax.

## Golden Test Suite

5 tester: 4 adaptere (samme fixture-dag, alle `ok:true`, `exportId` ekko'et korrekt) + 1
multi-adapter fan-out-test (`runAdapters()`: samme envelope til alle 4 samtidig, alle uavhengig
`ok:true`, envelope bevist urørt via `Object.isFrozen()` etter kjøring).

## Performance

Målt med `node lib/regression/adapter-performance.mjs` (ren `transform()`-tid, ingen I/O):

| adapter | 100 pakker | 500 pakker | 1000 pakker |
|---|---|---|---|
| landax | 0.24 ms | 0.16 ms | 0.11 ms |
| csv | 0.83 ms | 1.46 ms | 3.25 ms |
| json | 0.05 ms | 0.01 ms | 0.01 ms |
| dummy | 0.03 ms | 0.01 ms | 0.01 ms |

Verste måling ved 1000 pakker: 3.25 ms (csv), godt innenfor den bevisst rundhåndede grensen på
500 ms satt for å fange en faktisk O(n²)-regresjon. **Ingen optimalisering er indikert** —
konklusjonen forutsagt i DEL 1 (rene in-memory-funksjoner, ingen I/O) holder.

## Risiko

1. **Fortsatt kun 4 adaptere, hvorav 3 er formatnøytrale (csv/json/dummy) og 1 er uttrykkelig
   fiktiv (landax)**. Ingen av dem er bevist mot en reell ekstern kontrakt. Kontrakten
   *generaliserer* strukturelt (bevist ved 4 uavhengige implementasjoner som alle består samme
   test-suiter), men "generaliserer til et system vi faktisk har en API-spesifikasjon for" er
   fortsatt ubevist.
2. **`ExportEnvelope`s feltvokabular er norsk/anleggsbransje-spesifikt** (`ordre`, `lonnskoder`,
   `maskintimer`) — bevisst og korrekt (speiler frosset `motor.js`, identisk på tvers av alle 4
   organisasjoner), men enhver ny adapter-forfatter må vite dette på forhånd; nå eksplisitt
   dokumentert i README.
3. **GPS/foto/signatur finnes ikke i capability-modellen** fordi de ikke finnes i `DayLog`. Hvis
   dette blir et reelt produktkrav, må endringen starte i motoren (frosset i denne fasen) — ikke
   i adapterlaget.
4. **`define-adapter.mjs` brukes ikke av de 4 innebygde adapterne** (de er registrert direkte i
   `registry.mjs` for å unngå en unødvendig sirkulær import). Dette er dokumentert i selve filen
   og README — men betyr at helperens egen validering først bevises i praksis når adapter #5
   skrives.

## Adapter Readiness

| Adapter | Status | Capabilities | Reell kontrakt? |
|---|---|---|---|
| landax | reference | entries, schemas, timeEntries, machineHours | Nei — uttrykkelig fiktiv |
| csv | stable | entries, timeEntries, machineHours | Ja (CSV er et format, ikke et system) |
| json | stable | entries, schemas, timeEntries, machineHours | Ja (JSON er et format) |
| dummy | experimental | (ingen) | Ja (arkivindeks-mønster) |

## Anbefaling

Ikke bygg flere navngitte, fiktive adaptere (ISY Road, SharePoint, Power BI) uten en reell
kontrakt å teste mot — det ville gjenta Landax sin eneste reelle svakhet, ikke rette den. Neste
reelle steg mot en universell plattform er **é n** adapter mot et system Punchout faktisk skal
integrere med i praksis, kjørt gjennom akkurat denne test-infrastrukturen (Golden + Contract +
Failure + Performance kommer gratis, siden alle fire suiter genereres fra registryet). Det —
ikke flere syntetiske eksempler — er det som faktisk beviser generaliteten.

## DEL 14 — Kritisk evaluering

**Er adapterlaget for komplekst?** Nei foreløpig — 8 filer, ingen arv, ingen switch-setninger,
hver fil under ~130 linjer. Men se punkt om SDK under: dette er en grense, ikke en frikjennelse
for å legge til mer struktur "for sikkerhets skyld".

**Finnes unødvendige abstraksjoner?** `define-adapter.mjs` er den som ligger nærmest — den
brukes ikke av noen eksisterende adapter (se Risiko punkt 4). Beholdt fordi den er triviell (< 40
linjer, ingen arv) og fordi README nå anbefaler den for *fremtidige* adaptere — men om ingen
5. adapter noensinne skrives, bør denne filen fjernes fremfor å "vokse" videre.

**Kan noe forenkles?** `capability.mjs`s `uncoveredCapabilities()` brukes i dag kun til logging
(dry-run-framework.mjs) — ikke til å blokkere noe. Det er riktig i dag (motoren skal aldri
blokkeres av adapterlaget), men er verdt å følge med på: hvis capability-sjekken aldri påvirker
noen reell beslutning, er det et signal om at den bør fjernes, ikke utvides.

**Bør adaptere kunne kjøre server-side og klient-side?** `adapter.mjs` sin kommentar
("framework-free … kjører identisk i nettleser, i Node på en server, eller i en testkjører") er
verifisert i praksis: `dry-run.mjs`/regresjonstestene kjører adapterlaget i Node, og ingenting i
adapter.mjs, envelope.mjs, capability.mjs, eller registry.mjs importerer `window`, `fetch`, eller
`localStorage`. `send()`-implementasjonen i en fremtidig ekte adapter er det eneste stedet dette
kan brytes (en ekte `fetch()`), og det er riktig plassering for det bruddet.

**Er Export Envelope virkelig stabil nok? Mangler den viktig metadata?** Stabil nok for det den
faktisk beskriver (4 datakategorier fra en frosset motor). Den mangler ingenting den *burde* ha
gitt hva `DayLog` faktisk produserer i dag — men det er nettopp derfor GPS/foto/signatur ikke er
lagt til: å legge dem til i `ExportEnvelope` uten at motoren noensinne fyller dem ut, ville vært
å late som stabilitet man ikke har.

**Er noen deler fortsatt Mesta-spesifikke?** Feltvokabularet (DEL 1 funn 2) er
anleggsbransje-spesifikt, ikke Mesta-spesifikt — identisk på tvers av alle 4 organisasjoner
(mesta, nordhavn, banenord, nordkraft), bekreftet ved å lese alle fire `organizations/*/`-mapper.
Et søk etter `"mesta"` i `lib/adapters/` gir to treff, begge ufarlige: en JSDoc-eksempelverdi i
`envelope.mjs` ("tenant/customer identity, e.g. \"mesta\"") og `fixtures.mjs`s
`SAMPLE_CONTEXT.organizationId`, som er et vilkårlig testdata-valg — ingen adapter grener på
verdien. Ingen *logikk* i `lib/adapters/` refererer til Mesta.

## Vurdering: hvor nær en universell integrasjonsplattform?

Målet var aldri flest mulig systemer — det var å bevise at én deterministisk sannhet kan
oversettes trygt, testbart og vedlikeholdbart til mange mottakere uten at motoren noensinne
kjenner til dem. **Det mekanismebeviset er nå levert**: samme envelope, samme test-infrastruktur
(golden/contract/failure/performance, alle registry-drevne), fire strukturelt uavhengige
adaptere, null endring i motoren, null switch-setninger, én registrert feil funnet og rettet
(inkonsekvent schemaVersion-sjekk) nettopp *fordi* testene ble skrevet generisk nok til å avsløre
den. Det som gjenstår er ikke arkitektur — det er en reell, navngitt integrasjon å bevise
mekanismen mot. Platformen er klar for den; den er ikke bevist av den ennå.

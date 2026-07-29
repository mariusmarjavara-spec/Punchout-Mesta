# Punchout — Pilot Readiness Board Review

Uavhengig produktrevisjon. Ingen kode implementert, ingen funksjoner foreslått, ingen
arkitektur redesignet i dette dokumentet. Alle sentrale påstander under er **selv bekreftet**
i denne gjennomgangen — ikke hentet ureflektert fra tidligere rapporter — ved å kjøre
`npm test`, `npm run typecheck`, `node lib/regression/security-audit.mjs` på nytt, ved å lese
faktisk `git log`/`git diff` for hele engasjementet (ikke bare RC1), og ved å lese nøkkelfiler
direkte fremfor å stole på commit-meldinger.

## Metodikk-notat (før noe annet)

Uavhengig verifisert i denne gjennomgangen, ikke antatt fra tidligere rapporter:

- `npm test` → **101/101 grønn**, kjørt på nytt akkurat nå.
- `npm run typecheck` → ren.
- `node lib/regression/security-audit.mjs` → **7/7 grønn**, kjørt på nytt mot en ekte, fersk
  serverprosess akkurat nå (ikke gjenbrukt fra en tidligere rapport).
- `git diff --stat b18d674~1..HEAD -- public/motor.js` → **6 linjer lagt til, 1 fjernet, i én
  eneste commit**, gjennom hele engasjementet fra Adapter Platform-fasen til nå. `lib/engine/`
  og `lib/runtime/` har **null** commits i samme periode. Den påståtte "frosset motor"-grensen
  holder — bekreftet mot faktisk historikk, ikke mot en påstand om den.
- Faktisk `git show` av RC1-01-committen bekrefter presist den ene linjen rapportert endret —
  ingen skjulte tilleggsendringer.
- `docs/`-mappen inneholder **14 separate rapporter, ingen README, ingen indeks** — se Del 4.

## Del 1 — Produkt

**Hva er Punchout?** Et deterministisk, lokal-først dagslogg-system for feltarbeidere i norsk
anleggs-/infrastrukturbransje — start dag, registrer arbeid (tekst eller tale), fyll ut
HMS-/sikkerhetsskjema, avslutt dag, eksporter til mottakersystemer. Kjernen ("motoren") er en
enkelt, frosset JS-fil (`public/motor.js`) som produserer én deterministisk sannhet per
arbeidsdag; et separat adapterlag oversetter den sannheten til ulike mottakerformater uten at
motoren noensinne kjenner til mottakeren.

**Hvilket problem løser det?** Erstatter papir/Excel/muntlig rapportering av arbeidstid,
maskintimer og HMS-hendelser med en strukturert, sporbar, offline-kapabel digital logg.

**Hvem er pilotkunden?** De fire allerede konfigurerte organisasjonene (Mesta – veg/anlegg,
Nordhavn – havn/kran, Banenord – jernbane, Nordkraft – kraft/dam), pluss en femte,
`gronnvik` (kommunalt vedlikehold), bygget fra bunnen som et bevis på at en helt ny kunde kan
onboardes uten kodeendring — teknisk et pilotkandidat-eksempel, ikke en reell kunde.

**Hva er beviselig innenfor produktets omfang?** Alt som faktisk er kjørt og verifisert i denne
gjennomgangen og de rapportene den bygger på: full arbeidsdag (start → skjema → registrering →
feilretting → avslutning → håndrens → låsing) for alle fem organisasjoner; eksport gjennom 4
adaptere; ekte HMAC-signert HTTP-eksport; backup/gjenoppretting på ekte kundedata; autentisering
som faktisk håndheves live.

**Hva er eksplisitt utenfor omfanget?** Enhver bransje uten en forfattet org-pakke (VA, bygg,
elektro, fiber, skogbruk/landbruk, øvrig kommunal drift — dokumentert i
`pilot-human-factors-validation.md`). GPS, bilder, signatur (motoren har ingen datakilde for
dette). Faktisk levende produksjonsdrift (ingen Fly.io-/Railway-konto er noensinne opprettet —
bekreftet: ingen `.env`, ingen deploy-logg, kun reviderte, ikke-utrullede artefakter). Ekte
nettleser-/enhetstesting (gjentatte ganger dokumentert som "forberedt, ikke utført" siden
`browser-readiness-protocol.md`/`mobile-readiness-protocol.md`, aldri motbevist siden).

## Del 2 — Teknisk modenhet

| Område | Modenhet | Dokumentasjon | Risiko | Begrunnelse |
|---|---|---|---|---|
| Motor | Høy | Sterk (inline kommentarer + regresjon) | Lav | 163+ referanser til intern logikk, testet mot 5 organisasjoner, urørt utenom én bevist, ett-linjes RC1-fiks |
| Runtime | Høy | Sterk | Lav | Compiler/versjonering/rollback bevist i regresjon, urørt gjennom hele engasjementet |
| Offline | Middels-høy | God, men delvis ubekreftet | Middels | Arkitekturen (localStorage-først) er bevist robust i vm-sandkasse og reelle server-restarts; **aldri bekreftet i en ekte nettleser med ekte tapt nettverk** |
| Synkronisering | Middels-høy | God | Middels | Retry/backoff/idempotens bevist teknisk; UX-synlighet lagt til (Sprint 3); fane-konflikt-scenarioet er **redusert, ikke eliminert** (Hotfix-rapportens egen, ærlige konklusjon) |
| Adapterplattform | Middels-høy | Meget god | Lav-middels | 4 adaptere, alle grønne, men kun 1 (Landax) er en navngitt (fiktiv) mapping — aldri bevist mot et reelt eksternt system |
| Organisasjonskonfigurasjon | Høy | God | Lav (for de 5 kjente) / Høy (for enhver ny bransje) | Bevist fra bunnen denne uken (gronnvik); RC1-01 lukket en reell, alvorlig svakhet i ordre-gjenkjenning som rammet 3 av 5 |
| Eksport | Høy | God | Lav | HMAC-signert, idempotent, bevist end-to-end mot en ekte registrert enhet |
| Sikkerhet | Middels-høy | God | Middels | Ett kritisk funn (åpen `/api/operations-center`) funnet OG fikset denne engasjementssyklusen — bekrefter revisjonsprosessen fungerer, men reiser spørsmålet om hvor mange lignende hull som ennå ikke er lett etter systematisk (ingen full, uavhengig sikkerhetsrevisjon utover det som ble funnet ved uhell/testing er noensinne gjennomført) |
| Logging | Middels | Ny, minimal | Lav-middels | Strukturert logging lagt til admin-ruter (Sprint 4); ingen feilsporing (Sentry e.l.), ingen ekstern oppetidsovervåkning — begge fortsatt udekket |
| Backup | Høy | Meget god | Lav | Faktisk øvd (ikke bare beskrevet) to ganger, inkludert på ekte kundedata denne uken |
| Restore | Høy | Meget god | Lav | Samme som over — RTO/RPO målt, ikke antatt |

## Del 3 — Pilotberedskap

Svarene under er basert utelukkende på dokumenterte, gjentatt bekreftede bevis (End-to-End
Acceptance Test + RC1-rapporten + denne gjennomgangens egen uavhengige verifisering):

| Kan en ny kunde... | Svar |
|---|---|
| ...opprette organisasjon? | **Ja** — bevist fra bunnen (gronnvik), API-prosedyren fungerer nøyaktig som dokumentert |
| ...konfigurere Punchout? | **Ja, via JSON-org-pakke + API** — **ikke via UI**; ingen administrator-grensesnitt for dette finnes |
| ...publisere runtime? | **Ja** — bekreftet, inkludert signatur og aktivering |
| ...ta systemet i bruk? | **Ja, på motor-/API-nivå** — **ikke bekreftet i en ekte nettleser på en ekte enhet** noensinne i hele dette engasjementet |
| ...registrere arbeid? | **Ja** — full arbeidsdag inkludert feilretting bevist mot ekte motor.js |
| ...eksportere data? | **Ja** — ekte signert HTTP-eksport, ekte adaptere |
| ...åpne resultatet i Excel? | **Sannsynligvis ja etter RC1-02** — bevist byte-for-byte (BOM, semikolon, æøå), men **aldri bekreftet ved faktisk å åpne filen i en ekte Microsoft Excel-installasjon** siden ingen slik finnes i noe miljø denne engasjementssyklusen er kjørt i |

## Del 4 — Kjente begrensninger

### Kritiske (må løses før pilot)

1. **Ingen faktisk levende driftsmiljø.** Uavhengig bekreftet: ingen `.env`, ingen deploy-logg,
   ingen Fly.io-/Railway-konto noensinne opprettet. Alt er reviderte, ikke-utrullede artefakter.
   En pilot kan ikke starte før noen med reell tilgang faktisk kjører `docs/deploy-runbook.md`s
   §1.
2. **Ingen ekte enhets-/nettleserverifikasjon, noensinne.** Dette er den eldste, mest
   konsekvent gjentatte begrensningen i hele materialet (først flagget i
   `browser-readiness-protocol.md`, gjentatt uendret i hver eneste påfølgende rapport frem til
   nå). Alt "bevis" er mot vm-sandkasse, `curl`, og byte-inspeksjon — aldri en reell skjerm, en
   reell mikrofon, eller en reell Excel-installasjon.

### Operasjonelle (kan håndteres gjennom opplæring eller rutiner)

1. Fane-/enhetskonflikt-risikoen (Hotfix 1) — redusert til et synlig, unngåelig scenario, ikke
   eliminert. Håndteres ved å instruere pilotbrukere om å unngå flere samtidige økter.
2. Håndrens' bekreft/forkast-knapper (og "Start dag", skjema-lagring) mangler fortsatt samme
   dobbeltklikk-vern som "Logg"-knappen nå har — dokumentert, aldri fikset, lav-middels
   konsekvens.
3. Ingen konfigurerbar terminologi (Sprint 3, Oppgave 5, bevisst utsatt) — irrelevant for de 5
   allerede konfigurerte organisasjonene, relevant kun ved en 6. kunde med annen bransjekultur.
4. Ingen ekte feil-/krasjsporing eller ekstern oppetidsovervåkning.

### Produktønsker (ikke relevante for pilot)

1. Full PWA (manifest/service worker).
2. Flere reelle eksterne adaptere (kun relevant når et reelt integrasjonsmål finnes).
3. Rate limiting / CORS-policy / full zod-validering på API-laget — reelle, men lavere
   alvorlighetsgrad, bevisst utsatt i Sprint 4 med begrunnelse.
4. **Ny, ikke tidligere fremhevet i denne formen**: **14 separate dokumentrapporter, ingen
   README, ingen indeks.** Dette ER tidligere flagget (strategisk gjennomgang, "ingen
   README/arkitekturoversikt") — men er ikke fikset i noen av de 6 påfølgende sprintene, og har
   vokst fra "et gap" til "et sprawl-problem" ettersom antallet rapporter har økt. Ikke en
   pilotblokkerende feil, men en reell risiko for at en fremtidig utvikler eller en pilotkundes
   tekniske kontaktperson ikke finner frem i materialet.

## Del 5 — Pilotplan

- **Antall brukere**: 8–12 — nok til å dekke minst 2 personer per av de 4 reelt eksisterende
  organisasjonene (ikke gronnvik, som er et bevisbart konsept, ikke en betalende kunde), pluss
  minst én formann/administrator-rolle per organisasjon.
- **Varighet**: 4 uker, matcher `pilot-operations.md`s allerede etablerte antakelse
  (backup-kadens, retensjonsvinduer) — ikke forleng uten å også revidere de antakelsene.
- **Typer arbeid**: den faktiske, daglige driften til de 4 organisasjonene — ingen syntetiske
  scenarioer.
- **Hvordan feil rapporteres**: `pilot-operations.md`s eksisterende Incident Checklist +
  UX-telemetrien fra Sprint 3 (allerede instrumentert, aldri brukt på ekte data ennå) — **denne
  piloten er den første anledningen til å faktisk se om telemetrien gir nyttige signaler**.
- **Måltall**: eksport-suksessrate, fullførte arbeidsdager per bruker, antall
  "Logg rettelse"-bruk (indikerer feilfrekvens), antall ganger synk-status-pillen viser
  "Synkfeil", antall supporthenvendelser per kategori (se Del 6).
- **Hvem bør følge opp**: én navngitt driftsansvarlig (matcher `pilot-operations.md`s Daily
  Checklist-forutsetning), med `/ops`-dashbordet (nå reparert, Hotfix 2) som primærverktøy.

## Del 6 — Suksesskriterier

| Kriterium | Målbar terskel |
|---|---|
| Ingen kritisk datatap | 0 hendelser der en bruker mister en hel, fullført arbeidsdag |
| Fullførte arbeidsdager | ≥90 % av startede dager når faktisk låsing (ikke forlatt i "ending"/håndrens) |
| Eksport brukt i virkelig arbeid | Minst 1 eksportert fil faktisk åpnet og brukt av en prosjektleder/lønnsansvarlig i reelt arbeid (ikke bare generert) |
| Support-mengde | <1 henvendelse per bruker per uke i gjennomsnitt, ingen enkeltkategori >30 % av totalen |
| Brukeropplevelse | Ingen bruker slutter å logge helt (jf. "Marit"-mønsteret fra den adversariale simuleringen — stille frafall er verre enn en synlig klage) |
| Sikkerhet | 0 uautoriserte tilganger til admin-endepunkter observert i logger |
| Ordre-korrekthet | 100 % av eksporterte ordrenumre matcher organisasjonens eget format (direkte oppfølging av RC1-01) |

## Del 7 — Risikoanalyse

| Risiko | Sannsynlighet | Konsekvens | Overvåkes ved | Må løses innen |
|---|---|---|---|---|
| Ingen faktisk driftsmiljø når pilot skal starte | Sikker (per definisjon, i dag) | Blokkerer alt | N/A — dette ER blokkeringen | Før pilotstart |
| Ekte nettleser-/enhetsatferd avviker fra vm-sandkasse-bevis | Middels | Middels-høy (kan avdekke UI-bugs aldri sett) | Første ukes bruk, tett fulgt | Innen pilotuke 1 |
| Fane-/enhetskonflikt inntreffer i praksis | Lav (krever samtidig bruk) | Høy hvis den skjer (stille datatap for den tapende siden) | Cross-tab-varselbanneret (Hotfix 1) + brukerrapportering | Overvåkes gjennom hele piloten, løses for fullt kun hvis frekvensen viser seg reell |
| Ny, ennå ikke oppdaget sikkerhetssvakhet | Lav-middels (ett funnet og fikset denne syklusen; ingen systematisk full revisjon utført) | Høy | Strukturert logging (Sprint 4) + `/ops` | Bør vurderes for en dedikert sikkerhetsrevisjon før offentlig beta, ikke nødvendigvis før en liten, kjent pilotgruppe |
| CSV faktisk feiler i en pilotkundes spesifikke Excel-versjon/lokalisering | Lav (bevist byte-korrekt, men aldri i ekte Excel) | Lav-middels (irriterende, ikke datatap) | Første faktiske eksport brukt i reelt arbeid | Innen pilotuke 1–2 |
| Dokumentasjons-sprawl gjør feilsøking treg under pilot | Middels | Lav-middels (tidstap, ikke funksjonssvikt) | Ingen — ikke instrumentert | Bør adresseres, ikke pilotblokkerende |

## Del 8 — Release Readiness (0–10)

| Område | Score | Begrunnelse |
|---|---|---|
| Produkt | 7 | Løser et reelt, godt forstått problem for en klart avgrenset kundegruppe; omfangsgrensene er ærlig dokumentert, ikke skjult |
| Teknologi | 8 | Motor/Runtime/Adapterplattform er solid, uavhengig bekreftet urørt og testet gjennom hele engasjementet; trekk for offline/synk sin "redusert, ikke eliminert"-status |
| Drift | 5 | Backup/restore/sikkerhet/CI er reelt sterke; ingen faktisk levende instans finnes ennå — dette alene holder scoren nede |
| Dokumentasjon | 6 | Uvanlig ærlig og detaljert per rapport, men 14 dokumenter uten README/indeks er reell friksjon for enhver ny leser |
| Brukervennlighet | 6 | Betydelig UX-herding gjennomført og bevist på logikknivå; aldri bekreftet med en ekte bruker foran en ekte skjerm |
| Testdekning | 8 | 101 automatiserte tester, reell live sikkerhetsrevisjon, reelle backup-drills — uvanlig grundig for et pilotstadium-produkt; trekk for null jsdom/nettleser-nivå-dekning |
| Pilotberedskap | 6 | Alt som kan bevises uten reell infrastruktur er bevist; det som gjenstår er ikke flere funn, men å faktisk utføre de to kritiske, allerede identifiserte manuelle stegene |

## Del 9 — Executive Summary

**Hva er Punchout?** En digital erstatning for papir og Excel-baserte timelister for
anleggsarbeidere: de logger arbeidsdagen sin på telefonen, systemet sender dataene videre til
lønn/prosjektsystemer automatisk.

**Hva er bevist?** Kjerneproduktet fungerer korrekt og pålitelig, testet grundig gjennom
automatiserte tester og gjentatte, uavhengig bekreftede øvelser: en helt ny kunde kan tas i
bruk fra bunnen uten at noen skriver kode; en arbeidsdag — inkludert en feilregistrering og
retting av den — logges korrekt; data overlever både planlagte og uplanlagte
serverrestarter; sikkerheten er testet og ett reelt hull ble funnet og lukket underveis;
eksporterte filer åpner nå korrekt med norske bokstaver i et regnearkprogram.

**Hva er fortsatt usikkert?** To ting, og bare to: (1) produktet har aldri kjørt på en ekte,
betalende kundes server — alt er testet lokalt og må faktisk settes opp av noen med tilgang til
en skyleverandør; (2) ingen ekte person har noensinne brukt appen på en ekte telefon i en ekte
nettleser gjennom hele dette utviklingsløpet — alt er testet gjennom tekniske simuleringer,
aldri et ekte tastetrykk på en ekte skjerm.

**Hva skal piloten validere?** Nettopp disse to tingene, sammen med om de tre håndterte, men
ikke fullstendig eliminerte risikoene (fane-konflikt, offline i praksis, CSV i en reell
Excel-installasjon) faktisk viser seg som problemer i virkeligheten eller forblir teoretiske.

---

## Endelig beslutning

**🟡 READY FOR LIMITED PILOT**

Ikke 🔴, fordi produktlogikken er uvanlig grundig bevist for et pilotstadium — ikke gjennom
påstander, men gjennom gjentatt, uavhengig verifiserbare tester denne gjennomgangen selv
bekreftet på nytt. Ikke 🟢, fordi to konkrete, navngitte, aldri-utførte steg (reell
serverdrift, reell enhetstesting) fortsatt står mellom "teknisk bevist" og "faktisk brukt av et
menneske på en ekte enhet" — ingen tidligere rapport har noensinne motbevist dette, kun
gjentatt det. En "begrenset pilot" betyr konkret: de 4 allerede kjente organisasjonene, ikke
flere; et lite, navngitt brukerantall (8–12, Del 5); og en eksplisitt forutsetning om at
noen med reell infrastrukturtilgang fullfører `docs/deploy-runbook.md`s §1 først.

---

## Absolutt siste spørsmål

> Hvis dette var mitt eget selskap og mitt eget omdømme: ville jeg gitt denne versjonen til de
> første betalende pilotkundene?

**JA.**

Med den ene, eksplisitte betingelsen at "gi til pilotkunder" faktisk betyr "sett den i drift et
sted ekte mennesker kan nå den, og se to-tre nye brukere faktisk trykke seg gjennom en ekte
arbeidsdag før den kalles en pilot" — ikke "publiser koden og anta resten fungerer." Alt som
kan bevises uten den siste, fysiske biten er bevist, gjentatte ganger, av flere uavhengige
gjennomganger som ikke bare gjentok hverandre men faktisk fant og rettet reelle feil hver gang
noen så nøyere etter. Det gjenstår ikke flere runder med analyse — det gjenstår å faktisk gjøre
de to tingene som alltid har stått igjen.

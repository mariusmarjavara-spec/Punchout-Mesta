# Post Sprint 3 — Strategisk gjennomgang

Ingen ny kode i dette dokumentet. Grunnlag: `docs/adapter-platform-report.md`,
`docs/pilot-human-factors-validation.md`, `docs/execution-sprint-3-report.md`, samt en ny,
faktabasert gjennomgang av `docs/deployment-decision.md`, `docs/pilot-operations.md`,
`docs/browser-readiness-protocol.md`, `docs/mobile-readiness-protocol.md`, `.github/workflows/ci.yml`,
`lib/backend/*`, `package.json`, og hele repoets `docs/`-mappe (7 filer totalt, listet under Oppgave 1).

**Det viktigste enkeltfunnet i denne gjennomgangen, ikke dekket av noen tidligere rapport**: dette
repoet har aldri hatt en bekreftet vellykket produksjonsbygg (`next build`), er ikke deployet noe
sted, har ingen Dockerfile/fly.toml/vercel.json, og `/api/operations-center` har **ingen
autentisering i det hele tatt** — hvem som helst som kjenner et org-navn kan hente telemetri,
eksportlogg og runtime-historikk. Dette endrer konklusjonen på "ville du startet pilot neste uke?"
mer enn noe UX-funn gjør.

---

## Oppgave 1 — Produktmodenhet

| Område | Score | Begrunnelse |
|---|---|---|
| Motor | 8/10 | Deterministisk, frosset, testet gjennom vm-sandbox mot alle 4 org-pakker + 13 historiske regresjonscaser. Noen døde legacy-grener (FINISHED-migrering), men ingen kjente aktive bugs. |
| Runtime | 8/10 | Compiler, versjonering, rollback, checksum-kollisjon fikset og testet. Solid. |
| Completion Engine | 7,5/10 | Regelmotor testet på tvers av org-er, deterministisk prompt-kø. Ingen kjente svakheter, men mindre direkte gransket denne sesjonen enn Motor/Runtime. |
| Adapter Platform | 6,5/10 | Mekanismen er reelt bevist (registry, capability-modell, 4 uavhengige adaptere, golden/contract/failure/perf-tester grønne) — men **ubevist mot noe reelt eksternt system**. Landax er uttrykkelig fiktiv. |
| UI | 5/10 | Ryddig React/Tailwind-struktur, men aldri kjørt på en ekte enhet eller nettleser (readiness-protokollene er "forberedt, ikke utført"). Ingen PWA (ingen manifest/service worker) for en app bygget for feltbruk. |
| UX | 6/10 | Sprint 3 lukket 2 av 5 hovedfunn reelt (korrigering, offline-synlighet), 1 delvis (tale), 1 er kodemessig klar men inaktiv (påkrevd), 1 uendret (vokabular) — men alt dette er fortsatt kun validert i simulering, aldri mot en ekte bruker. |
| Offline | 6/10 | Arkitektonisk sterk (lokal-først, robust synk med backoff/dedup, bevist i regresjon) — men aldri testet i flymodus på en ekte telefon, noe mobile-readiness-protokollen selv flagger som det mest verdifulle uverifiserte sjekkpunktet. |
| Voice | 5/10 | Ekte Web Speech API-integrasjon, nett-avhengighet nå kommunisert proaktivt (Sprint 3), men ingen korreksjonssteg for feilhørt tale, og aldri testet med en ekte mikrofon i feltstøy. |
| Telemetri | 4,5/10 | To parallelle, lokal-først telemetrisystemer (motor + ny UX-telemetri) — men ingen feil-/krasjrapportering (ingen Sentry-lignende verktøy), og `/api/operations-center` er helt uten autentisering. |
| Testing | 6,5/10 | 70 regresjonscaser, sterk disiplin på motor/runtime/backend/adapter/UX-logikk-nivå — men null jsdom/komponenttesting, null e2e/nettleser-testing, og `next build` har aldri kjørt i CI. |
| Dokumentasjon | 5,5/10 | 7 dokumenter, uvanlig ærlige om egne begrensninger ("forberedt, ikke utført") — men ingen README, ingen arkitekturoversikt, ingen onboarding-guide, miljøvariabler udokumentert utenfor kildekode. |
| Deploy | 2/10 | **Aldri deployet noe sted.** Ingen Dockerfile, ingen fly.toml/vercel.json. `next build` har aldri lyktes bekreftet utenfor sandkasse-miljøet det ble skrevet i (kjent feil: Google Fonts-henting). |
| Support | 4/10 | `pilot-operations.md` gir et reelt, konkret driftsopplegg (daglig sjekkliste, hendelsessjekklister) — men backup-gjenoppretting er aldri testet, og ingen feilrapportering fra faktiske krasj. |
| Drift | 3,5/10 | In-memory state + én JSON-fil med manuell daglig kopiering av én navngitt person. Ingen automatisert backup, ingen overvåkning/alarmering utover en helse-endepunkt noen må sjekke manuelt. |
| Pilotberedskap (samlet) | 5/10 | Kjernelogikken er langt mer moden enn driftsveien til den. Koden er nærmere pilotklar enn deploy-prosessen er. |

**Samlet produktmodenhet: ~5,5/10.** Ikke fordi produktlogikken er svak (den er faktisk sterk),
men fordi driftsveien fra "kode som fungerer i tester" til "noe en ekte pilotbruker kan åpne på
telefonen sin" aldri er bygget eller bekreftet.

---

## Oppgave 2 — Gjenværende svakheter

### Kritiske (må løses før pilot)

1. **Bekreft at `next build` faktisk lykkes** utenfor forfatter-miljøet. Alt annet er irrelevant
   hvis dette feiler. (Grunnlag: `deployment-decision.md`s egen innrømmelse; ingen CI-steg kjører
   `next build` i dag.)
2. **Stå opp en reell driftsmiljø** (Dockerfile + Fly.io/Railway + persistent volum +
   `PUNCHOUT_ADMIN_TOKEN` som ekte hemmelighet). I dag finnes ingen levende instans noe sted.
   (Grunnlag: `deployment-decision.md`.)
3. **Autentiser `/api/operations-center`.** I dag helt åpen — telemetri, eksportlogg og
   runtime-historikk for enhver organisasjon er hentbar uten token. (Grunnlag: kodegjennomgang
   denne sesjonen — ikke tidligere dokumentert noe sted.)
4. **Kjør browser- og mobile-readiness-protokollene minst én gang på ekte utstyr** — spesifikt de
   to sjekkpunktene protokollene selv flagger som høyest verdi og aldri utført:
   SchemaEditOverlay-lagring, og flymodus midt i eksport. (Grunnlag: begge protokolldokumentene,
   status "forberedt, ikke utført".)
5. **Test backup-gjenoppretting minst én gang.** `pilot-operations.md` sier selv dette bør skje
   før pilotstart; ingenting bekrefter at det har skjedd. (Grunnlag: `pilot-operations.md`.)

### Viktige (bør løses før offentlig beta)

1. Gi `ADMIN_CONFIG.requiredSchemas` en faktisk konfigureringsvei — Sprint 3s Oppgave 1-fiks er
   kodemessig korrekt men inaktiv uten dette. (Grunnlag: `execution-sprint-3-report.md`.)
2. Et minimalt lederverktøy for sanntidsoppfølging i felt — Wenche-personaens funn (formann får
   ingen ny kapasitet, bare nye uformelle support-forpliktelser) er uadressert gjennom alle tre
   sprintene. (Grunnlag: `pilot-human-factors-validation.md`, bekreftet fortsatt uløst i
   `execution-sprint-3-report.md`.)
3. Minimal feil-/krasjrapportering (selv bare en global `window.onerror` → telemetri). I dag er
   et ekte krasj i felt usynlig med mindre brukeren aktivt rapporterer det — og Human Factors
   Validation fant at nettopp de mest sårbare brukerne (Odd, Bjørg) er minst tilbøyelige til det.
   (Grunnlag: `pilot-human-factors-validation.md` + fravær av monitoring-verktøy i `package.json`.)
4. Et minimalt README + miljøvariabel-dokumentasjon + en "onboarde ny org/enhet"-runbook. I dag
   må man lese kildekode for å finne `PUNCHOUT_ADMIN_TOKEN`/`PUNCHOUT_DATA_DIR`. (Grunnlag:
   fravær av README/arkitekturdokument i `docs/`.)
5. Oppgave 5 (konfigurerbar terminologi) — **kun hvis** pilot utvides forbi de 4 eksisterende
   org-ene. Ikke nødvendig for pilot slik den er avgrenset i dag. (Grunnlag:
   `execution-sprint-3-report.md`.)

### Senere (kan trygt utsettes)

1. Flere adaptere mot reelle eksterne systemer — kun når et reelt integrasjonsmål finnes.
   (Grunnlag: `adapter-platform-report.md`s egen anbefaling.)
2. Full PWA (manifest/service worker) — offline fungerer allerede via localStorage; ikke
   blokkerende. (Grunnlag: `mobile-readiness-protocol.md`.)
3. Skille "venter" fra "synkroniserer" i synk-status — krever motor.js-endring, lav
   brukerkonsekvens. (Grunnlag: `execution-sprint-3-report.md`.)
4. Korreksjonssteg for feilhørt tale. (Grunnlag: `execution-sprint-3-report.md`, aldri en av de
   to kritiske UX-problemene.)
5. Adapter-SDK / baseklasse — allerede vurdert som prematurt med 4 adaptere. (Grunnlag:
   `adapter-platform-report.md`.)
6. Automatisert backup utover manuell daglig kopiering — `pilot-operations.md` begrunner selv
   at dette er unødvendig for en 4-ukers pilot av denne størrelsen.

---

## Oppgave 3 — Prioritert backlog (sortert etter ROI)

| # | Oppgave | Hvorfor | Forventet effekt | Kostnad | Risiko | Pilotpåvirkning |
|---|---|---|---|---|---|---|
| 1 | Autentiser `/api/operations-center` | Åpent data-endepunkt i dag | Lukker reelt sikkerhets-/tillitsgap | Lav (timer) | Lav | Blokkerende hvis oversett |
| 2 | Bekreft `next build` lykkes + legg til i CI | Aldri verifisert | Fjerner den største ukjente risikoen i hele prosjektet | Lav-middels (kan avdekke overraskelser) | Middels (ukjent inntil forsøkt) | Blokkerende |
| 3 | Minimalt README + miljøvariabel-dok | Null onboarding-dokumentasjon i dag | Reduserer fremtidig support-/overleveringskostnad kraftig for lav innsats | Lav (timer) | Ingen | Ikke blokkerende, men billig og verdifull |
| 4 | Stå opp reelt driftsmiljø (Fly/Railway + volum) | Ingen levende instans finnes | Gjør pilot fysisk mulig | Middels-høy (ukjent territorium) | Middels-høy | Blokkerende |
| 5 | Kjør browser-/mobile-readiness-protokollene (høyest-verdi sjekkene) | Aldri utført | Avdekker reelle enhetsbugs før pilotbrukere gjør det | Middels (avhenger av hva som avdekkes) | Middels | Blokkerende |
| 6 | Test backup-gjenoppretting | Ubekreftet | Beviser at driftsopplegget faktisk virker i praksis | Lav (timer) | Lav | Blokkerende |
| 7 | Minimal feil-/krasjrapportering | Krasj i felt er i dag usynlig | Reduserer support-blindsone kraftig for lav innsats | Lav-middels | Lav | Ikke blokkerende, høy langsiktig verdi |
| 8 | Skriv ned data-/GDPR-holdning for eksportert feltdata | Ingen dokument adresserer dette | Reduserer juridisk/omdømmerisiko | Lav (beslutning, ikke kode) | Lav (men høy hvis oversett) | Ikke blokkerende for en liten pilot, kritisk før skalering |
| 9 | Onboarding-runbook for ny org/enhet | Kun drift (dag 2+) er dokumentert, ikke oppstart (dag 0) | Reduserer friksjon når pilot faktisk starter | Lav | Lav | Ikke blokkerende |
| 10 | Konfigureringsvei for `ADMIN_CONFIG.requiredSchemas` | Sprint 3s fiks er inaktiv uten dette | Aktiverer en allerede bygget, men ubrukt sikkerhetsmekanisme | Middels (krever motor.js-unntak, se Oppgave 5-presedens) | Middels (frosset grense) | Ikke blokkerende for pilot |
| 11 | Minimalt lederverktøy for formenn | Wenche-funnet, uadressert i 3 sprinter | Gir en hel brukerrolle faktisk verdi, ikke bare nye plikter | Middels-høy | Lav | Ikke blokkerende for pilot, viktig for adopsjon |
| 12 | Oppgave 5 (konfigurerbar terminologi) | Vokabular passer kun 4 av 10 simulerte bransjer | Åpner produktet for flere bransjer | Middels-høy (frosset grense) | Middels | Kun relevant hvis pilot utvides |

---

## Oppgave 4 — Hvor overutvikler vi?

**"Engineering for engineering's sake":**
- Adapterplattformens fulle golden/contract/failure/performance-testsuite (36 tester) for 4
  adaptere der 3 er syntetiske og ingen har et reelt integrasjonsmål ennå. Verdifullt for å
  *bevise mekanismen* — men å bygge en 5. eller 6. adapter, eller en tyngre SDK, nå, ville vært
  ren spekulasjon uten en reell kunde/system å målrette mot.
- Presisjonen i synk-status (4 tilstander, nøye begrunnet skille mellom "venter" og
  "synkroniserer") — pilotbrukere vil sannsynligvis ikke skille mellom disse selv om vi kunne
  vist dem separat. Riktig kalt "godt nok" i Sprint 3-rapporten; videre presisjonsarbeid her ville
  vært overkill før reell brukerdata sier noe annet.
- Runtime sin capability-modell (`CapabilityProvider`/`CapabilityBinding` med kind-sjekking) er
  sofistikert for et system med 4 organisasjoner og en håndfull kjente providere. Ikke feil å ha
  bygget den slik — men å utvide den videre nå, uten flere reelle providere i sikte, ville vært
  å bygge for en fremtid som ikke er bekreftet ennå.

**Ting pilotbrukere sannsynligvis aldri legger merke til:**
- Nøyaktig ordlyd-forskjeller i synk-status-pillen.
- Adapter-registryets `countRecords`/kapabilitets-metadata — ren infrastruktur for fremtidig
  integrasjonsarbeid, usynlig for feltbrukeren.
- JSDoc-typedef-strenghet på tvers av `lib/`.
- Hele Oppgave 5-mekanismen (om den bygges) *hvis* ingen ny org faktisk onboardes i pilotperioden.
- Telemetri-hendelsestaksonomiens granularitet (6 UX-hendelsestyper) — nyttig for oss, usynlig
  for brukeren.

**Bør bevisst utsettes:** Oppgave 5 (til en 5. org faktisk skal onboardes), flere adaptere (til et
reelt mål finnes), full PWA (til offline-bruk faktisk viser et gap dagens løsning ikke dekker),
adapter-SDK.

---

## Oppgave 5 — Hvor undervurderer vi risiko?

- **Sikkerhet**: `/api/operations-center` uten autentisering er det klareste eksempelet — ingen
  tidligere rapport flagget dette, og det ble kun funnet ved å faktisk lese hvilke ruter som
  kaller `verifyAdminAuth()`. Dette er nøyaktig den typen funn som er lett å overse fordi
  *nabo*-endepunktene (`/api/runtime/*`, `/api/devices/*`) er korrekt sikret — man antar mønsteret
  gjelder overalt.
- **Deploy**: Tonen i `deployment-decision.md` er rolig og strukturert ("her er beslutningen, her
  er sjekklisten") på en måte som lett kan leses som "nesten klart", mens realiteten er at en
  vellykket produksjonsbygg aldri er bekreftet. Den typen overraskelse (en font-henting som
  feiler, en avhengighet som ikke bygger i en annen miljøkonfigurasjon) er nøyaktig det som spiser
  opp en "to uker før pilot"-buffer.
- **Onboarding/oppstart**: `pilot-operations.md` dekker drift *etter* at pilot har startet grundig
  — men ingen dokument beskriver hvordan en helt ny organisasjon eller enhet faktisk kommer i
  gang fra null (enhetsregistrering finnes teknisk som API, men ingen runbook eller UI leder en
  ekte administrator gjennom det).
- **Feilrapportering fra felt**: Ingen krasjrapportering finnes. Human Factors Validation fant
  gjentatte ganger at nettopp de brukerne som mest sannsynlig opplever problemer (lav digital
  selvtillit) er minst tilbøyelige til å rapportere dem proaktivt — support vil altså
  systematisk høre minst fra dem som sliter mest.
- **Backup/datatap**: Manuell daglig kopiering av én person er et reelt enkeltpunkt-svikt. Hvis
  den personen er syk eller på ferie når noe faktisk går galt, finnes ingen gjenopprettingsevne —
  og dette er aldri testet, kun beskrevet.
- **Personvern/GDPR**: Ingen dokument adresserer datalagring, sletting eller
  personopplysningsloven for eksportert feltdata (arbeidstider, lokasjon via stedsnavn, indirekte
  identifiserbare ansatte via enhets-/bruker-ID). For en norsk pilot med ekte ansattdata er dette
  ikke en teoretisk risiko — det er trolig et krav noen i organisasjonen må kunne svare på før
  reelle ansatte begynner å logge reell arbeidstid.

---

## Oppgave 6 — Pilot Readiness Review

**Ville jeg startet pilot neste uke? Nei.**

Ikke fordi produktlogikken er dårlig — den er faktisk solid, og UX-arbeidet i Sprint 3 var reelt
verdifullt. Det som stopper meg er utelukkende operasjonelt, ikke produktmessig:

1. Ingen bekreftet produksjonsbygg.
2. Ingen levende driftsmiljø.
3. Ett helt åpent data-endepunkt.
4. Null verifikasjon på ekte enhet/nettleser.
5. Ubekreftet backup-gjenoppretting.

Alle fem er kjente, avgrensede, løsbare oppgaver — ikke arkitektoniske problemer. Med to ukers
fokusert arbeid (se Oppgave 9) er "neste uke" realistisk å bli "om to-tre uker".

**Hvis svaret hadde vært ja, hva ville jeg overvåket ekstra nøye?** Eksport-suksessrate (allerede
i `/ops`), "kom dataene mine frem?"-support-henvendelser (bør falle etter Sprint 3s synk-status),
og — siden det er helt uverifisert — faktisk batteriforbruk/ytelse på ekte telefoner over en hel
arbeidsdag.

---

## Oppgave 7 — Beta Readiness Review

**Punchout er nærmere en intern beta enn en offentlig beta — men er strengt tatt ikke klar for
noen av dem ennå.**

Intern beta (kontrollert, 1 organisasjon, tett oppfulgt) er realistisk etter de 5 kritiske
punktene i Oppgave 6 er lukket. Offentlig beta (flere organisasjoner, mindre tett oppfølging,
selvbetjent onboarding) krever i tillegg: Oppgave 5 (terminologi, hvis flere bransjer skal inn),
reell overvåkning/alarmering (ikke bare et helse-endepunkt noen sjekker manuelt), en formell
GDPR-/personvernvurdering, og et onboarding-flow som ikke krever at en utvikler leser kildekode
for å konfigurere en ny organisasjon. Avstanden fra i dag til intern beta er uker; avstanden til
offentlig beta er måneder.

---

## Oppgave 8 — Lavthengende frukt (maks 10)

1. Autentiser `/api/operations-center`.
2. Bekreft at `next build` lykkes lokalt/i CI.
3. Legg `npm run build` til i CI som eget steg.
4. Skriv et minimalt README (formål, hvordan kjøre lokalt, hvor ting bor).
5. Dokumenter `PUNCHOUT_ADMIN_TOKEN`/`PUNCHOUT_DATA_DIR` ett sted.
6. Test backup-gjenoppretting én gang, skriv ned nøyaktig hvilke kommandoer som virket.
7. Kjør browser-readiness-protokollens viktigste sjekk (SchemaEditOverlay-lagring) på én ekte
   nettleser.
8. Kjør mobile-readiness-protokollens viktigste sjekk (flymodus midt i eksport) på én ekte telefon.
9. Legg til en global `window.onerror`-fanger som logger til eksisterende telemetri-infrastruktur.
10. Skriv ned en foreløpig data-/slettepolicy for eksportert feltdata (beslutning, ikke kode).

---

## Oppgave 9 — Én utvikler, to uker: konkret plan

**Dag 1–2**: Få en vellykket `next build` lokalt, rett det som feiler (kjent risiko: fonthenting).
Stå opp minimal Fly.io/Railway-instans med persistent volum og `PUNCHOUT_ADMIN_TOKEN` som ekte
hemmelighet.

**Dag 3**: Autentiser `/api/operations-center`. Legg `next build` til i CI.

**Dag 4**: Kjør browser- og mobile-readiness-protokollene fullt ut på ekte utstyr. Sett av hele
dagen som buffer — dette er reelt ukjent territorium, og noe vil sannsynligvis dukke opp.

**Dag 5**: Test backup-gjenoppretting. Skriv ned prosedyren.

**Dag 6**: Minimal feil-/krasjrapportering (global handler → telemetri).

**Dag 7**: README + miljøvariabel-dokumentasjon + en kort "onboarde ny org/enhet"-runbook.

**Dag 8**: Skriv ned data-/GDPR-holdning (beslutning, evt. kort samtale med den som eier
compliance-ansvaret — ikke rent utviklerarbeid, men bør startes nå, ikke etter pilotstart).

**Dag 9–10**: Buffer for det dag 4 avdekket. Hvis lite dukket opp: neste post i "Viktige"-listen
(sannsynligvis skjelett til formanns-verktøy, siden det er den eneste "Viktige"-posten som ikke
krever et unntak i frosset kode).

**Eksplisitt ikke i denne planen**: flere adaptere, Oppgave 5-terminologi, adapter-SDK, mer
UX-polering. Den største risikoen akkurat nå er ikke "UX har flere ru kanter" — det er "vi har
aldri deployet dette eller kjørt det på en ekte enhet".

---

## Oppgave 10 — Om dette var mitt eget selskap

Ærlig: **jeg ville stoppet videre funksjonsutvikling nå.** Ikke fordi noe er bygget feil, men
fordi produktlogikken har løpt fra den operasjonelle virkeligheten — vi har et system som består
70 automatiserte tester og aldri har møtt en ekte bruker på en ekte telefon. Det er en farlig
kombinasjon: den gir en falsk følelse av modenhet.

Jeg ville brukt de neste to ukene nøyaktig som i Oppgave 9 — ikke som "enda en sprint", men som
selve portvakten for om pilot i det hele tatt kan starte. Jeg ville *ikke* latt press om flere
bransjer, flere adaptere, eller mer UX-polering flytte fokus vekk fra dette, uansett hvor
fristende "lavthengende frukt" et nytt scope-punkt måtte virke. Når de to ukene er unnagjort:
pilot med de 4 eksisterende organisasjonene, ikke bredere. Bruk piloten selv — ikke flere
simuleringer — til å avgjøre hva som faktisk trengs videre.

---

## Sluttrapport

**Produktets modenhet**: ~5,5/10 samlet. Kjernelogikk (Motor/Runtime/Completion Engine) 7,5–8/10.
Adapterplattform og UX 6–6,5/10 (mekanismen bevist, virkeligheten ubevist). Deploy/Drift 2–3,5/10
— den klart svakeste dimensjonen, og den som faktisk avgjør om pilot kan starte.

**Gjenværende teknisk risiko**: Ubekreftet produksjonsbygg; ingen levende driftsmiljø; manuell,
utestet backup; ingen feil-/krasjovervåkning.

**Gjenværende UX-risiko**: Oppgave 5 (vokabular) uendret for 6 av 10 simulerte bransjer; Oppgave
1s fiks kodemessig klar men inaktiv; ingen reell enhets-/nettleserverifikasjon utført ennå; intet
lederverktøy for formenn.

**Pilotrisiko**: Høy inntil de 5 kritiske punktene i Oppgave 6 er lukket — ikke pga.
produktkvalitet, men pga. manglende driftsklarhet.

**Supportrisiko**: `/api/operations-center` uten autentisering; krasj i felt usynlig for support;
enkeltpunkt-sviktende backup-rutine.

**Driftsrisiko**: In-memory state med én JSON-fil og manuell daglig kopi av én person; ingen
automatisert overvåkning utover et helse-endepunkt noen må huske å sjekke.

**De 10 viktigste anbefalingene**: se Oppgave 3-tabellen (rangert etter ROI) — de 6 første er
identiske med de 5 kritiske + README-punktet.

**Hva som ikke bør utvikles videre nå**: flere adaptere, Oppgave 5-terminologi (før en 5. org
faktisk skal inn), adapter-SDK, videre presisjon i synk-status, full PWA, korreksjon for feilhørt
tale — se Oppgave 4.

**Ville jeg startet pilot neste uke?** Nei — se Oppgave 6.

**Ville jeg startet intern beta?** Ikke ennå, men realistisk om to-tre uker etter de kritiske
punktene er lukket.

**Ville jeg startet offentlig beta?** Nei, betydelig lenger unna — måneder, ikke uker, og krever
i tillegg Oppgave 5, reell overvåkning, og en formell personvernvurdering.

### Oppdatert Roadmap (maks 3 faser)

**Fase 1 — Driftsherding (2 uker)**: Nøyaktig Oppgave 9s plan. Mål: en pilot kan fysisk og trygt
starte. Ingen ny produktfunksjonalitet.

**Fase 2 — Pilot & lær (pilotperioden, ~4 uker per `pilot-operations.md`s egen antakelse)**: Kjør
faktisk pilot i de 4 eksisterende org-ene. Bruk den nye UX-telemetrien og `/ops`-dashbordet til å
observere ekte bruk. Prioriter "Viktige"-lista på nytt basert på ekte pilotdata, ikke simulerte
personaer.

**Fase 3 — Skaleringsbeslutning (etter pilot, før beta)**: Basert på faktiske pilotfunn: avgjør
om Oppgave 5 (terminologi), en reell ekstern adapter, formanns-verktøy, og
overvåkning/personvern-modenhet er verdt å investere i for en bredere offentlig beta — ikke før.

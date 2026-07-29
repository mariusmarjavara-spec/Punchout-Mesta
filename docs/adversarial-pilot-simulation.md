# Punchout — Adversarial Pilot Simulation (10 brukere som aktivt prøver å knekke systemet)

Ingen kode er endret eller gjennomgått i dette dokumentet. 10 realistiske, lett aggressive
pilotbrukere presses gjennom en arbeidsdag og bevisst rare handlinger. Alle tekniske påstander
under er verifisert direkte mot koden (ikke antatt) før de ble brukt i en brukerhistorie — se
funn-boksene under hver relevante bruker for eksakte kildehenvisninger.

## Seks bekreftede tekniske funn brukt i simuleringen

Disse ble slått fast FØR personaene ble skrevet, slik at historiene bygger på ekte oppførsel:

1. **Ingen fane-synkronisering finnes.** `saveCurrentDay()` (`motor.js:904-921`) skriver *hele*
   `dayLog`-objektet til `localStorage` hver gang, uten versjonssjekk. To faner åpne samtidig:
   den som lagrer sist vinner fullstendig — taperens endringer forsvinner stille, ingen
   sammenslåing, ingen advarsel.
2. **Refresh sletter ulagret UI-tilstand stille.** `inputText`, `editText`, og `pendingReview`
   (den strukturerte ordre-gjenkjenningen) er alle vanlig React-`useState` i
   `operations-phase.tsx`, aldri lagret til `localStorage`. F5 fjerner dem sporløst — ingen
   `beforeunload`-advarsel finnes noe sted i kodebasen.
3. **Flere knapper mangler dobbelttrykk-beskyttelse.** "Gå til drift"/"Avslutt dag"/"Lås dag"
   har en 500ms-sperre. "Start dag" (`start-day-phase.tsx:259`), håndrens sine
   bekreft/forkast-knapper (`handrens-phase.tsx:183,230,238,313,338,345`), og
   skjema-redigeringens "Lagre"/"Lagre og bekreft" (`start-day-phase.tsx:814`) har det **ikke**.
4. **Ingen lengde- eller innholdsvalidering** på loggtekst (`motor.js`s `submitEntry`/`saveEdit`)
   — og `saveCurrentDay()` har ingen egen håndtering for `QuotaExceededError`; en mislykket
   lagring midt i en arbeidsøkt trigger den samme blokkerende `StorageErrorOverlay`en som en
   korrupt fil ved oppstart.
5. **Dato beregnes kun fra enhetens klokke**, ingen validering. `dayLog.date` bruker
   `toISOString()` (UTC), mens klokkeslett i loggen bruker lokal tid — kan vise "i går" i
   stale-day-banneret rett etter midnatt lokal tid selv om alt er normalt. En feilstilt
   enhetsklokke oppdages **aldri**.
6. **`/ops`-dashbordet er reelt ødelagt etter Sprint 4.** Sikkerhetsfiksen som la til
   autentisering på `/api/operations-center` la aldri til noen måte å skrive inn et
   admin-token PÅ `/ops`-siden selv (`app/ops/page.tsx` har null `token`/`Authorization`-logikk
   noe sted). Enhver som åpner `/ops` i dag ser `"Feil 401 fra API"` — inkludert en legitim
   administrator som følger `pilot-operations.md`s Daily Checklist steg 3.

---

## De 10 brukerne

### 1. Kjetil, 52 — erfaren bas

**Profil**: 24 år i bransjen, prøver systematisk å "lure" nye verktøy før han stoler på dem.
Middels teknisk, men nysgjerrig og stahet.

**Dagen**: Åpner appen på jobbtelefonen, men har fra i går en gammel fane liggende åpen på
nettbrettet på kontoret. Uten å tenke over det starter han dagen på telefonen. Timer senere
husker han nettbrettfanen og trykker "oppdater" på DEN i stedet — den har fortsatt gårsdagens
tilstand i minnet, men siden `appState`/`dayLog` lastes fra `localStorage` ved refresh, viser den
nettopp *telefonens* skrevne data (siste skriv vinner globalt sett, ikke per fane) — forvirrende,
men ikke direkte datatap denne gangen fordi han ikke rekker å skrive noe på nettbrettet før han
oppdager det. Prøver deretter bevisst: registrerer en oppføring på telefonen, registrerer en
ANNEN oppføring på nettbrettet uten å oppdatere det først, og sammenligner. **Nettbrettets skriv
overskriver telefonens** — telefon-oppføringen er borte, ingen feilmelding noe sted.

*"Vent, hvor ble den forrige oppføringen min av?"* → *"Dette systemet later som ingenting skjedde
— det bare... forsvant."*

**Feil funnet**: Bekrefter funn #1 (fane-klobbing) med et bevisst, gjentatt eksperiment.

**Support**: 1 henvendelse, høy alvorlighetsgrad — "systemet mistet en registrering, ingen
feilmelding." Kunne vært unngått med en cross-tab-varsling, men ikke med bedre opplæring alene —
dette er en reell arkitektursvakhet.

---

### 2. Sara, 19 — nyansatt sommervikar

**Profil**: Rutinert med mobil, leser aldri instruksjoner, kjeder seg fort. Lav bransjeerfaring,
høy generell skjermkompetanse.

**Dagen**: Klikker gjennom pre-day på sekunder. Skriver "asdasd 😂😂😂 hallo??" i loggen for å se
hva som skjer — det logges helt normalt, ingen reaksjon fra systemet (funn #4: ingen
innholdsvalidering). Synes det er morsomt, limer inn en hel sang-tekst hun kopierte fra en
annen app (rundt 2000 tegn) som en "oppføring" — også dette godtas uten problemer. Dobbelttrykker
"Logg"-knappen fordi hun er vant til at apper "noen ganger ikke registrerer trykket første
gang" — siden `handleSubmitEntry` ikke har noen sperre, havner den samme teksten i loggen **to
ganger**. Legger ikke merke til duplikatet selv.

*"Haha, den tok jo alt jeg skrev."* → *"Er det no forskjell om jeg trykker en eller to ganger?"*

**Feil funnet**: Bekrefter funn #3 og #4 sammen — duplikatoppføring fra rask dobbelttrykk på
selve loggeknappen (ikke bare de allerede kjente, beskyttede knappene).

**Support**: 0 henvendelser fra Sara selv (hun merker ikke noe galt) — men formann vil senere se
en duplisert, useriøs oppføring i dagsrapporten og lure på hva som skjedde. Indirekte
support-belastning, lav-middels alvorlighet, men irriterende for datakvalitet.

---

### 3. Ingvild, 41 — stresset formann

**Profil**: Ansvar for 6 personer samtidig, konstant avbrutt, høy erfaring men lite tid til å
være grundig. Middels teknisk.

**Dagen**: Starter en registrering, blir avbrutt av en telefon fra en av sine ansatte midt i.
Lukker fanen for å svare (ikke bare bakgrunnen — hun trykker faktisk krysset på fanen fordi hun
"må konsentrere seg om samtalen"). Kommer tilbake 25 minutter senere, åpner appen på nytt fra
hjemmeskjerm-ikonet. Alt hun hadde skrevet i tekstfeltet er borte (funn #2) — hun trodde det lå
og ventet. Blir merkbart irritert, skriver oppføringen på nytt, denne gangen ferdig. Senere på
dagen prøver hun bevisst å "teste systemet": går tilbake i telefonens navigasjonshistorikk
(back-knapp) midt i håndrens — siden hele appen er én eneste rute (`app/page.tsx`), gjør
tilbake-knappen ingenting nyttig; den navigerer telefonens nettleser bort fra appen helt, ikke
til en tidligere "side" i flyten, noe hun finner forvirrende men ufarlig.

*"Jeg trodde da vitterlig jeg hadde skrevet noe der!"* → *"Greit at tilbake-knappen ikke gjør
noe rart, men den gjør jo ingenting i det hele tatt."*

**Feil funnet**: Bekrefter funn #2 (lukket fane = mistet ulagret tekst) og funn #6 (indirekte —
hun er akkurat den typen bruker `pilot-operations.md`s Daily Checklist forventer skal bruke
`/ops`, og ville støtt på det ødelagte dashbordet om hun fikk tilgang).

**Support**: 1-2 henvendelser i måneden, lav-middels alvorlighet enkeltvis ("jeg mistet det jeg
skrev"), men gjentagende og med potensial til å undergrave tillit til appen som "pålitelig."

---

### 4. Reidar, 58 — skogsentreprenør

**Profil**: Jobber alene, dagevis uten fysisk kontakt med andre, ekstremt lang erfaring med
utstyr generelt, lav-middels digital kompetanse men tålmodig.

**Dagen**: Kjører inn i hogstfeltet uten dekning i 6+ timer, akkurat som i forrige fases
simulering — men denne gangen tester han bevisst grensene: lar telefonen ligge fremme med appen
åpen HELE dagen uten å røre den mellom oppføringer (7+ timer skjermtid), for å se om "den bare
gir opp." Den gjør ikke det — ingen timeout, ingen automatisk utlogging, siden det ikke finnes
noe slikt konsept i appen. Mister nett, får det tilbake idet han kjører ut av feltet, ser
synk-pillen (fra forrige sprint) skifte fra "Lagret lokalt" til "Synkroniserer..." uten at han
måtte gjøre noe. Prøver bevisst å endre datoen på telefonen sin manuelt (for å se "hva som
skjer") etter å ha lest at han skal "prøve rare ting" — setter klokka en dag frem midt i økten.
Ingenting reagerer: appen fortsetter å logge under den nye (feilaktige) datoen uten en eneste
advarsel (funn #5) — han skjønner ikke selv at dette har skjedd, og oppdager det ikke før
formann spør hvorfor dagsrapporten hans har feil dato.

*"Den bare fortsetter å virke, det er jo bra."* → (uvitende) *ingen tanke om datoen i det hele
tatt — det er nettopp poenget.*

**Feil funnet**: Bekrefter at lang oppetid er trygt (positivt funn), OG bekrefter funn #5 —
ingen klokke-/datovalidering, med en konkret, realistisk utløsende handling (manuell
klokkejustering, ikke bare tidssoner).

**Support**: 1 henvendelse — ikke fra Reidar selv (han vet ikke noe er galt), men fra formannen
som oppdager feil dato i etterkant og må spørre hva som skjedde. Lav frekvens, men vanskelig å
feilsøke i etterkant siden appen ikke logger at en dato-endring skjedde.

---

### 5. Camilla, 34 — elektriker

**Profil**: Jobber solo på kundeoppdrag, forsiktig og metodisk av yrkeskultur (feil i
elektrofag er farlig), middels-høy teknisk kompetanse.

**Dagen**: Registrerer arbeid gjennom dagen uten problemer. Mot slutten oppdager hun en
feilregistrering fra tidlig på dagen (feil kundeadresse) — bruker den nye "Logg rettelse"-flyten
riktig og pent. Blir så nysgjerrig: kan hun rette rettelsen sin også, hvis HUN gjorde en
skrivefeil i selve rettelsesteksten? Skriver en rettelse, oppdager en skrivefeil i den, og prøver
å trykke på RETTELSES-oppføringen for å redigere den — den er en vanlig, ulåst "notat"-oppføring
akkurat som alle andre notater inntil den låses av en senere handling, så det FUNGERER faktisk
(hun kan redigere den mens den er ulåst) — men systemet gir henne ingen indikasjon på at dette er
"en rettelse av en rettelse" eller noen advarsel om at kjeder av rettelser kan bli vanskelige å
følge for noen som leser rapporten senere. Prøver også å dobbelttrykke "Bekreft"-knappen i
håndrens for et RUH-skjema hun er usikker på, i håpet om at "et ekstra trykk sikrer at det tok" —
ufarlig her siden RUH allerede krever et eget "Behandle"-steg først, men prinsipielt samme
mangel som funn #3.

*"Kan jeg rette rettelsen min? ... Ja, det gikk. Men vet noen at dette henger sammen?"*

**Feil funnet**: Ikke en bug i teknisk forstand, men en reell UX-svakhet: rettelsesflyten
(Sprint 3) har ingen strukturell kobling mellom original og rettelse utover tekstkonvensjonen
`"Rettelse til kl X: ..."` — en rettelse-av-en-rettelse er fullt mulig og udetekterbar for en
leser i etterkant, akkurat som Sprint 3s eget "Nye UX-risikoer"-avsnitt advarte om.

**Support**: 0 henvendelser fra henne selv, men et reelt fremtidig "hvorfor er det tre
oppføringer om samme sak her?"-spørsmål fra hvem som helst som leser rapporten.

---

### 6. Thomas, 29 — kommunal drift

**Profil**: Avslappet, lite bekymret for konsekvenser, jobber i team med lav
alvorlighetsgrad-oppgaver (park, snørydding). Middels teknisk.

**Dagen**: Synes hele "eksporter dagen"-greia er unødvendig formell for en jobb som å klippe
gress. Trykker "Prøv igjen" på en (simulert, av ham selv ved å skru på flymodus rett før
låsing) mislykket eksport **fem ganger på rad** i løpet av et minutt, "for å se om det hjelper."
Siden `motor.syncExports()` allerede har innebygd retry-logikk uavhengig av manuelle klikk, gjør
de ekstra klikkene ingen skade (idempotent på `exportId`), men han får heller ingen tilbakemelding
om AT han spammer en allerede pågående prosess — knappen gir ingen "vent litt"-indikasjon mellom
klikk. Limer også inn en rekke spesialtegn han finner på tastaturet sitt (`<>&"';DROP TABLE`,
mest for å se hva som skjer, ikke ondsinnet) som en oppføringstekst — logges helt normalt som ren
tekst, ingen spesialbehandling, ingen feil.

*"Går det an å eksportere for mye?"* → *"Denne knappen gjør ingenting synlig, jeg trykker igjen."*

**Feil funnet**: Ingen datafeil (eksport er robust, som tidligere bevist), men en reell
UX-mangel: "Prøv igjen"-knappen gir ingen visuell tilbakemelding om at et forsøk faktisk er i
gang, noe som direkte inviterer til akkurat denne typen unødvendig gjentatt klikking.

**Support**: 0 henvendelser (ingen faktisk feil), men bekrefter et lite, reelt
tilbakemeldings-hull i UI-et.

---

### 7. Åse, 47 — banearbeider

**Profil**: 19 år i jernbanebransjen, sikkerhetskultur gjennomsyrer alt hun gjør, skeptisk til
"myke" systemer, spør "hvorfor" om alt. Lav-middels teknisk.

**Dagen**: Leser faktisk all tekst (uvanlig i denne gruppen) og stiller seg kritisk til hver
eneste knapp. Prøver bevisst å omgå arbeidsflyten: kan hun nå "håndrens" uten å ha avsluttet
dagen ordentlig? Nei — det er ingen egen URL/rute å hoppe til (funn #6s andre halvdel: kun
`app/page.tsx` og `app/ops` finnes, ingen egen håndrens-URL), så hun kan ikke "snike seg forbi"
noe steg via adressefeltet, kun via knappene appen selv viser henne. Prøver å låse dagen med et
ubehandlet punkt gjenstående — riktig nok blokkert (ingen låseknapp vises i det hele tatt før alt
er behandlet, bekreftet uendret oppførsel). Prøver til slutt å dobbelttrykke "Bekreft
timeark"-knappen i håndrens raskt for å se om hun kan "lure" systemet til å godta timer uten
lønnskoder — siden knappen er `disabled` når lønnskoder mangler, virker ikke dobbelttrykket i det
hele tatt her; ufarlig, men samme underliggende mangel på ferdselsbeskyttelse som funn #3 ville
gjort utslag et annet sted.

*"Hvorfor er ikke denne knappen der før jeg er ferdig? ... Bra, det er den ikke."* → *"Jeg
skjønner ikke hvorfor jeg må gjøre alt dette, men jeg klarer i det minste ikke å hoppe over
noe."*

**Feil funnet**: Ingen nye bugs — en systematisk, positiv bekreftelse av at
arbeidsflyt-rekkefølgen faktisk håndheves der det teller (låsing, timeark), selv om enkelte
underliggende knapper mangler generell dobbelttrykk-beskyttelse.

**Support**: 0 henvendelser — Åse er den brukeren som stiller flest spørsmål muntlig til formann
i stedet for å sende inn noe, noe som er en annen (mindre målbar) form for support-belastning.

---

### 8. Bjørnar, 44 — maskinfører

**Profil**: Tykke hansker, kald vær, utålmodig med skjermer generelt. Middels erfaring med
appen (brukt den noen uker), lav-middels teknisk.

**Dagen**: Frustrert over at skjermen ikke alltid registrerer trykk gjennom hanskene —
kompenserer ved å trykke hardt og RASKT, ofte flere ganger på rad på samme knapp "for
sikkerhets skyld". I håndrens trykker han "Bekreft" på et vaktlogg-punkt tre ganger i rask
rekkefølge fordi skjermen ikke reagerte visuelt fort nok for hans smak. Siden denne knappen ikke
har noen dobbelttrykk-sperre (funn #3), er det reelt uklart hva som skjer ved de påfølgende
trykkene på et allerede-bekreftet punkt — sannsynligvis et no-op siden punktet forsvinner fra
den ubehandlede listen etter første vellykkede kall og påfølgende trykk derfor treffer tomrom,
men dette er ikke direkte bekreftet mot `resolveItem()`s oppførsel på en allerede-løst
id, og bør verifiseres eksplisitt fremfor antatt trygt. Opplever også at appen "henger" når han
mister nett midt i en taleregistrering — det er egentlig bare den allerede kjente 15-sekunders
timeout-mekanismen, men for en utålmodig bruker med hansker føles 15 sekunder som en evighet, og
han rekker å trykke mikrofonknappen tre ganger til før den løser seg selv.

*"Kom igjen da!"* → *"Virker som denne stopper opp hele tiden."*

**Feil funnet**: Bekrefter funn #3s praktiske konsekvens for en reell brukstype (hansker, kulde,
utålmodighet) fremfor bare teoretisk — og flagger et **åpent, ikke-bekreftet spørsmål**: er
gjentatte `resolveItem()`-kall på et allerede løst punkt trygt (no-op) eller kan det forårsake en
uventet tilstand? Anbefales verifisert eksplisitt, ikke antatt.

**Support**: 1-2 henvendelser i måneden, lav-middels alvorlighet ("knappene er trege") — mer et
persepsjonsproblem (ingen tydelig "mottatt trykk"-tilbakemelding) enn en faktisk funksjonsfeil.

---

### 9. Marit, 63 — svært lav digital kompetanse

**Profil**: 38 år i bransjen, eier smarttelefon men bruker den minimalt, reell angst for å
"ødelegge noe digitalt."

**Dagen**: Går forsiktig gjennom dagen, akkurat som i forrige fases simulering. Denne gangen:
midt i en tekstregistrering fryser hun opp av usikkerhet, lar telefonen ligge urørt i 10
minutter mens hun tenker seg om, og trykker til slutt "oppdater" på siden fordi en kollega sa
"prøv å laste siden på nytt hvis noe er rart" — en generisk digital-førstehjelp-regel hun har
lært seg. Dette sletter akkurat den halvferdige teksten hun brukte 10 minutter på å formulere
riktig (funn #2), uten en eneste advarsel. Hun tolker den tomme boksen som "jeg gjorde noe
galt" fremfor "appen slettet arbeidet mitt" — skylder på seg selv, sier ingenting til noen, og
gir opp å skrive den oppføringen i det hele tatt resten av dagen.

*"Å nei, hva gjorde jeg nå..."* → *(sier ingenting, antar det er hennes egen feil, logger
mindre resten av dagen)*

**Feil funnet**: Den klareste, mest menneskelig alvorlige bekreftelsen av funn #2 i hele
simuleringen — ikke fordi mekanismen er uvanlig, men fordi konsekvensen for AKKURAT denne
brukertypen er total stillhet: ingen support-henvendelse sendes, ingen blir varslet, og brukeren
konkluderer feilaktig at problemet er hennes egen inkompetanse. Dette er et mønster som aldri vil
vise seg i supportstatistikk, kun i redusert datakvalitet og stille mistillit.

**Support**: 0 henvendelser — og det ER selve problemet, ikke fraværet av et.

---

### 10. Fredrik, 26 — ekstremt effektiv superbruker

**Profil**: Bruker appen daglig, kjenner den godt, liker å teste grenser "for gøy" og fordi han
faktisk bryr seg om at den skal bli bedre. Høy teknisk kompetanse.

**Dagen**: Kjører gjennom en vanlig dag på rekordtid, deretter bruker resten av tiden sin på å
teste ting bevisst og systematisk. Åpner appen i to faner samtidig med vilje (bekrefter funn #1
identisk til Kjetil, men mer metodisk — han klarer å reprodusere det pålitelig tre ganger).
Limer inn en 50 000 tegns tekstblokk (kopiert fra en offentlig lisensfil) som en "stress-test"-
oppføring — den godtas uten feil, men han merker at appen blir merkbart tregere å scrolle i
loggen etterpå (mange, lange DOM-noder). Gjetter seg til `/ops`-URL-en ut fra nysgjerrighet
("sikkert et adminpanel et sted") og finner den — ser `"Feil 401 fra API"` med en gang, skjønner
ikke hvorfor en side som eksisterer i appen bare viser en feilmelding, og lurer på om DETTE er en
bug eller om han "ikke skal være der." Rapporterer det videre til formann/prosjektleder som en
avvik, siden han er den eneste av de 10 som faktisk sender inn en presis, velformulert
feilrapport.

*"Wow, den tålte det faktisk."* → *"Hva er dette 401-greiene? Er dette ment å være tilgjengelig
for meg eller ikke?"*

**Feil funnet**: Bekrefter funn #1 metodisk og pålitelig, funn #6 direkte (finner det ødelagte
`/ops`-dashbordet ved nysgjerrighet, ikke ved å følge en instruks), og et nytt, mildt
ytelsesfunn: svært lange oppføringer gjør loggvisningen merkbart treg (ingen virtualisering av
listen er bekreftet å finnes — bør verifiseres, ikke re-gransket i denne simuleringen siden det
krever kodegransking utenfor denne oppgavens rammer).

**Support**: 1 henvendelse, høy kvalitet — den eneste presise, reproduserbare feilrapporten av
alle 10, og den mest verdifulle for et team som faktisk følger opp.

---

## Samlet analyse

### Kritiske (kan stoppe pilot)

1. **Fane-klobbing — stille, fullstendig datatap.** To faner/enheter med samme
   bruker-`localStorage`-kontekst (usannsynlig, men reelt for delte nettbrett eller en glemt
   fane fra i går) fører til at den ene versjonens hele dags-delta forsvinner uten varsel, uten
   feilmelding, uten loggspor. **Hvordan funnet**: Kjetil (persona 1) og Fredrik (persona 10),
   uavhengig av hverandre. **Hvorfor det skjer**: `saveCurrentDay()` gjør en full
   objekt-overskriving uten versjonssjekk (`motor.js:904-921`), og det finnes ingen
   cross-tab-synkronisering (`storage`-event eller `BroadcastChannel`) noe sted. **Alvorlighet**:
   Høy — ekte, permanent datatap uten spor. **Sannsynlighet**: Lav-middels i en typisk pilot
   (krever to samtidige økter), men ikke usannsynlig for delt utstyr eller en bruker med app
   installert både som PWA-snarvei og i nettleser samtidig. **Anbefalt løsning**: Minimum et
   `storage`-event-lyttepunkt som varsler "denne fanen er ikke lenger den nyeste — last inn på
   nytt før du fortsetter" — ikke en full merge-løsning (for stor endring for frosset motor),
   men en varsling er realistisk og treffer roten.

2. **`/ops`-dashbordet er reelt ødelagt.** Sprint 4s egen sikkerhetsfiks fjernet
   admin-funksjonaliteten fra det eneste verktøyet `pilot-operations.md`s Daily Checklist
   forutsetter fungerer. **Hvordan funnet**: Fredrik (nysgjerrighet), ville også blitt funnet av
   enhver formann/driftsleder som faktisk fulgte den dokumenterte daglige rutinen. **Hvorfor det
   skjer**: `app/ops/page.tsx` har aldri hatt noen token-inndata, og trengte det ikke før
   Sprint 4 la til autentisering på API-et den kaller. **Alvorlighet**: Kritisk — den
   dokumenterte driftsrutinen fra forrige sprint er nå ikke-utførbar som beskrevet.
   **Sannsynlighet**: Sikker — dette skjer hver gang noen faktisk åpner siden, ikke en
   sjelden hendelse. **Anbefalt løsning**: Legg til et enkelt token-inndatafelt på
   `/ops`-siden (lagret i en `useState`/`sessionStorage`, sendt som `Authorization`-header) —
   liten, avgrenset UI-endring, ingen frosset kode berøres.

### Høy prioritet (bør løses før offentlig beta)

1. **Refresh sletter ulagret UI-tilstand stille** — bekreftet av tre uavhengige personaer
   (Ingvild, Marit, indirekte Sara). Alvorlighet høy for akkurat de brukerne (lav digital
   selvtillit) som allerede var identifisert som mest sårbare i tidligere rapporter — nå med et
   presist, teknisk grunnlag (`inputText`/`editText`/`pendingReview` er ikke-persisterte
   `useState`). Anbefalt løsning: enten en enkel `beforeunload`-advarsel når disse har innhold,
   eller (bedre, mindre påtrengende) persister `inputText` til `localStorage` løpende (debounced)
   slik at en refresh gjenoppretter det automatisk.
2. **Duplikatoppføring ved raskt dobbelttrykk på selve "Logg"-knappen** — bekreftet av Sara.
   Ulikt de allerede beskyttede knappene (start/avslutt/lås dag), mangler
   `handleSubmitEntry` enhver sperre. Anbefalt løsning: samme 500ms-mønster som allerede finnes
   andre steder i samme fil — lite, konsistent, lavrisiko.
3. **Håndrens' bekreft/forkast-knapper mangler samme sperre** — bekreftet praktisk relevant av
   Bjørnar (hansker/kulde/utålmodighet). Et åpent, ubekreftet spørsmål gjenstår: er gjentatte
   `resolveItem()`-kall på et allerede løst punkt trygt? Anbefalt umiddelbar handling: verifiser
   dette eksplisitt (rask, isolert sjekk) før det eventuelt nedgraderes til lavere prioritet.

### Medium (bør forbedres)

1. Ingen visuell tilbakemelding på "Prøv igjen"-eksportknappen mellom klikk (Thomas) — inviterer
   til unødvendig gjentatt klikking, ingen faktisk skade, men dårlig opplevd respons.
2. Rettelse-av-rettelse har ingen strukturell sporbarhet utover fri tekst (Camilla) — kjent,
   dokumentert risiko fra forrige sprint, bekreftet nå faktisk oppstå i praksis.
3. UTC-vs-lokal datovisning i stale-day-banneret rett etter midnatt (funn #5, ikke direkte truffet
   av noen persona i dag, men mekanisk bekreftet) — kosmetisk forvirring, ikke datatap.
4. Svært lange tekstoppføringer gjør loggvisningen merkbart treg (Fredrik) — sjelden i praksis,
   men reelt for en "stress-test"-type bruker eller en feilaktig, veldig lang limt tekst.

### Lav (kan vente)

1. Ingen enhetsklokke-validering (funn #5, Reidar) — reelt, men lav frekvens og lav umiddelbar
   konsekvens (feil dato på én rapport, oppdages i etterkant).
2. `/ops`-URL-en er gjettbar av en nysgjerrig bruker uten tilgang — lav praktisk risiko nå som
   den uansett bare viser en feilmelding (ufrivillig "sikker gjennom å være ødelagt").

---

## Til slutt

**Ville disse 10 brukerne klart en hel arbeidsuke?** Ja, 9 av 10 ville kommet seg gjennom uka
uten å gi opp — Marit (persona 9) er den reelle risikoen: hun ga stille opp på én oppføringstype
allerede dag én, og det mønsteret eskalerer typisk over en uke fremfor å bedre seg av seg selv,
med mindre noen aktivt fanger det opp (noe systemet selv ikke vil, siden hun aldri sender inn
noe).

**Hvor mange ville fortsatt brukt Punchout?** 8 av 10 med rimelig tillit. Marit ville brukt den,
men med systematisk redusert datakvalitet. Kjetil ville brukt den, men med synlig, uttalt
skepsis til fane-hendelsen.

**Hvor mange ville gått tilbake til papir eller Excel?** Ingen fullstendig, men Kjetil ville
sannsynligvis begynt å føre en uformell papirkopi "i tilfelle" etter fane-hendelsen — en reell,
menneskelig tillitsreaksjon, ikke en teknisk nødvendighet.

**Hvor mange supporthenvendelser forventer du første måned?** Rundt 6-8 fra denne gruppen på 10
over en måned, fordelt: 2-3 om mistet/ulagret tekst (Ingvild-mønsteret), 1 om fane-klobbing
(Kjetil/Fredrik-mønsteret, sjeldnere men alvorlig), 1-2 om "trege knapper" (Bjørnar-mønsteret),
1 høy-kvalitet feilrapport (Fredrik), og et ukjent antall (0, målbart) stille tillitstap
(Marit-mønsteret) som aldri vises som en henvendelse i det hele tatt.

**Hvilke tre problemer tror du faktisk vil dukke opp i piloten?** (1) Noen mister ulagret tekst
ved refresh og blir frustrert eller mistolker det som egen feil. (2) `/ops`-dashbordet blir
oppdaget som ødelagt av den første formannen/driftslederen som faktisk følger
`pilot-operations.md`s daglige rutine — sannsynligvis i løpet av pilotens første uke. (3) En
duplisert oppføring fra rask dobbelttrykking dukker opp i en dagsrapport og noen (formann eller
prosjektleder) stiller spørsmål ved datakvaliteten uten å vite hvorfor det skjedde.

**Hvilke antakelser fra våre tidligere analyser ble bekreftet?** At refresh/mistet-tekst rammer
akkurat de mest sårbare brukerne hardest (Human Factors Validation-mønsteret, nå teknisk
bekreftet). At eksport-/synk-mekanismen selv er robust (ingen faktisk datafeil funnet i noen
eksport-relatert test denne runden, kun UX-tilbakemeldingshull). At rettelsesflytens
tekstkonvensjon-uten-struktur er en reell, ikke bare teoretisk, svakhet.

**Hvilke ble motbevist?** At Sprint 4s sikkerhetsarbeid var "ferdig" for `/ops` spesifikt — det
var det ikke; fiksen var korrekt for API-et, men skapte en ny, ubeskrevet konsekvens for den ene
siden som faktisk konsumerer det. Og at lang oppetid uten aktivitet (Reidar, 7+ timer) ville
være et problem — det var det ikke; arkitekturen tåler det uten videre.

> **"Hvis jeg skulle sabotert piloten uten å hacke systemet, ville jeg gjort dette:"** Delt ut
> samme nettbrett til to skiftarbeidere uten å fortelle dem om det, latt begge logge en hel
> arbeidsdag uavhengig av hverandre uten å oppdatere siden mellom seg — og latt den stille
> fane-klobbingen gjøre resten. Ingen ville trengt å gjøre noe galt. De ville bare trengt å gjøre
> noe helt normalt, to ganger, uten å vite om hverandre.

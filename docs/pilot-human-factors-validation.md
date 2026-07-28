# Punchout — Human Factors Validation: 20 simulerte pilotbrukere

Ingen kode er endret eller vurdert i dette dokumentet. Dette er en simulert brukertest: 20
realistiske personaer føres gjennom en hel arbeidsdag i Punchout, basert på appens faktiske
grensesnitt og oppførsel (ikke antatt eller idealisert oppførsel).

## Metodikk og en ærlig begrensning før vi starter

Simuleringen er forankret i faktisk kode: skjermbildetekst, feilmeldinger, state-maskin,
offline-oppførsel og datamodell er lest direkte fra `components/punchout/*`, `public/motor.js`
og `hooks/use-motor-state.ts` — ikke oppfunnet. Der eksakt norsk UI-tekst finnes, er den brukt
ordrett.

**Begrensning som må sies høyt**: Punchout har i dag org-pakker for 4 virksomheter — Mesta (veg/
anlegg), Nordhavn (havn/kran), Banenord (jernbane), Nordkraft (kraft/dam). Brukerpromptens
ønskede bransjespredning (VA, bygg, elektro, fiber, skogbruk, landbruk, kommunal drift/park)
dekkes **ikke** av noen eksisterende org-pakke. For disse 6 personene simulerer vi et
best-case-scenario der noen hypotetisk har konfigurert en org-pakke med lignende struktur
(ordre/lønnskoder/maskintimer) — og vi flagger eksplisitt der selve datamodellen ikke passer
bransjen, fordi det er et reelt funn i seg selv, ikke noe å pynte bort.

---

## De 20 brukerne

### 1. Kim, 19 år — sommerhjelp (Mesta, vegvedlikehold)

**Profil**: Ferskt sommerjobb, ingen fartstid i bransjen. Skjermvant (spiller mobilspill i
pausene), utålmodig, sosial, litt slapp med detaljer.

**Førsteinntrykk (30 sek)**: "Å, dette ser ut som en app, ikke et skjema fra 1998." Liker
mikrofonknappen med en gang — prøver den før hen leser noe. Legger ikke merke til
skjema-kortene i det hele tatt ("Anbefalt"/"Påkrevd" flyr forbi).

**Første arbeidsdag**:
- Trykker "Start dag" uten å skrive noe i tekstboksen — går rett til pre-day.
- Ser "SJA (før arbeid)" merket "Påkrevd" i rødt, men "Gå til drift"-knappen er ikke sperret. Hopper over den. *"Den sier 'må bekreftes', men jeg kan jo bare trykke videre? Da var det vel ikke så viktig."*
- I drift: bruker mikrofonen mye, snakker fort og upresist ("logget maskin og sånn"). Fri tekst uten ordrenummer går rett i loggen — ingen som fanger opp at "og sånn" nå står i dagsrapporten.
- Blir avbrutt av formann som roper — legger fra seg telefonen midt i en taleopptak. Mikrofonen timer ut selv etter 15 sek, ingen skade skjedd, men Kim aner ikke hvorfor opptaket "bare stoppet".
- Glemmer pause helt — ingen pause-registrering skjer med mindre Kim aktivt velger "Pause"-typen, som Kim ikke visste fantes.
- Dobbelttrykker "Logg" av vane (som en send-knapp i en chat-app) — men UI-lock (500ms) hindrer dobbelt innsending denne gangen, ren flaks i timingen.
- Ved dagsslutt: håndrens-skjermen med "hovedtimeføring" og "lønnskoder" er uforståelig sjargong. Spør en kollega hva "lønnskode" betyr.
- Får til slutt låst dagen. Ser "Dagen er låst og lagret" og tenker det er ferdig — skjønner ikke at det obligatoriske SJA-skjemaet aldri ble fylt ut, fordi appen aldri tvang henne.

**Tanker underveis**: *"Dette er enklere enn jeg trodde."* → *"Vent, hva betyr 'håndrens'?"* → *"Jeg håper jeg ikke må gjøre noe med det der røde skjemaet igjen."*

**Feil**: Hopper over påkrevd SJA (appen tillater det). Ingen pauseregistrering. Uklar
talegjenkjenning uten korrigering.

**Frustrasjon**: 3/10 — appen selv er ikke vanskelig, men sjargongen i håndrens skaper korte
forvirringstopper.

**Trygghet**: 4/10 — stoler på at "det bare funker", men skjønner ikke hva som faktisk ble
sendt inn, og oppdager aldri det glemte SJA-skjemaet.

**Arbeidsmengde**: Enklere enn papir — men bare fordi hun bruker den overfladisk. Et papirskjema
ville tvunget henne til å fylle ut SJA fysisk før hun fikk lov til å starte.

**Videre bruk**: Fortsetter uten problemer, men blir en kilde til ufullstendige data (manglende
sikkerhetsskjema) med mindre formann følger opp aktivt. Trenger ikke opplæring i appen — trenger
opplæring i *hvorfor* skjemaene finnes.

---

### 2. Aisha, 23 år — ny maskinfører (Mesta)

**Profil**: 3 måneder i jobben, fagbrev under arbeid. Vokst opp med smarttelefon, men ny i
bransjen og redd for å gjøre feil foran erfarne kolleger.

**Førsteinntrykk**: Leser alt nøye. Er lettet over at "Start dag"-knappen ikke krever noe —
"jeg trodde jeg måtte fylle ut noe komplisert med en gang."

**Første arbeidsdag**:
- Fyller faktisk ut SJA-skjemaet ordentlig, leser hvert felt. Bruker god tid — 6 minutter på
  noe en erfaren kollega bruker 90 sekunder på.
- Starter feil arbeidsordre først (skriver "204481-0041" i stedet for "204481-0014" — trykkfeil
  på ett siffer). Ordrelinje-bekreftelseskortet ("Bekreft ordrelinje") viser feil ordrenummer
  tilbake, men Aisha leser det ikke nøye nok og trykker "Bekreft". Feilen står nå låst i loggen.
- Oppdager feilen 20 minutter senere. Prøver å trykke på oppføringen for å rette den — men den
  er allerede låst (`lockedByUser: true` fra "Bekreft"-valget) og kan ikke redigeres. Panikk:
  *"Har jeg ødelagt noe? Kan jeg ikke slette den?"*
- Det finnes ingen slettefunksjon i det hele tatt. Aisha må logge en ny, korrekt oppføring og
  håpe formann forstår at den første var en feil når dagsrapporten leses.
- Registrerer maskintimer på feil maskintype (velger "hjullaster" der det skulle vært
  "gravemaskin") — samme problem, ingen retting mulig etter bekreftelse.
- Ved dagsslutt leser hun "Alle data er lagret og kan ikke endres. Kontakt leder hvis noe er
  feil." og blir faktisk urolig — hun vet allerede hun har to feil i loggen og må nå
  *aktivt oppsøke* formannen for å forklare seg, noe hun gruet seg til hele dagen.

**Tanker underveis**: *"Jeg håper jeg ikke ødelegger noe."* → *"Vent, kan jeg ikke bare slette
den?"* → *"Nå må jeg si ifra til noen at jeg gjorde en feil — flaut."*

**Feil**: Starter feil arbeidsordre (bekreftet før hun oppdaget det). Feilregistrert
maskintype. Begge låst permanent, ingen selvbetjent retting.

**Frustrasjon**: 7/10 — ikke fordi appen er vanskelig å bruke, men fordi konsekvensen av en
liten skrivefeil er uforholdsmessig stor (permanent, krever menneskelig eskalering).

**Trygghet**: 4/10 — "systemet stoler jeg på, men jeg stoler ikke på meg selv i det, fordi det
ikke tilgir feil."

**Arbeidsmengde**: Mer krevende enn papir for en nybegynner — på papir kan man stryke over og
skrive på nytt; her må man leve med feilen til noen andre fikser den i etterkant.

**Videre bruk**: Fortsetter, men blir overforsiktig — dobbeltsjekker alt, bruker lengre tid enn
nødvendig av frykt for å låse en feil permanent. Trenger opplæring spesifikt i
ordrebekreftelses-steget, ikke i appen generelt.

---

### 3. Roger, 28 år — erfaren asfaltarbeider (Mesta)

**Profil**: 8 år i bransjen, pragmatisk, litt sarkastisk, teknisk grei nok (bruker VIPPS,
Snapchat) men har lite tålmodighet for "unødvendig tull".

**Førsteinntrykk**: Skeptisk fra start. *"Enda en app fra kontoret."* Prøver mikrofonen først
fordi han er lat, blir positivt overrasket over at den faktisk tolker "204481-0014 fra halv
åtte til halv tolv asfaltreparasjon" riktig.

**Første arbeidsdag**:
- Skipper SJA to dager på rad ved å trykke "Utsett" — vet av erfaring at det til slutt havner i
  håndrens uansett, og det er greit for ham, han fyller det ut da i stedet.
- Bytter oppgave midt på dagen (fra asfaltreparasjon til brøyting) — logger ny ordrelinje uten
  problemer, systemet håndterer flere ordre samme dag fint.
- Mister nettet i en kulvert i 20 minutter. Merker ingenting — appen er lokal-først og fortsetter
  å fungere. Prøver å bruke mikrofonen der og får "Nettverksfeil – trenger nett for tale" — blir
  irritert fordi han ikke skjønner *hvorfor* stemmegjenkjenning krever nett når resten av appen
  tydeligvis ikke gjør det. Bytter til manuell tekst uten videre drama.
- Blir ringt av kontoret midt i en taleregistrering — legger fra seg telefonen, opptaket
  timer ut etter 15 sek som forventet, ingen skade.
- Ved håndrens: "Lønnskoder mangler"-sperren på hovedtimeføring stopper ham fra å låse dagen
  til han faktisk legger inn lønnskoder — dette liker han, for på papir "glemte man det jo
  bestandig, og så måtte lønn ringe uansett."

**Tanker underveis**: *"Ok, den er faktisk raskere enn jeg trodde."* → *"Hvorfor krever mikken
nett når resten ikke gjør det?"* → *"Greit at den stopper meg før jeg glemmer lønnskodene —
det sparte meg for en telefon fra lønn i morgen."*

**Feil**: Ingen alvorlige — mister nett (uten konsekvens), forsøker tale offline.

**Frustrasjon**: 2/10 — den ene reelle friksjonen (tale krever nett) er lav-konsekvens og
raskt omgått.

**Trygghet**: 8/10 — erfaren nok til å teste grensene og finne at systemet oppfører seg
forutsigbart.

**Arbeidsmengde**: Enklere enn papir — spesielt lønnskode-sperren, som fjerner en kjent
kilde til etterarbeid.

**Videre bruk**: Fortsetter og blir sannsynligvis en uformell ambassadør blant de andre
asfaltarbeiderne — "den er ikke verre enn jeg trodde" er sterkere sosial valuta i denne gruppa
enn entusiasme.

---

### 4. Silje, 31 år — prosjektleder (generell entreprenør, tverrfaglig)

**Profil**: Høy teknisk kompetanse (Excel-nerd, bruker Teams/PowerBI daglig), kontrollorientert,
vil ha oversikt og sporbarhet mer enn hun selv bruker feltappen.

**Førsteinntrykk**: Bruker aldri feltdelen selv i praksis — hennes førsteinntrykk er av
`/ops`-siden. *"Dette er... veldig nakent for et dashboard."* Merker med en gang seksjonen
"Ikke tilgjengelig her" og blir nysgjerrig/bekymret over hva som mangler.

**Første "arbeidsdag" (som leder, ikke feltbruker)**:
- Logger inn på Operations Center, skriver inn org-ID manuelt (ingen dropdown), trykker "Hent".
- Ser eksport-suksessrate og "Runtime-adopsjon" — forstår tallene, men lurer på hvorfor det ikke
  finnes et varsel når eksportraten synker, kun en statisk rapport hun må huske å sjekke selv.
- Ringer en formann for å spørre om en spesifikk arbeidsdag — oppdager at hun ikke kan se
  *innholdet* i en enkeltdag fra dashbordet, bare metadata (enhet-ID, signaturstatus, tidspunkt).
  For faktisk innhold må hun be feltarbeideren om "Vis dagsrapport"-eksporten deres direkte.
- Prøver selv å logge en testdag i feltappen for å forstå hva teamet opplever — blir overrasket
  over hvor "myk" påkrevd-merkingen er (ikke-blokkerende), og bekymret: *"Vet feltfolkene at de
  kan hoppe over de røde skjemaene? Det visste ikke jeg engang."*

**Tanker underveis**: *"Dataene finnes sikkert et sted, jeg bare ser dem ikke herfra."* →
*"Er dette faktisk pilotklart, eller bare 'teknisk ferdig'?"* → *"Jeg må huske å sjekke dette
manuelt — det bekymrer meg litt at ingenting varsler meg."*

**Feil**: Ingen brukerfeil i tradisjonell forstand — men et reelt organisatorisk funn: hun
antok feilaktig at "Påkrevd"-skjema faktisk var påkrevd.

**Frustrasjon**: 5/10 — ikke frustrert over UI, men over mangelen på proaktiv varsling og
innsyn i faktisk skjemainnhold fra lederrollen.

**Trygghet**: 6/10 — stoler på at eksport-mekanismen virker (retry/backoff/dedup er solid),
men lav tillit til at "påkrevd" faktisk betyr påkrevd i praksis.

**Arbeidsmengde**: Sammenlignet med dagens muntlige rapportering/Excel-oppsummering er dette en
klar forbedring i sporbarhet — men krever at hun *aktivt* går inn og sjekker, mot at Excel-arket
i dag blir sendt til henne ukentlig uten at hun må spørre.

**Videre bruk**: Fortsetter å bruke ops-dashbordet, men vil eskalere "påkrevd skjema er ikke
faktisk påkrevd"-funnet oppover før pilot skaleres — dette er nøyaktig den typen bruker som kan
stoppe en pilot hvis funnet ikke tas på alvor.

---

### 5. Henrik, 35 år — stikningsingeniør (byggeteknisk, Mesta-tilknyttet prosjekt)

**Profil**: Høy teknisk kompetanse, perfeksjonist, vant til presise måleinstrumenter og
strenge toleranser i eget fag — overfører den forventningen til alt digitalt han bruker.

**Førsteinntrykk**: Leser hele pre-day-skjermen grundig før han trykker noe. Legger merke til
at "Gå til drift" aldri er disabled, uansett status — irriterer ham umiddelbart. *"Hvorfor
kaller dere det 'påkrevd' hvis ingenting faktisk krever det?"*

**Første arbeidsdag**:
- Fyller ut alle skjema perfekt og fullstendig, inkludert valgfrie felt andre ville hoppet over.
- Blir forstyrret av en misforståelse: strukturert ordre-gjenkjenning (regex på
  4+ sifre-bindestrek-1-4 sifre) plukker ikke opp hans vante notasjon med mellomrom
  ("204481 - 0014") — teksten går rett i loggen som ufortolket fritekst i stedet for en
  strukturert, bekreftet ordrelinje. Han merker ikke forskjellen med en gang, og oppdager det
  først i håndrens når "hovedtimeføring" viser 0 timer knyttet til ordren.
- Blir frustrert over å måtte inn i håndrens og manuelt ordne noe han *trodde* var riktig gjort
  første gang. *"Jeg gjorde jo alt riktig — det er formatet appen ikke skjønte."*
- Tester grensetilfeller bevisst (dobbelttrykker "Bekreft" raskt to ganger for å se om det
  registreres to ganger) — UI-lock (500ms) hindrer det, noe han faktisk setter pris på og
  nevner høyt: "Ok, den er i det minste tenkt gjennom."

**Tanker underveis**: *"Hvorfor kalles det 'påkrevd' hvis det ikke er det?"* → *"Er dette min
feil eller appens feil?"* → *"Greit, de har i alle fall tenkt på dobbelttrykk."*

**Feil**: Ordrenummer i uvant format ble ikke gjenkjent strukturert — ingen datafeil, men et
"usynlig" tap av struktur han må oppdage selv i etterkant.

**Frustrasjon**: 6/10 — presisjonsorientert person møter et system som er "mykt" der han
forventer det skal være strengt.

**Trygghet**: 5/10 — stoler på selve loggingen, men mistror at "påkrevd" og andre labels
faktisk betyr noe teknisk.

**Arbeidsmengde**: Omtrent likt med papir for hans del — han var allerede grundig på papir også,
så tidsbesparelsen er marginal, men sporbarheten er bedre.

**Videre bruk**: Fortsetter, men blir en aktiv kritiker internt — typen bruker som skriver
detaljerte tilbakemeldinger til prosjektledelsen om inkonsekvensen mellom "påkrevd" i tekst og
faktisk håndheving.

---

### 6. Wenche, 39 år — formann (Mesta, vegvedlikeholdslag på 8 personer)

**Profil**: 15 år i bransjen, praktisk, beskyttende overfor laget sitt, mistenksom mot alt som
"kan brukes til å overvåke folk". Middels teknisk (bruker det hun må, ikke mer).

**Førsteinntrykk**: Første tanke er ikke om appen er lett å bruke, men *hva den brukes til*.
*"Er dette for å sjekke oss, eller for å hjelpe oss?"* Leser "Kontakt leder hvis noe er feil" på
sluttskjermen og tenker: *"Det blir meg de kontakter, altså."*

**Første arbeidsdag**:
- Bruker appen selv, men bruker mest tid på å følge opp laget sitt underveis — ser flere av dem
  hoppe over påkrevde SJA-skjema og sier ingenting med det første, for å se hva som skjer.
- Får en telefon fra en anleggsmaskinfører som "tror appen har fryst" — mikrofonen sto i
  "Behandler..."-tilstand lenger enn ventet på dårlig dekning. Wenche må dra bort fysisk for å
  se at det faktisk løser seg selv (feil-tekst dukker opp etter noen sekunder), noe som stjeler
  tid fra hennes egen arbeidsdag.
- Oppdager i håndrens at hun ikke enkelt kan se *hvem* i laget som ikke har fylt ut påkrevde
  skjema — den informasjonen finnes ikke tilgjengelig for henne i felt, kun i
  Operations Center (som hun ikke har tilgang til/kjenner til).
- Ved dagsslutt er hun usikker på om hun "gjorde jobben sin" som formann riktig, fordi appen gir
  henne ingen verktøy for å følge opp laget sitt i sanntid — hun må spørre folk muntlig, akkurat
  som før.

**Tanker underveis**: *"Er dette for å sjekke oss?"* → *"Jeg skulle ønske jeg kunne se hvem som
mangler skjema, uten å måtte spørre alle sammen."* → *"Dette er ikke verre enn papir for meg —
men det er heller ikke bedre ennå."*

**Feil**: Ingen egne feil av betydning — men blir flaskehals for andres feil/forvirring
(spesielt "appen har fryst"-oppfatningen fra en av hennes ansatte).

**Frustrasjon**: 6/10 — ikke frustrert over egen bruk, men over å mangle verktøy for
lederrollen sin i felt.

**Trygghet**: 5/10 — nøytral til skeptisk; venter og ser om dette faktisk letter jobben hennes
eller bare flytter arbeidet fra papir til telefon-support for laget.

**Arbeidsmengde**: Lik papir for henne personlig, men *økt* arbeidsmengde i lederrollen (må
være uformell "IT-support" for laget sitt uten verktøy for det).

**Videre bruk**: Fortsetter, men er den typen bruker som avgjør om *hele laget* lykkes eller
ikke — hvis hun ikke får et verktøy for å følge opp laget sitt, vil enkelte i laget fortsette å
hoppe over skjema uten at noen griper inn.

---

### 7. Terje, 44 år — anleggsmaskinfører (Mesta, gravemaskin/hjullaster)

**Profil**: 20 år i bransjen, fysisk arbeid, foretrekker minst mulig skjermtid, bruker mobilen
hovedsakelig til Facebook og værmelding. Middels-lav teknisk kompetanse, men ikke redd for å
prøve.

**Førsteinntrykk**: *"Nå skal jeg sitte med mobil i fanget hele dagen, eller?"* Misliker
tanken før han i det hele tatt har prøvd. Blir positivt overrasket over at mikrofonen betyr han
kan logge uten å ta av arbeidshanskene helt.

**Første arbeidsdag**:
- Bruker mikrofon nesten utelukkende — skriver aldri manuelt hvis han slipper.
- Registrerer feil maskintype én gang tidlig på dagen (sier "hjullaster" i farten når han
  faktisk kjørte gravemaskin den timen) — oppdager det ikke selv i det hele tatt, det blir
  stående i loggen uoppdaget til noen andre ser det i etterkant.
- Mister telefonen bokstavelig talt — legger den fra seg på kanten av maskinen, den detter ned
  og blir liggende i søla i 40 minutter mens han jobber videre uten den. Ingen registrering skjer
  i dette tidsrommet — den tiden er rett og slett borte fra loggen, og han merker det ikke før
  han skal registrere neste ordre og ikke finner telefonen.
- Når han finner den igjen, er den skitten men fungerer. Ingen data gikk tapt (lokal lagring),
  men *tiden* er tapt — han må huske og etterregistrere 40 minutters arbeid fra minnet.
- I håndrens ser han "Lønnskoder mangler"-sperren og aner ikke hva en lønnskode er — spør en
  kollega, som viser ham hvor han finner det via "Rediger"-knappen i hovedtimeføring-kortet.

**Tanker underveis**: *"Fint, jeg slipper å skrive med skitne hender."* → *"Hvor ble det av
telefonen min?!"* → *"Hva i all verden er en lønnskode?"*

**Feil**: Feilregistrert maskintype (uoppdaget). Mistet telefon → 40 min udokumentert arbeid,
manuell etterregistrering fra hukommelse (upresis).

**Frustrasjon**: 5/10 — moderat, mest knyttet til episoden med den tapte telefonen, som ikke er
appens feil, men som appen heller ikke hjelper ham å håndtere godt (ingen "jeg var borte i X
minutter"-funksjon).

**Trygghet**: 6/10 — stoler på mikrofonfunksjonen, usikker på sjargongen i håndrens.

**Arbeidsmengde**: Enklere enn papir når mikrofonen fungerer; *vanskeligere* enn papir i det
øyeblikket noe uventet skjer (mistet telefon), fordi papir tåler å bli lagt i lomma og glemt på
en måte en telefon med tidssensitiv logging ikke gjør på samme vis.

**Videre bruk**: Fortsetter, blir en solid gjennomsnittsbruker. Trenger en kort, praktisk
opplæringsøkt om lønnskoder og maskintype-korrigering — ikke om appen generelt.

---

### 8. Bjørg, 48 år — vegarbeider (Mesta)

**Profil**: 22 år i bransjen, rutinepreget, forandringsvegrende ("vi har alltid gjort det på
papir, og det har fungert"), lav-middels teknisk kompetanse. Ikke fiendtlig, men treg til å
endre vaner.

**Førsteinntrykk**: Mistenksom. *"Enda en digitaliseringsgreie fra kontoret."* Leser
kalles-navnene i pre-day ("SJA", "Kjøretøysjekk") og kjenner dem igjen fra papirskjemaene hun
alltid har fylt ut — det er en lettelse at *innholdet* er kjent, selv om *formatet* er nytt.

**Første arbeidsdag**:
- Skriver manuelt, unngår mikrofonen helt første uken — "jeg liker ikke å snakke til en
  telefon, føles rart."
- Blir kalt bort midt i en tekstregistrering av en kollega som trenger hjelp med en maskin.
  Legger fra seg telefonen med en halvferdig setning i tekstfeltet. Kommer tilbake 15 minutter
  senere — teksten står fortsatt der uendret (ingen auto-lagring/auto-submit), hun fullfører og
  sender. Ingen skade, men hun visste ikke *om* det ville være trygt å gå fra det, og var
  nervøs mens hun var borte.
- Trykker "Logg" to ganger fordi hun er usikker på om det første trykket "tok" (ingen tydelig
  visuell bekreftelse utover at knappen ble disabled kort). 500ms-sperren redder henne fra en
  duplikatoppføring, men hun aner ikke *hvorfor* det ikke ble dobbelt — bare at det ikke ble det.
- I håndrens synes hun "Forkast timeføring"-valget med kun to faste årsaker
  ("Jeg har ikke arbeidet i dag" / "Timene er ført i annet system") er for rigid — hennes
  faktiske situasjon (delvis sykemeldt, jobbet halv dag) passer ikke presist inn i noen av dem.

**Tanker underveis**: *"Dette kjenner jeg igjen fra papirskjemaet, det er greit."* →
*"Tok det trykket, eller må jeg trykke igjen?"* → *"Ingen av disse to grunnene passer helt for
meg i dag."*

**Feil**: Mulig dobbelttrykk (forhindret av systemet, men opplevd som utrygt av henne).
Passer ikke inn i forhåndsdefinerte forkastningsårsaker.

**Frustrasjon**: 4/10 — lav, fordi innholdet er kjent selv om formatet er nytt; det som
frustrerer er mangel på visuell bekreftelse og for rigide valgmuligheter.

**Trygghet**: 5/10 — økende gjennom dagen etter hvert som hun ser at "ingenting går galt", men
starter lavt.

**Arbeidsmengde**: Oppleves som *likt* papir de første dagene (samme innhold, nytt medium), med
potensial til å bli enklere når hun blir trygg nok til å bruke mikrofonen.

**Videre bruk**: Fortsetter hvis hun får noen uker uten å bli presset til å bruke mikrofonen for
fort. Trenger opplæring med fokus på *bekreftelse av at noe faktisk skjedde* — visuell
utrygghet, ikke evne, er hovedbarrieren.

---

### 9. Morten, 54 år — driftsleder (Mesta, distriktsansvar)

**Profil**: Middels-høy teknisk kompetanse, resultatorientert, bryr seg om utrullingsrisiko mer
enn om enkeltfunksjoner. Har vært gjennom flere mislykkede IT-innføringer tidligere i karrieren.

**Førsteinntrykk**: Går rett til å teste svikt-scenarioer i stedet for happy path — dette er
refleksen hans etter tidligere prosjekter som sprakk i produksjon. Prøver bevisst å bryte noe
tidlig: lukker appen midt i en registrering.

**Første arbeidsdag**:
- Simulerer en "avbrutt dag": lukker nettleseren/appen midt på formiddagen uten å avslutte
  dagen, åpner den igjen neste kalenderdag. Får "Stale day"-banneret: "Du har ulagret data fra
  {gårsdagens dato}". Tester alle tre valg over flere runder (Fortsett/Avslutt/Forkast) og
  legger merke til at "X"-en for å lukke banneret *ikke* løser noe — banneret vil trolig komme
  tilbake neste innlasting, siden ingenting faktisk ble besluttet. Noterer dette som en reell
  risiko: en ansatt som bare lukker banneret uten å velge, sitter fast i en uavklart tilstand
  på ubestemt tid.
- Tvinger frem en lagringsfeil (fyller lokal lagring/korrupt tilstand i test) og ser den røde
  "Lagringsfeil"-skjermen med rå JS-feilmelding — bekymrer seg umiddelbart for at en vanlig
  feltarbeider vil lese en teknisk feiltekst og få panikk, ikke roe seg ned.
- Ser at "Nullstill dagens data" er hovedvalget på lagringsfeil-skjermen og lurer på hvor mange
  som vil trykke det uten å lese "Historikk beholdes"-teksten under, og tro de mister alt.
- Konkluderer med at systemet *teknisk* håndterer feilscenarioer trygt (ingen faktisk
  datatap i noen av testene), men at *kommunikasjonen* rundt feilene er for teknisk/skremmende
  for sluttbrukergruppen.

**Tanker underveis**: *"La oss se hva som skjer når jeg gjør noe dumt."* → *"Denne
feilmeldingen ville skremt vettet av halve laget mitt."* → *"Teknisk sett trygt. Kommunikativt
sett, nei."*

**Feil**: Bevisst fremprovoserte feil (stale day, lagringsfeil) — ingen faktiske
utilsiktede feil, siden han tester systematisk.

**Frustrasjon**: 3/10 for egen del (han forventet svikt og fant det han lette etter — det er en
bekreftelse, ikke en overraskelse), men noterer høy *forventet* frustrasjon for andre.

**Trygghet**: 7/10 på det tekniske (ingen datatap i noen test), 3/10 på kommunikasjon
(feilmeldinger er ikke skrevet for sluttbrukeren).

**Arbeidsmengde**: Ikke relevant for ham personlig — vurderer det på vegne av distriktet.

**Videre bruk**: Blir en kritisk, men konstruktiv intern pådriver — vil sannsynligvis kreve at
feilmeldingstekst og stale-day-banneret strammes opp *før* han anbefaler full utrulling i sitt
distrikt, selv om han er positiv til kjernefunksjonaliteten.

---

### 10. Odd, 61 år — svært lite teknisk (Mesta, vegvedlikehold, 35 år erfaring)

**Profil**: Har brukt papir og penn hele karrieren. Eier en smarttelefon, bruker den til
telefonsamtaler og noen ganger Facebook fordi barnebarna er der. Ingen ondskap mot teknologi,
men reell angst for å "ødelegge noe" digitalt.

**Førsteinntrykk**: Tar lang tid før han trykker noe som helst. Leser "Klar for en ny
arbeidsdag" tre ganger. *"Hva skjer om jeg trykker feil knapp?"* Liten skriftstørrelse og
tett layout på pre-day-skjermen (mange skjemakort, mye tekst) oppleves som overveldende — ingen
"forstørr tekst"-funksjon er synlig for ham.

**Første arbeidsdag**:
- Unngår mikrofonen fullstendig — "jeg vet ikke hva den gjør, og jeg tør ikke finne ut av det."
- Bruker 12 minutter på å finne ut hvordan man skriver en enkel oppføring, fordi han leter etter
  en "lagre"-knapp med akkurat det ordet, mens den faktiske knappen heter "Logg".
- Tror appen "har fryst" da et taleforsøk (som en kollega presser ham til å prøve) går inn i
  "Behandler..."-tilstand på dårlig dekning i noen sekunder — dette er den klassiske
  "har frosset"-opplevelsen, og for Odd bekrefter det alt han fryktet på forhånd.
- Etter det hendelsen: rører aldri mikrofonen igjen, sier høyt til kollegaer at "jeg holder meg
  til å skrive, det andre er ikke for meg."
- Sliter med håndrens-skjermens tette informasjonsmengde ("Lønnskoder", "Bekreft timeark",
  ekspanderbare kort) — trenger hjelp fra en yngre kollega for å faktisk låse dagen første gang.
- Blir merkbart lettet når han til slutt ser "Dagen er låst og lagret" — men tilliten er skjør,
  bygget på at "noen andre hjalp meg", ikke på egen mestring.

**Tanker underveis**: *"Hva skjer om jeg trykker feil knapp?"* → *"Nå har den frosset, jeg visste
det."* → *"Æsj, jeg klarte det — men bare fordi Kim hjalp meg."*

**Feil**: Ingen faktiske datafeil — men betydelig tidsbruk og avhengighet av kollegahjelp for å
fullføre grunnleggende oppgaver.

**Frustrasjon**: 8/10 — høy, drevet av angst og opplevd (ikke faktisk) systemsvikt.

**Trygghet**: 2/10 — svært lav, og det som lav tillit *finnes* er lånt fra kollegaens
bekreftelse, ikke egen erfaring.

**Arbeidsmengde**: Klart mer krevende enn papir for ham — papir krever ingen tolkning av
knappenavn, ingen frykt for "å trykke feil", ingen ventetid på nettverk.

**Videre bruk**: Høy risiko for å gi opp uten strukturert, tålmodig opplæring — én-til-én, ikke
en fellesgjennomgang. Vil aldri bli en selvstendig bruker av taleinput. Kan bli en fungerende
tekstbruker med 2-3 økter individuell oppfølging, men vil sannsynligvis alltid oppleve håndrens
som det vanskeligste steget.

---

### 11. Fatima, 33 år — kranoperatør (Nordhavn)

**Profil**: 6 år som kranoperatør, høy prosedyrebevissthet (kranoperatorsjekk er en del av
hverdagen), rolig og metodisk personlighet, middels-høy teknisk kompetanse.

**Førsteinntrykk**: Kjenner igjen "kranoperatorsjekk" som et pre-day-skjema med en gang —
setter pris på at det er der *automatisk* i stedet for at hun må huske å be om det fysiske
skjemaet fra kontoret.

**Første arbeidsdag**:
- Fyller ut kranoperatorsjekken grundig — den er merket påkrevd, og hun ville aldri hoppet over
  den uansett (kultur/vane fra før appen), så den myke håndhevingen er irrelevant for henne
  personlig, men hun bemerker: *"Hva med de som ikke er like nøye som meg?"*
- Logger lasting/lossing gjennom dagen — ordrestrukturen (ordre/tid/ressurs) fungerer greit for
  havnearbeid, men "ressurser"-feltet fanger "mobilkran"/"reachstacker" bra fra fritekst.
- Byttet oppgave fra lasting til lossing midt på dagen uten friksjon.
- Opplever ett teknisk avbrudd: bryggekranen har dårlig dekning i akkurat det området hun
  jobber i — mister nett i korte, gjentatte perioder (ikke sammenhengende som i en tunnel, men
  "hakkete" dekning). Appen fungerer lokalt uansett, men hun merker ikke at flere talehendelser
  feiler stille med "Nettverksfeil"-tekst fordi hun ikke ser skjermen kontinuerlig mens hun
  jobber — oppdager først i etterkant at 2 av 5 taleforsøk aldri ble registrert i det hele tatt.
- I håndrens: ingen RUH-hendelser denne dagen, rask og grei avslutning.

**Tanker underveis**: *"Bra at kranoperatorsjekken er der automatisk."* → *"Vent, logget den
faktisk det jeg sa nå, eller ikke?"* → *"Dette gikk overraskende greit til å være første gang."*

**Feil**: To taleregistreringer forsvant stille pga. hakkete nettdekning — ingen varsling om at
de faktisk feilet, bare fravær av forventet oppføring i loggen.

**Frustrasjon**: 4/10 — moderat, konsentrert rundt den usynlige tapte taledataen.

**Trygghet**: 6/10 — høy for selve arbeidsflyten, lavere for talepålitelighet i hennes
arbeidsmiljø spesifikt (havn med varierende dekning nær vann/stål).

**Arbeidsmengde**: Enklere enn papir for strukturerte oppgaver, men den stille tapte
taledataen introduserer en ny type feil papir aldri hadde (papir "feiler" aldri stille — det
ligger der, lesbart, alltid).

**Videre bruk**: Fortsetter, men vil trolig venne seg til å dobbeltsjekke loggen visuelt etter
hver taleoppføring — en kompenserende vane brukeren selv må utvikle, ikke noe appen lærer henne.

---

### 12. Geir, 45 år — vedlikeholdstekniker, turbin/dam (Nordkraft)

**Profil**: 14 år i kraftbransjen, svært sikkerhetsbevisst (dammsikkerhet er ikke noe man tar
lett på), skeptisk til "myke" varsler i sikkerhetskritiske sammenhenger, middels teknisk nivå.

**Førsteinntrykk**: Går rett til å lese hva som skjer hvis han *ikke* fyller ut
"dammsikkerhetssjekk". Blir merkbart bekymret når han oppdager at "Gå til drift" aldri faktisk
sperres, uansett hvor kritisk skjemaet er merket. *"Dette er et sikkerhetsskjema. Det bør ikke
være valgfritt å 'gå videre uansett'."*

**Første arbeidsdag**:
- Fyller ut dammsikkerhetssjekk og RUH-relaterte felt nøye — hans personlige standard er høyere
  enn det appen krever av ham.
- Logger tilsyn og turbinvedlikehold via ordre/ressurs-strukturen — fungerer greit,
  "inspeksjonsdrone" og "kranbil" gjenkjennes som ressurser fra fritekst.
- Opplever en reell hendelse i løpet av dagen (mindre avvik han må RUH-registrere) — går inn i
  håndrens-flyten for RUH, ser at det *ikke* finnes en engangs-bekreft-knapp for RUH slik det
  gjør for andre punkttyper (bevisst designvalg), og setter pris på at systemet tvinger et ekstra
  steg her: *"Bra at den ikke lar meg hastverke gjennom en hendelsesrapport."*
- Mangler "årsak"-feltet i RUH-skjemaet ved første forsøk på å bekrefte — får en inline rød
  feilmelding ("{skjemanavn} krever: Årsak") og retter det. Setter pris på at feilmeldingen er
  spesifikk og ikke bare "Validation failed."
- Ved dagsslutt er han fortsatt bekymret for det første funnet (ikke-blokkerende påkrevd-merking
  på pre-day) og vurderer å ta det opp med driftsleder før han stoler fullt på systemet i en
  dam-/kraftkontekst.

**Tanker underveis**: *"Dette bør ikke være valgfritt for et sikkerhetsskjema."* → *"Bra, den
lot meg ikke hastverke gjennom RUH-en."* → *"Jeg må ta opp det der med påkrevd-merkingen med
noen."*

**Feil**: Glemte "årsak"-felt i RUH første gang — fanget opp og forklart spesifikt av systemet,
rettet uten friksjon.

**Frustrasjon**: 4/10 — lav for selve bruken, men prinsipiell bekymring for
sikkerhetsimplikasjonene av myk håndheving.

**Trygghet**: 5/10 — høy tillit til RUH-flyten spesifikt (den *er* streng der det teller mest),
lav tillit til at *andre* skjema (som dammsikkerhetssjekk) har samme beskyttelse.

**Arbeidsmengde**: Omtrent likt med papir — kraft/dam-bransjen har allerede strenge, godt
innøvde papirrutiner, så tidsgevinsten er mindre enn i mer ad-hoc bransjer.

**Videre bruk**: Fortsetter å bruke appen, men blir en kritisk stemme oppover i systemet
spesifikt på spørsmålet "bør sikkerhetskritiske pre-day-skjema faktisk kunne blokkere?" — et
reelt, godt begrunnet motargument mot dagens "aldri blokkerende"-designprinsipp.

---

### 13. Kristin, 52 år — sporarbeider (Banenord)

**Profil**: 27 år i jernbanebransjen, vant til å jobbe i områder med svært dårlig eller ingen
mobildekning (tunneler, spor langt fra bebyggelse). Lav-middels teknisk kompetanse, pragmatisk,
lite tålmodighet for verktøy som "krever nett for å funke".

**Førsteinntrykk**: Ser mikrofonknappen og tenker umiddelbart: *"Den kommer ikke til å funke der
jeg skal jobbe i dag."* Stemmer — hun har rett.

**Første arbeidsdag**:
- Starter dagen på et sted med dekning (dagens oppmøtepunkt), fyller ut
  "sporarbeidersjekk"-lignende skjema greit.
- Kjører/går inn i et område med praktisk talt ingen dekning for sporrensk-arbeid. Prøver
  mikrofonen av gammel vane — får "Nettverksfeil – trenger nett for tale" gjentatte ganger, gir
  opp og går over til manuell tekstinntasting, som *fungerer fint* offline (kjernefunksjonen er
  lokal-først).
- Mister nett i over 3 timer sammenhengende. Fortsetter å logge manuelt uten synlig problem —
  men har ingen indikasjon noe sted i UI om at hun faktisk er offline, eller om tidligere dagers
  eksporter (fra en dag hun jobbet i et enda mer avsidesliggende område forrige uke) noen gang
  faktisk ble sendt. Outbox-status finnes i systemet, men vises ingen steder for henne.
- Blir bekymret ved dagsslutt: *"Sendte den forrige uke-dagen min noen gang? Jeg aner ikke."*
  Ringer formann for å få bekreftet at data har kommet frem — noe hun ikke skulle trengt å
  gjøre hvis appen bare hadde vist henne en enkel status.
- Fullfører håndrens og låser dagen uten problemer for øvrig — selve loggingsflyten er robust
  offline, det er kun *tilliten til at data faktisk kommer frem* som svikter.

**Tanker underveis**: *"Ikke overraskende at mikrofonen ikke funker her."* → *"Er jeg egentlig
offline nå? Hvordan skulle jeg vite det?"* → *"Sendte forrige ukes data noen gang, eller ligger
den bare og venter et sted?"*

**Feil**: Ingen egentlige brukerfeil — men et strukturelt produktgap rammer henne direkte:
ingen synlig offline-/sync-status i noen arbeidsskjerm.

**Frustrasjon**: 6/10 — ikke fra selve loggingen (som fungerer utmerket offline), men fra total
mangel på innsikt i om arbeidet hennes faktisk kommer frem til mottaker.

**Trygghet**: 4/10 — lav, spesifikt på spørsmålet "kom dataene mine frem?", til tross for at
den tekniske sync-mekanismen (retry/backoff/dedup) faktisk er robust bak kulissene.

**Arbeidsmengde**: Enklere enn papir *under* arbeidet (ingen fysiske skjema å bære/beskytte mot
vær i sporet), men mer *utrygt* enn papir etterpå — et fysisk skjema levert til formann er en
kjent, synlig bekreftelse; en stille bakgrunnssynk er det ikke.

**Videre bruk**: Fortsetter å bruke appen (alternativet, papir i felt langs spor, er upraktisk
uansett), men blir en vedvarende kilde til "kom dataene mine frem?"-henvendelser til formann/
support — nøyaktig den typen support-belastning som er lett å forebygge med en enkel
synk-statusindikator.

---

### 14. Nora, 29 år — VA-tekniker (kommunalt vann- og avløpsverk — ingen eksisterende org-pakke)

**Profil**: God teknisk kompetanse (bruker allerede et fagsystem for ledningskart), strukturert,
utålmodig med verktøy som ikke passer arbeidsflyten hennes presist.

**Førsteinntrykk**: Logger inn på en hypotetisk VA-tilpasset org-pakke satt opp for pilotens
skyld. Med en gang: *"'Ordre'? Vi kaller det sak eller arbeidsordre fra Gemini/Ambita, ikke
'ordre' med bindestrek-tallformat sånn dere har her."* Ordrenummer-gjenkjenningsregexen
(`\d{4,}-\d{1,4}`) matcher ikke VA-sakers vante saksnummerformat i det hele tatt.

**Første arbeidsdag**:
- Fordi den strukturerte ordre-gjenkjenningen ikke treffer VA-sjargong/saksnummerformat, blir
  *alle* hennes registreringer fritekst uten den ekstra "Bekreft ordrelinje"-strukturen andre
  bransjer får — hun mister dermed en kvalitetssikringsmulighet appen faktisk tilbyr, uten å vite
  at den finnes for andre.
- "Maskintimer" og "lønnskoder" som begreper er fremmede for henne — hennes arbeidsdag handler
  om ledningsbrudd, spylerunder, prøvetaking, ikke maskinbruk i anleggsforstand. Hun tvinger
  informasjonen sin inn i "arbeidsbeskrivelse"-fritekst i mangel av bedre felt.
- Opplever ingen tekniske feil overhodet — appen "virker", men føles som et verktøy bygget for
  en annen bransje som hun må improvisere seg gjennom.
- Ved dagsslutt: håndrens-skjermens "hovedtimeføring"/"lønnskoder"-fokus er fullstendig
  irrelevant for hennes arbeidsdag, men hun må likevel forholde seg til det for å låse dagen.

**Tanker underveis**: *"Dette er tydelig bygget for anlegg, ikke for oss."* → *"Jeg får ikke
til å bruke ordre-gjenkjenningen i det hele tatt."* → *"Fungerer teknisk, men føles feil."*

**Feil**: Ingen brukerfeil — men et grunnleggende domenetilpasningsproblem: vokabular og
strukturgjenkjenning er bygget for anleggsbransjens ordreformat, ikke VA.

**Frustrasjon**: 7/10 — ikke fra buggy oppførsel, men fra kontinuerlig "dette er ikke for meg"-
friksjon gjennom hele dagen.

**Trygghet**: 6/10 — stoler teknisk på at data lagres riktig, men lav tillit til at *innholdet*
hun logger faktisk gir mening for noen som leser det etterpå.

**Arbeidsmengde**: Mer krevende enn dagens fagsystem for henne spesifikt — hun må oversette sin
egen arbeidsvirkelighet inn i en fremmed struktur i stedet for omvendt.

**Videre bruk**: Lav sannsynlighet for frivillig fortsatt bruk uten en reell VA-tilpasning
(egne aktivitetstyper, saksnummerformat, terminologi). Dette er ikke en UX-feil i tradisjonell
forstand — det er beviset på at DEL 1s tidligere funn ("feltvokabularet er
anleggsbransje-spesifikt") har reelle menneskelige konsekvenser utenfor anlegg.

---

### 15. Yusuf, 26 år — tømrerlærling (byggeplass, ikke-eksisterende org-pakke)

**Profil**: Rutinert med mobil (spiller, sosiale medier), utålmodig, jobber i høyt tempo med
mange små, avbrutte oppgaver gjennom dagen — typisk for en aktiv byggeplass med mange fag i
samme bygg.

**Førsteinntrykk**: Rask til å prøve alt. Trykker gjennom pre-day på under ett minutt uten å
lese noe særlig — vanen hans fra andre apper (aksepter alt, kom i gang).

**Første arbeidsdag**:
- Byggeplassens arbeidsdag er fragmentert: 14 separate, korte oppgaver (montering, rydding,
  henting av materialer, hjelpe en annen fagperson) i løpet av dagen — langt flere
  oppgavebytter enn en typisk anleggsdag. Logger noen av dem, glemmer flere fordi han blir
  revet med i selve arbeidet.
- Blir avbrutt av telefon fra kjæresten midt i en taleregistrering — legger fra seg jobbtelefonen
  et sted, tar den private samtalen på sin egen mobil, kommer tilbake to minutter senere og har
  glemt hva han holdt på å registrere. Begynner bare på nytt uten å rydde opp i den halvferdige
  forrige oppføringen (den sto fortsatt i tekstfeltet, ubevisst overskrevet).
- Dobbelttrykker "Bekreft" på en ordrelinje av ren refleks (som når han "liker" et innlegg) —
  500ms-sperren forhindrer duplikat, men han merker det ikke i det hele tatt, verken
  problemet eller løsningen.
- Ved dagsslutt: håndrens viser 5 ubehandlede punkter han må ta stilling til på én gang — dette
  er den første stunden hele dagen han faktisk stopper opp og leser grundig, fordi han vil bli
  ferdig og dra hjem.

**Tanker underveis**: *"Kjapt, greit, videre."* → *"Hæ, hva var det jeg skulle skrive nå
igjen?"* → *"Bare få unnagjort håndrens så jeg kan dra."*

**Feil**: Flere glemte registreringer i løpet av en fragmentert dag (ingen påminnelse om at
tid har gått uten logging). Halvferdig oppføring mistet ved avbrudd.

**Frustrasjon**: 5/10 — moderat, mer knyttet til eget arbeidstempo enn til appen selv.

**Trygghet**: 6/10 — bruker appen uten å tenke mye over det, verken spesielt trygg eller
utrygg.

**Arbeidsmengde**: Oppleves som enklere enn papir *i øyeblikket*, men dagsloggen hans er
sannsynligvis ufullstendig sammenlignet med hva en mer disiplinert bruker ville produsert — et
"skjult" datakvalitetsproblem appen ikke gjør noe for å motvirke (ingen periodisk
påminnelse à la "du har ikke logget noe på 90 minutter").

**Videre bruk**: Fortsetter uten motstand, men produserer lav-kvalitet data konsekvent. Trenger
ikke opplæring i *hvordan* bruke appen — trenger en funksjon appen ikke har (aktivitetspåminnelse
ved lange stille perioder) for å faktisk bli en god datakilde.

---

### 16. Ingrid, 38 år — elektriker (ikke-eksisterende org-pakke, jobber ofte alene)

**Profil**: 12 år i faget, høy sikkerhetsbevissthet (elektrofag har strenge HMS-krav), jobber
ofte alene på oppdrag hos private/bedriftskunder, middels teknisk kompetanse.

**Førsteinntrykk**: Ser umiddelbart etter et HMS/sikkerhetsskjema tilpasset elektrofag
(f.eks. spenningssjekk, isolasjonsmåling) — finner ingen slik i pre-day, kun de generiske
skjematypene fra anleggsverdenen. *"Dette er ikke skjemaene jeg faktisk trenger."*

**Første arbeidsdag**:
- Fordi hun jobber alene og ikke har en formann fysisk i nærheten til å spørre, blir enhver
  usikkerhet i appen en liten krise hun må løse selv eller ringe noen om.
- Logger arbeid på flere ulike kundeadresser i løpet av dagen — ordre/ressurs-strukturen håndterer
  dette teknisk greit (hver adresse/oppdrag som egen "ordre"), men begrepet "ordre" er fremmed
  for hvordan hun selv tenker på jobbene sine ("oppdrag hos kunde").
- Opplever ett reelt avbrudd: strømbrudd i huset hun jobber i (ironisk, gitt yrket) slår ut
  wifi-ruteren hun midlertidig hadde koblet mobilen til — mister nett brått midt i en
  taleregistrering. Appen håndterer det greit teknisk (lokal lagring), men hun får ingen
  bekreftelse på skjermen om at *denne spesifikke* oppføringen faktisk ble lagret riktig før
  bruddet, og blir usikker.
- Ringer ingen kollega (jobber alene) — må selv resonnere seg frem til at det sannsynligvis gikk
  bra, uten å faktisk kunne bekrefte det før hun er tilbake på dekning.

**Tanker underveis**: *"Ingen av disse skjemaene er for meg."* → *"Ble den siste registreringen
faktisk lagret, eller mistet jeg den i strømbruddet?"* → *"Jeg skulle hatt noen å spørre nå."*

**Feil**: Ingen faktisk datafeil (lokal lagring er robust), men betydelig *opplevd* usikkerhet
fordi hun mangler en kollega å bekrefte med — en sårbarhet spesifikk for solo-arbeidere som
appen ikke kompenserer for med tydeligere lagringsbekreftelse.

**Frustrasjon**: 6/10 — drevet av manglende bekreftelse i et øyeblikk hun ikke hadde noen å
støtte seg på.

**Trygghet**: 5/10 — ville vært høyere med en tydelig "lagret lokalt ✓"-indikator per
oppføring.

**Arbeidsmengde**: Omtrent likt med dagens system (mest sannsynlig papir eller enkel
Excel-loggføring) — ingen klar gevinst for solo-arbeidere uten skreddersydde skjema.

**Videre bruk**: Vil sannsynligvis fortsette, men med lav entusiasme — vil trolig etterspørre
elektrofag-spesifikke skjema før hun anbefaler produktet til andre i bransjen.

---

### 17. Patrick, 24 år — fibermontør (ikke-eksisterende org-pakke, ruteorientert oppdragsarbeid)

**Profil**: Digitalt kompetent (bruker allerede en ruteplanleggings-app fra arbeidsgiver), utålmodig,
kjører mye bil mellom oppdrag i løpet av dagen, forventer at alt "bare synker automatisk" slik
andre arbeidsapper han bruker gjør.

**Førsteinntrykk**: Sammenligner umiddelbart med ruteplanleggeren han allerede bruker daglig —
misliker at Punchout er et *helt separat* system uten kobling til den, og at han må starte
dagen/logge arbeid to steder.

**Første arbeidsdag**:
- Besøker 6 ulike installasjonsadresser i løpet av dagen, mye kjøring mellom hver. Logger
  hver installasjon som egen "ordre"-oppføring — fungerer greit teknisk.
- Kjører gjennom flere områder med dårlig/ingen dekning underveis (typisk for fiberutbygging i
  spredtbygde strøk) — akkurat som Kristin (jernbane), rammes han av at taleinput krever nett,
  mens resten av loggingen ikke gjør det. Går over til manuell tekst i bilen ved rødt lys/stopp.
- "Tror appen har fryst" én gang: er midt i en taleregistrering når han kjører inn i et
  tunnelaktig område (høy fjellskjæring) — mikrofonen henger i "Behandler..." lenger enn de 15
  sekundene han forventer fordi han ikke husker det automatiske avbruddet presist, blir
  utålmodig og trykker flere ganger på mikrofonen, noe som utløser
  dobbelttrykk-beskyttelsen (`voiceSessionActive`) og gjør at ingenting skjer i det hele tatt før
  han gir opp og skriver manuelt i stedet.
- Ved dagsslutt: eksportstatus viser "Sender til Mesta..." (eller tilsvarende) og han forlater
  jobb for dagen uten å vente på at det fullfører — ser aldri om det faktisk gikk gjennom, siden
  han er i bilen på vei hjem og ikke tenker på det igjen før neste dag.

**Tanker underveis**: *"Hvorfor er dette et helt eget system fra ruteappen min?"* → *"Kom igjen,
funker du eller ikke?"* → *"Jeg stoler på at det bare ordner seg — det gjør det jo som regel."*

**Feil**: Gjentatte mikrofontrykk pga. utålmodighet i dårlig dekning-område (ingen skade, men
opplevd friksjon). Forlater appen før eksport bekreftet fullført.

**Frustrasjon**: 6/10 — moderat-høy, drevet av sammenligning mot et bedre integrert
verktøy han allerede bruker, pluss dekningsproblemer på reise.

**Trygghet**: 6/10 — "stoler på at det ordner seg", en avslappet, kanskje litt for
ubekymret tillit gitt at han aldri faktisk verifiserer at eksporten fullførte.

**Arbeidsmengde**: Oppleves som "enda et system å forholde seg til" snarere enn enklere eller
vanskeligere enn papir i seg selv — den reelle friksjonen for ham er *duplisert arbeidsflyt*
(rute-app + Punchout), ikke Punchout isolert sett.

**Videre bruk**: Fortsetter fordi han må, men lav entusiasme og lav sannsynlighet for å
anbefale med mindre Punchout kan integreres med eller erstatte ruteplanleggeren han allerede
bruker daglig.

---

### 18. Sindre, 41 år — skogsmaskinfører (ikke-eksisterende org-pakke, dyp skog, ekstrem isolasjon)

**Profil**: 16 år i skogbruket, jobber praktisk talt alene i hyttelignende maskinkabiner dypt
inne i skog, ofte dagevis uten fysisk kontakt med andre. Rolig, selvstendig, lav-middels
teknisk kompetanse, men ikke motvillig — bare uvant.

**Førsteinntrykk**: Ser mikrofonen og tenker med en gang at den er ubrukelig for ham — han har
ofte *ingen* dekning i det hele tatt, ikke bare "dårlig", i store deler av hogstfeltet.

**Første arbeidsdag**:
- Starter dagen på skogsbilveien der han har litt dekning, logger inn og fyller ut
  et generisk sikkerhetsskjema greit.
- Kjører maskinen inn i selve hogstfeltet — total nettmangel i 7+ sammenhengende timer, langt
  utover det noen annen persona i denne simuleringen opplever. Logger manuelt hele dagen; dette
  fungerer *teknisk* helt problemfritt (lokal-først-arkitekturen er nøyaktig laget for dette
  scenariet, selv om ingen i produktteamet nødvendigvis hadde skogbruk i tankene).
- Eneste virkelige friksjon: håndrens og "Lås dag" krever ingen nettforbindelse i seg selv
  (`lockDay()` er en lokal handling), så han kan faktisk fullføre og låse dagen sin helt uten
  dekning — noe han ikke forventet og blir positivt overrasket over.
- Kjører ut av skogen på kvelden, får dekning igjen, og eksporten sendes automatisk i
  bakgrunnen (60-sekunders synk-løkke + `online`-event-trigger) uten at han må gjøre noe aktivt.
  Merker det knapt.

**Tanker underveis**: *"Dette kommer ikke til å funke her inne."* → *"Vent, jeg klarte faktisk
å låse dagen uten nett i det hele tatt?"* → *"Det bare ordnet seg selv da jeg kom ut igjen."*

**Feil**: Ingen — dette er det nærmeste simuleringen kommer en persona der Punchouts
lokal-først-arkitektur presterer *bedre* enn forventet.

**Frustrasjon**: 2/10 — lav, fordi forventningene hans var lave og virkeligheten overgikk dem.

**Trygghet**: 7/10 — økende trygghet gjennom dagen, spesifikt drevet av at "lås dag" fungerte
offline uten drama.

**Arbeidsmengde**: Klart enklere enn papir for ham spesifikt — papirskjema i en skogsmaskinkabin
dypt inne i skogen, som så må fysisk fraktes ut og leveres, er en reell praktisk byrde appen
løser helt og holdent.

**Videre bruk**: Sannsynlig ambassadør, ironisk nok en av personaene med lavest forventning i
utgangspunktet. Skogbruk er trolig den bransjen (av de seks uten org-pakke) der Punchouts
*tekniske* arkitektur (offline-først) passer aller best — vokabularet (ordre/lønnskoder) ville
fortsatt trenge tilpasning, men selve mekanikken er en nesten perfekt match.

---

### 19. Bjarne, 58 år — innleid maskinkjører (landbruk, sesongbasert, ikke-eksisterende org-pakke)

**Profil**: Driver eget gårdsbruk, tar sesongoppdrag som innleid maskinkjører for andre gårder/
entreprenører noen uker i året (våronn, innhøsting). Bruker Punchout svært sporadisk — kanskje
8-10 dager spredt gjennom hele sesongen, aldri sammenhengende nok til at det blir en vane.

**Førsteinntrykk**: Har glemt det meste fra forrige gang han brukte appen (tre måneder siden).
*"Var det denne knappen jeg skulle trykke, eller...?"* Ingen "husk meg"/gjenkjennelse av at han
har brukt den før — hver økt føles som første gang.

**Første arbeidsdag** (av et fåtall spredte oppdrag i sesongen):
- Bruker unormalt lang tid på pre-day fordi han må gjenoppdage grensesnittet fra bunnen hver
  gang — ingen personlig tilpasning eller "siste gang gjorde du sånn"-hjelp.
- Fyller ut et generisk maskinsjekk-skjema (tilpasset for anleggsmaskiner, ikke
  landbruksmaskiner spesifikt) og synes flere av feltene er irrelevante for traktoren/
  innhøstingsutstyret hans.
- Registrerer arbeidstimer greit via tekst, unngår mikrofon (ikke av frykt, bare fordi han ikke
  har brukt den nok til at det er en vane).
- Blir avbrutt av en reell hverdagshendelse: kua/dyr har kommet seg ut av innhengningen på egen
  gård, må dra fra oppdraget i 25 minutter for å fikse det — kommer tilbake, finner
  loggen sin uendret (ingen tap), fortsetter uten videre problem.
- Ved dagsslutt: håndrens' "lønnskoder"-krav for å låse hovedtimeføring er forvirrende for en
  som ikke er kjent med den type avlønningsstruktur fra egen gårdsdrift — må spørre
  oppdragsgiveren (bonden/entreprenøren han jobber for denne dagen) om hjelp.

**Tanker underveis**: *"Hvordan var det nå igjen jeg gjorde dette sist?"* → *"Grei nok kua-
avbrytelse, i det minste mistet jeg ingenting."* → *"Jeg må spørre noen om denne
lønnskode-greia hver eneste gang."*

**Feil**: Ingen tekniske feil — men kronisk "gjenlæring fra bunnen" hver gang pga. lav
brukshyppighet, og manglende domenetilpasning for landbruksspesifikke oppgaver.

**Frustrasjon**: 5/10 — moderat, drevet av gjentatt "jeg har glemt hvordan dette virker"-
følelse fremfor akutte problemer.

**Trygghet**: 5/10 — verken høy eller lav, mest preget av usikkerhet fra manglende øvelse.

**Arbeidsmengde**: Omtrent likt med papir for ham — fordelen med digital logging (fart,
sporbarhet) realiseres først ved regelmessig bruk, som han aldri får nok av til å oppleve.

**Videre bruk**: Fortsetter å bruke det når han må (ingen aktivt motstand), men vil aldri bli en
"god" bruker eller ambassadør — sesongarbeidere med sporadisk bruk er en strukturelt vanskelig
gruppe for enhver app som er avhengig av opparbeidet brukervane, uavhengig av hvor godt UI-et
er designet.

---

### 20. Camilla, 36 år — parkarbeider, kommunal drift (ikke-eksisterende org-pakke, varierte
daglige oppgaver)

**Profil**: 9 år i kommunal park- og idrettsdrift, uformell og avslappet personlighet, middels
teknisk kompetanse, jobber i et lite team på 3-4 der oppgavene varierer sterkt fra dag til dag
(gressklipping, snørydding, lekeplassvedlikehold, akutte henvendelser fra innbyggere).

**Førsteinntrykk**: Ler litt av "Start dag"-skjermens formelle tone ("Klar for en ny
arbeidsdag") — *"høres ut som noe fra HR, ikke fra oss."* Ellers uproblematisk, kommer raskt i
gang.

**Første arbeidsdag**:
- Dagens oppgaver er svært spredt: klipping i park A, en innbyggerklage om en ødelagt
  lekeplassbenk hun må dra til akutt, snørydding på en gangvei på slutten av dagen (uvanlig
  sammensatt dag selv for kommunal drift, men ikke urealistisk).
- Fordi ingen av disse oppgavene har et naturlig "ordrenummer" på samme måte som en
  anleggsentreprise, blir alt fritekst uten den strukturerte ordre-bekreftelsen. Hun improviserer
  ved å skrive stedsnavn i fritekst i stedet ("Parkveien lekeplass, byttet ødelagt fjærhusk").
- Byttet oppgave 4 ganger i løpet av dagen (mer enn en typisk anleggsdag, men mindre fragmentert
  enn Yusufs byggeplass) — ingen tekniske problemer med selve oppgavebyttet.
- Blir avbrutt av en telefon fra kommunens vaktsentral midt i en registrering om
  lekeplassbenken — legger fra seg mobilen, kommer tilbake 8 minutter senere, fullfører
  registreringen uten tap.
- Ved dagsslutt: håndrens-språket ("hovedtimeføring", "lønnskoder") er fremmed for kommunal
  driftskultur (hun er fast ansatt med fast lønn, ikke lønnskode-basert timeregistrering på
  samme måte som en anleggsarbeider) — bruker unødvendig tid på å finne ut at dette faktisk ikke
  gjelder henne og kan "forkastes" med "Timene er ført i annet system" (kommunens eget
  timesystem).

**Tanker underveis**: *"Høres ut som noe fra HR."* → *"Ingen av disse oppgavene har et
ordrenummer, så jeg dikter opp et stedsnavn i stedet."* → *"Dette lønnskode-greiene gjelder vel
ikke meg? Håper det i alle fall."*

**Feil**: Ingen tekniske feil — men systematisk "omgåelse" av strukturerte felt (ordre,
lønnskoder) som ikke passer hennes ansettelsesform/arbeidsstruktur.

**Frustrasjon**: 4/10 — lav-moderat, mest småirritasjon over terminologi som ikke passer.

**Trygghet**: 6/10 — grei tillit til grunnfunksjonene, men usikker på om "forkast
timeføring"-veien faktisk er riktig fremgangsmåte for hennes ansettelsestype, eller om hun gjør
noe "feil" ved å velge det hver dag.

**Arbeidsmengde**: Sammenlignet med muntlig rapportering (som er dagens praksis i mange
kommunale driftsteam) er dette faktisk en økning i arbeidsmengde — hun må nå aktivt logge noe
hun tidligere bare fortalte formannen muntlig på slutten av dagen.

**Videre bruk**: Fortsetter, men uten entusiasme — ser ikke en klar personlig gevinst
sammenlignet med den uformelle muntlige rapporteringskulturen hun er vant til, selv om hun
forstår at sporbarheten trolig er nyttig for kommunen som organisasjon.

---

## Mønsteranalyse: de underliggende årsakene

Å telle stemmer ("14 av 20 var positive") ville skjule det som faktisk betyr noe. Fem
underliggende mønstre går igjen på tvers av nesten alle 20:

**1. "Myk håndheving" er en villet designbeslutning som skaper et konsekvent tillitsgap.**
"Gå til drift"/"Bekreft"-knapper er *aldri* faktisk sperret av påkrevde skjema (kun
hovedtimeføring/lønnskoder er reelt blokkerende, og kun ved låsing av dagen). Dette går igjen
hos Kim (hopper over SJA uvitende), Silje (oppdager det som leder og blir bekymret), Henrik
(spør eksplisitt "hvorfor kalles det påkrevd?"), Geir (bekymret i sikkerhetskritisk
sammenheng), Morten (identifiserer det som en kommunikasjonsrisiko). Dette er ikke 5 isolerte
observasjoner — det er samme produktbeslutning sett fra 5 ulike vinkler, og alle 5 vinklene
peker samme vei: teksten i UI-et ("Påkrevd") lover mer håndheving enn koden faktisk leverer.

**2. Ingen selvbetjent retting skaper unødvendig frykt hos akkurat de brukerne appen burde
bygge tillit hos.** Aisha (ny maskinfører) og Odd (61, lite teknisk) er de to personaene med
lavest starttillit — og begge møter "ingen sletting, ingen retting etter låsing" som bekrefter
heller enn avkrefter frykten deres. En erfaren bruker som Roger merker knapt problemet, fordi
han sjelden gjør feil som må rettes. Konsekvensen av designvalget er dermed ikke jevnt fordelt —
den rammer nybegynnere og de med lav digital selvtillit hardest, samtidig som det er nøyaktig de
brukerne produktet trenger å ikke skremme bort.

**3. Talegjenkjenning som "krever nett" er en skjult, ikke-kommunisert begrensning som treffer
feltarbeidere systematisk hardere enn kontorpersonale.** Roger, Kristin, Sindre og Patrick
(alle feltarbeidere i områder med varierende/dårlig dekning: kulvert, jernbanetrasé, dyp skog,
bil på landsbygda) støter alle på "Nettverksfeil – trenger nett for tale" uten forvarsel — mens
Silje og Morten (kontor-/lederroller som tester appen fra kontoret) aldri opplever det i det
hele tatt. Selve funksjonen som skal gjøre feltarbeid *enklere* (tale i stedet for skriving med
hansker) svikter systematisk akkurat der feltarbeid faktisk skjer.

**4. Total fravær av synlig synk-/offlinestatus under aktivt arbeid skaper "stille utrygghet"
uavhengig av om noe faktisk går galt.** Kristin, Fatima og Patrick opplever alle en variant av
"vet jeg om dette kom frem?" — selv om den tekniske sync-mekanismen (retry, backoff, dedup via
exportId/409) faktisk er solid. Dette er det klareste eksempelet i hele simuleringen på at
*teknisk korrekthet* og *opplevd trygghet* er to helt forskjellige ting: systemet gjør jobben sin
riktig, men gir brukeren ingen måte å vite det på før dagen er låst og eksportstatusen vises —
og for feltarbeidere med dårlig dekning kan selv det ta lang tid å bekrefte.

**5. Vokabularet (ordre, lønnskoder, maskintimer, hovedtimeføring) er anleggsbransje-spesifikt,
og dette er ikke en kosmetisk detalj — det endrer hvor godt hele produktet oppleves å "passe"
for seks av ti simulerte bransjer.** Nora (VA), Ingrid (elektro), Camilla (kommunal park) støter
alle på det samme: strukturerte felt som ikke matcher hvordan de faktisk tenker på og snakker om
jobben sin. Dette bekrefter direkte funnet fra forrige fase (adapterplattform-rapporten): motoren
speiler anleggsbransjens vokabular bevisst og korrekt — men konsekvensen av det valget er at
produktet, slik det står i dag, har et smalere reelt bruksområde enn "Punchout" som merkevarenavn
antyder.

---

## De største UX-problemene (sortert etter alvorlighet)

| # | Problem | Hvem rammes | Hvorfor | Hvor ofte | Konsekvens | Alvorlighet |
|---|---|---|---|---|---|---|
| 1 | "Påkrevd" skjema blokkerer aldri faktisk fremgang | Alle, spesielt sikkerhetskritiske bransjer (Nordkraft, Nordhavn) og nye ansatte (Kim) | Bevisst designvalg ("aldri blokkerende"), men UI-teksten kommuniserer det motsatte | Hver eneste dag, for enhver bruker som velger å hoppe over | HMS-dokumentasjon kan mangle helt uten at noen oppdager det før i etterkant | **Kritisk** |
| 2 | Ingen retting/sletting av låste oppføringer | Nybegynnere og lav-selvtillit-brukere hardest (Aisha, Odd), men prinsipielt alle | Bevisst arkitekturvalg (datakvalitet/sporbarhet), men ingen selvbetjent feilrettingsvei | Enhver skrivefeil, feiltrykk eller feilhørt taleord | Permanent feil data i loggen inntil manuell, out-of-band oppfølging med leder | **Kritisk** |
| 3 | Ingen synlig offline-/synkstatus under aktivt arbeid | Feltarbeidere i dekningsutsatte områder (jernbane, skog, havn, kjøring) | `outboxStatus` finnes i motoren, men er ikke koblet til noe UI før dagen er låst | Daglig for enkelte bransjer/geografi | Unødvendig utrygghet, unødvendige support-/formannshenvendelser ("kom dataene mine frem?") | **Høy** |
| 4 | Talegjenkjenning krever nett, uten forvarsel | Feltarbeidere med varierende dekning (flertallet av målgruppen) | Nettleser-API-begrensning (Web Speech API), ikke kommunisert før feilen oppstår | Hyppig i utsatte bransjer (jernbane, skog, fiber) | Brukeren mister den funksjonen som skulle gjøre loggingen enklest, akkurat når hen trenger den mest | **Høy** |
| 5 | Feilmeldinger på lagringsfeil er rå/tekniske | Alle, spesielt lavere digital kompetanse (Odd) | Rå `error.message` fra JavaScript vises direkte til sluttbruker | Sjelden (kun ved faktisk lagringssvikt), men alvorlig når det skjer | Panikk/mistillit hos nettopp de brukerne som trenger mest ro i en feilsituasjon | **Middels** |
| 6 | Vokabular (ordre/lønnskoder/maskintimer) passer ikke bransjer utenfor anlegg | VA, elektro, kommunal drift, landbruk (6 av 10 simulerte bransjer) | Bevisst forankret i frosset motor, korrekt for anlegg | Gjennomgående for disse brukergruppene, hver dag | Opplevd "ikke laget for meg", lavere datakvalitet (info tvunget inn i feil felt) | **Middels** (høy for disse spesifikke gruppene) |
| 7 | Håndrens-sjargong uten forklaring | Lav digital/bransjekompetanse (Kim, Odd, Bjørg), utenforstående bransjer | Terse, jargong-tunge etiketter uten tooltip/glossar | Hver dag, ved avslutning | Forsinkelse, avhengighet av kollegahjelp, "jeg skjønner ikke hva jeg gjør" | **Middels** |
| 8 | Ingen aktivitetspåminnelse ved lange stille perioder | Fragmenterte arbeidsdager (Yusuf/bygg), glemske brukere | Ingen "du har ikke logget noe på X minutter"-funksjon | Vanlig i visse bransjer (bygg, kommunal drift) | Ufullstendige/upresise dagslogger uten at noen merker det | **Lav-middels** |
| 9 | Ingen formanns-/lederverktøy for sanntidsoppfølging i felt | Ledere (Wenche, Silje) | Operations Center er admin-only, ikke tilgjengelig/kjent for formenn i felt | Daglig for ledere som ønsker oversikt | Ledere må falle tilbake på muntlig oppfølging — ingen reell effektivisering av lederrollen | **Lav-middels** |
| 10 | Stale-day-banneret kan "dismisses" uten at noe faktisk avgjøres | Alle som lukker appen midt i en dag og glemmer den | "X"-knappen skjuler banneret lokalt uten å kalle noen motor-handling | Sjelden, men mulig for enhver bruker | Uavklart datatilstand som kan gjenoppstå ved neste innlasting | **Lav** |

---

## De største styrkene (sortert etter verdi)

1. **Lokal-først-arkitekturen er den mest verdifulle enkeltegenskapen i produktet.** Sindre
   (skog) og Kristin (jernbane) beviser dette mest dramatisk: full funksjonalitet, inkludert
   *låsing av hele dagen*, uten nett i timevis. Ingen av de 20 personaene mistet noensinne data
   pga. manglende dekning. Dette oppfattes (der brukeren i det hele tatt merker det) som det
   mest **betryggende** ved produktet.

2. **Strukturert ordre-gjenkjenning fra fritekst/tale ("Bekreft ordrelinje") er genuint smart**
   der den treffer (Roger, Fatima) — det er den delen av produktet som nærmest føles "magisk"
   sammenlignet med papir, fordi den fanger struktur uten å kreve at brukeren fyller ut separate
   felt manuelt. Svakheten (Henrik sitt uvante format, Nora sitt VA-saksnummer) er samtidig
   beviset på at *verdien* av funksjonen er reell nok til at brukere merker og reagerer når den
   ikke treffer.

3. **Lønnskode-sperren på hovedtimeføring oppfattes konsekvent som tidsbesparende**, ikke
   irriterende — Roger sier det rett ut: den fjerner en kjent kilde til etterarbeid/telefoner fra
   lønn. Dette er det klareste eksempelet på at *streng* håndheving (i motsetning til myk
   påkrevd-merking andre steder) oppleves positivt når brukeren skjønner *hvorfor* den er streng.

4. **RUH-flytens ekstra friksjon (ingen engangs-bekreft, eksplisitt "Behandle"-steg) oppfattes
   som riktig, ikke tungvint**, av nettopp den sikkerhetsbevisste brukeren (Geir) den er designet
   for. Dette viser at produktet *kan* balansere friksjon og trygghet riktig — det gjør det bare
   ikke konsekvent på tvers av alle skjematyper (jf. UX-problem #1).

5. **Eksport-mekanikken (retry, eksponentiell backoff, idempotens via exportId/409, opprydding
   av gamle sendte pakker) er teknisk solid nok til at ingen av de 20 personaene faktisk mistet
   data i noen simulert feilsituasjon** — mistilliten som oppstår (Kristin, Patrick) er alltid
   en *kommunikasjonssvikt* (manglende statusvisning), aldri en reell teknisk svikt. Det er et
   godt utgangspunkt: den vanskelige delen (pålitelig synk) er løst, den gjenstående delen
   (vise det til brukeren) er en enklere UI-oppgave.

---

## Simulert pilotmåned (4 uker, alle 20 brukere)

**Uke 1 — Ren onboarding-friksjon.** Odd (61) og Bjørg (48) bruker uforholdsmessig mye tid og
kollegahjelp. Aisha (23) opplever sin første "låste feil" og blir merkbart mer forsiktig for
resten av uken. Nora (VA) og Ingrid (elektro) konkluderer allerede nå at vokabularet ikke passer
dem, men fortsetter fordi de må. Sindre (skog) og Roger (asfalt) er produktive fra dag én — lav
friksjon, høy selvtillit fra start.

**Uke 2 — De strukturelle problemene begynner å vise seg, ikke de kosmetiske.** Kristin
(jernbane) og Patrick (fiber) begynner å samle på "kom dataene mine frem?"-episoder og
begynner å ringe formann/support proaktivt "for sikkerhets skyld" i stedet for å stole på
appen. Wenche (formann) merker at hun bruker mer tid enn forventet på uformell support for
laget sitt, uten verktøy for å gjøre den jobben effektivt. Geir (Nordkraft) eskalerer sin
bekymring om myk håndheving av sikkerhetsskjema til driftsleder.

**Uke 3 — Polarisering.** De som fikk en god første uke (Roger, Fatima, Sindre, Terje)
er nå raske, selvsikre brukere som ikke lenger tenker over appen — den er "bare et verktøy" nå.
De som slet i uke 1 (Odd, Bjørg) har enten stabilisert seg på et lavere, tekstbasert
mestringsnivå (Bjørg) eller begynner å vise tegn til unnvikelse — Odd lar bevisst yngre
kollegaer gjøre håndrens-steget for ham når han kan. Yusuf (bygg) og Camilla (kommunal) fortsetter
å produsere teknisk feilfri, men innholdsmessig ufullstendig/upresis data, uten at noe i
systemet fanger opp eller flagger dette.

**Uke 4 — Konsolidering.** Roger, Fatima, Sindre og Terje er nå de facto interne
ambassadører — kollegaer spør dem, ikke IT-support, når noe er uklart. Wenche og Morten
(driftsleder) har uavhengig av hverandre konkludert at produktet er *teknisk* pilotklart, men
har begge separate, konkrete eskaleringspunkter (formannsverktøy; feilmeldingstekst) de vil ha
adressert før videre utrulling. Odd har blitt en fungerende, om enn avhengig, bruker — han
klarer det grunnleggende alene nå, men unngår fortsatt aktivt mikrofon og håndrens uten hjelp.
Nora, Ingrid og Camilla bruker produktet uten motstand, men uten entusiasme — "det er greit,
men det er ikke laget for oss" er holdningen som har satt seg hos alle tre. Bjarne (landbruk,
sesongarbeider) rekker knapt å bruke produktet nok ganger i løpet av måneden til at noe endrer
seg for ham i det hele tatt.

**Hvem blir gode brukere:** Roger, Aisha (etter en forsiktig start), Fatima, Terje, Sindre,
Kim (til tross for lav skjemadisiplin — hun er *rask*, ikke *ukyndig*).

**Hvem gir opp / trenger vedvarende hjelp:** Odd (avhengig av kollegahjelp på håndrens
resten av piloten), Bjarne (for lav brukshyppighet til å noensinne etablere en vane).

**Hvem trenger strukturert oppfølging:** Bjørg (trenger tid, ikke evne), Wenche (trenger
verktøy for lederrollen sin, ikke opplæring i feltappen), Nora/Ingrid/Camilla (trenger et
produktsvar — domenetilpasning — ikke mer opplæring i det eksisterende produktet).

**Hvem blir ambassadører:** Roger, Fatima, Sindre — fellestrekket er *ikke* høy teknisk
kompetanse i seg selv (Fatima og Sindre er middels), men lav initial skepsis kombinert med tidlig,
friksjonsfri suksess i egen arbeidshverdag.

**Hvem motarbeider løsningen (aktivt eller passivt):** Ingen av de 20 er åpent fiendtlige — men
Geir (Nordkraft) og Wenche (formann) representerer den farligste typen motstand for en pilot:
saklig, godt begrunnet, og rettet mot reelle produktbeslutninger (myk håndheving; manglende
lederverktøy) fremfor mot endring generelt. Denne typen tilbakemelding er lett å avfeie som
"vanlig pilotmotstand" — men bør ikke avfeies, fordi den peker på ekte gap.

---

## Sammenligning med dagens arbeidsmetode

| Brukergruppe | vs. papir | vs. Excel | vs. eksisterende fagsystem | vs. muntlig rapportering |
|---|---|---|---|---|
| Erfarne anleggsarbeidere (Roger, Terje, Bjørg) | Klar forbedring i fart og sporbarhet; verre ved uventede avbrudd (mistet telefon) | N/A (brukte sjelden Excel selv) | N/A | Klar forbedring — sporbart fremfor "sa jeg fra?" |
| Nye/usikre brukere (Kim, Aisha, Odd) | Verre ved feil (papir tilgir rettelser, Punchout gjør ikke) | N/A | N/A | N/A |
| Ledelse (Silje, Morten, Wenche) | Bedre sporbarhet enn muntlig, men mangler proaktiv varsling som et godt Excel-dashbord ville gitt | Tap av den umiddelbare, fleksible oversikten et vant Excel-ark gir; delvis oppveid av strukturert lagring | N/A | Klar forbedring i sporbarhet, men leder mister den uformelle "temperaturmålingen" daglig prat gir |
| Havn/kraft/jernbane (Fatima, Geir, Kristin) | Bedre for strukturerte oppgaver; verre for sikkerhetskritiske skjema pga. myk håndheving | N/A | Sammenlignbart med eksisterende HMS-systemer på innhold, dårligere på håndheving av kritiske skjema | Klar forbedring |
| Bransjer uten org-pakke (Nora/VA, Ingrid/elektro, Camilla/kommunal, Bjarne/landbruk) | Omtrent likt eller verre — feil vokabular tvinger informasjon inn i feil felt | Verre enn et fagsystem tilpasset egen bransje (Nora har allerede ett) | Klart verre der et bransjetilpasset fagsystem allerede finnes (Nora) | For Camilla: faktisk en *økning* i arbeidsmengde sammenlignet med uformell muntlig rapportering |
| Isolerte/offline-tunge (Sindre/skog, Kristin/jernbane) | Klar forbedring — fysisk skjematransport i felt er en reell byrde papir har og Punchout ikke har | N/A | N/A | N/A |

---

## Kritisk evaluering — forsøk på å motbevise produktet

**Hvorfor ville en erfaren formann avvise dette?** Fordi det ikke gir henne noe hun ikke allerede
hadde (muntlig oppfølging av laget), samtidig som det legger til en ny, uformell IT-support-rolle
hun ikke ba om ("appen har fryst"-telefoner). Wenches konklusjon — "ikke verre enn papir for meg,
men heller ikke bedre ennå" — er den mest realistiske avvisningsgrunnen i hele simuleringen: ikke
sinne, bare fravær av en tydelig personlig gevinst for akkurat hennes rolle.

**Hvorfor ville en eldre medarbeider vegre seg?** Ikke fordi han er "mot teknologi" generelt
(Odd bruker Facebook), men fordi konsekvensene av å gjøre en feil oppleves permanente og
skumle (ingen retting, rå feilmeldinger, "appen har fryst"-opplevelser på dårlig dekning) i et
system uten den fysiske, reversible tilgivelsen papir har (stryk ut, skriv på nytt).

**Hva ville irritert en maskinfører?** At mikrofonen — den ene funksjonen som er spesifikt
designet for å passe hendene og forholdene hans — svikter akkurat der dekningen er dårligst,
som ofte er akkurat der han jobber (skog, tunnel, kulvert, avsidesliggende spor).

**Hva ville fått en prosjektleder til å miste tilliten?** Å oppdage, som Silje gjør, at
"Påkrevd" i grensesnittet ikke faktisk betyr påkrevd i systemet — det er nøyaktig den typen
funn som får en ansvarlig leder til å stille spørsmål ved *alt annet* merket "påkrevd" eller
"obligatorisk" i produktet, selv der det faktisk stemmer (som RUH-flyten).

**Hvilke deler føles unødvendige?** Operations Center-dashbordets manglende kobling til
faktisk skjemainnhold (kun metadata) føles som en halvferdig funksjon — verken fisk eller fugl,
verken et fullt innsynsverktøy eller fraværende. For seks av bransjene uten org-pakke føles
hele "ordre"-strukturen som en unødvendig omvei rundt hvordan de faktisk beskriver jobben sin.

**Hvilke deler er geniale?** Lokal-først-arkitekturen kombinert med usynlig, robust
bakgrunnssynk (når den *fungerer* usett, som for Sindre) er det nærmeste produktet kommer ekte
"det bare funker"-magi. Strukturert ordrelinje-gjenkjenning fra fritekst/tale er den andre
kandidaten — når den treffer, gjør den noe et papirskjema aldri kunne: omgjøre løs tale til
strukturert data uten at brukeren merker at hen "fyller ut et skjema" i det hele tatt.

---

## Prioriterte forbedringer

### Kritisk før pilot

1. **Rett opp gapet mellom "Påkrevd"-merking og faktisk håndheving** — enten gjør påkrevde
   pre-day-skjema faktisk blokkerende (med et unntak/overstyringsalternativ for reelle
   nødstilfeller), eller endre teksten til noe som ikke lover håndheving som ikke finnes
   ("Anbefalt av arbeidsgiver" i stedet for "Påkrevd"). Begrunnelse: dette er UX-problem #1,
   observert fra 5 uavhengige vinkler (Kim, Silje, Henrik, Geir, Morten), og er den enkeltfaktor
   som mest sannsynlig undergraver tilliten til *hele* produktet hos ledelse og
   sikkerhetsbevisste brukere hvis den oppdages etter pilotstart i stedet for før.
2. **Vis synk-/offlinestatus synlig i Operations-skjermen, ikke bare på completion-screen.**
   Begrunnelse: UX-problem #3, den mekanismen som allerede finnes (`outboxStatus`) er ikke
   koblet til UI — dette er en lav-kompleksitet endring (koble eksisterende data til et
   eksisterende sted i UI) med høy effekt på opplevd trygghet for nettopp de brukerne
   (jernbane, skog, havn, fiber) piloten sannsynligvis skal teste tyngst.

### Viktig under pilot

3. **Skriv om tekniske feilmeldinger (spesielt lagringsfeil) til sluttbruker-vennlig språk**,
   fjern rå JavaScript-feiltekst fra det brukeren ser. Begrunnelse: UX-problem #5 — sjelden, men
   når det skjer, rammer det akkurat de brukerne (Odd) som allerede har lavest tillit.
4. **Kommuniser tydelig at taleinput krever nettforbindelse, proaktivt** (f.eks. gråne ut/skjule
   mikrofonknappen med en kort forklarende tekst når nettet er borte, i stedet for å la brukeren
   oppdage det reaktivt via en feilmelding etter forsøk). Begrunnelse: UX-problem #4, rammer
   flertallet av feltarbeidere i denne simuleringen.
5. **Gi formenn et enkelt, felt-tilgjengelig verktøy for å se hvem i eget lag som mangler
   påkrevde skjema** — trenger ikke være hele Operations Center, kan være en enkel liste.
   Begrunnelse: Wenches situasjon representerer en hel brukerrolle (formann) som i dag ikke får
   noen ny kapasitet fra produktet, bare nye, uformelle forpliktelser (support for laget).
6. **Legg til en enkel, ikke-påtrengende varsling ved lang inaktivitet** ("Du har ikke logget
   noe på over 2 timer — stemmer det?"). Begrunnelse: UX-problem #8, adresserer stille
   datakvalitetstap hos fragmenterte arbeidsdager (bygg, kommunal drift) uten å legge til
   friksjon for andre.

### Kan vente

7. Domenetilpasning for bransjer uten org-pakke (VA, elektro, kommunal drift, landbruk, fiber) —
   reelt og dokumentert (UX-problem #6), men er et *produktomfang*-spørsmål, ikke en pilot-
   blokkerende feil, så lenge piloten faktisk er avgrenset til de fire eksisterende org-pakkene.
   Hvis piloten utvides til noen av disse seks bransjene, flytter dette punktet umiddelbart opp
   til "kritisk før pilot" for den spesifikke bransjen.
8. Glossar/tooltip-forklaringer for bransjesjargong i håndrens ("lønnskoder",
   "hovedtimeføring"). Begrunnelse: reelt friksjonspunkt (UX-problem #7), men kompenseres i
   praksis av kollegahjelp/opplæring i de fire eksisterende, godt kjente org-ene — mindre
   presserende enn punkt 1-6.
9. Koble Operations Center til faktisk skjemainnhold, ikke bare metadata, for ledere. Reelt
   ønske (Silje), men ledelsens *primære* eskaleringspunkt i simuleringen var punkt 1
   (håndhevingsgap), ikke innsynsdybde — løs det først.
10. Stale-day-banner: gjør "X"-dismiss til en eksplisitt beslutning i stedet for en stille
    skjuling. Lav frekvens (UX-problem #10), men billig å rette når tid tillater det.

---

## Sluttrapport

### Sammendrag

20 realistiske pilotbrukere ble simulert gjennom en full arbeidsdag i Punchout, forankret i
faktisk UI-tekst, feilmeldinger og systemoppførsel lest direkte fra kildekoden. Produktets
kjernearkitektur (lokal-først lagring, robust bakgrunnssynk, strukturert
tale-/tekst-gjenkjenning) presterer genuint godt — ingen av de 20 personaene mistet data i noen
simulert feilsituasjon. Men fem gjennomgående mønstre — myk håndheving som ikke matcher
"Påkrevd"-merking, manglende retteadgang for låste feil, usynlig synk-status, taleinnputt som
krever nett uten forvarsel, og et anleggsbransje-spesifikt vokabular — reduserer opplevd trygghet
og tilpasningsdyktighet systematisk, og rammer nybegynnere, sikkerhetsbevisste brukere og
bransjer utenfor kjerne-anleggssegmentet hardest.

### Viktigste observasjoner

- Teknisk pålitelighet (data går aldri tapt) og opplevd trygghet (brukeren *vet* ikke at data
  aldri går tapt) er systematisk frikoblet — det er produktets største enkeltstående gap.
- "Myk håndheving" av påkrevde skjema er en bevisst arkitekturbeslutning som fungerer utmerket
  for erfarne, ansvarlige brukere og dårlig for akkurat de tilfellene (nye ansatte,
  sikkerhetskritiske bransjer) den burde beskytte mest.
- Produktets vokabular er ikke nøytralt — det er anleggsbransje-spesifikt på en måte som er
  korrekt og bevisst for de fire eksisterende org-ene, men som skaper reell, målbar friksjon i
  seks av ti simulerte bransjer utenfor det segmentet.

### Gjennomgående mønstre

Se "Mønsteranalyse" over — myk håndheving, manglende retting, usynlig synk, nett-avhengig tale,
og bransjespesifikt vokabular er de fem som forklarer størstedelen av all opplevd frustrasjon på
tvers av 20 uavhengige personaer.

### Positive overraskelser

- Skogsmaskinføreren (Sindre) og sporarbeideren (Kristin) — de to personaene med lavest
  forventning til at appen ville "funke i det hele tatt" i deres arbeidsmiljø — hadde blant de
  mest problemfrie dagene teknisk sett. Lokal-først-arkitekturen leverer akkurat der den trengs
  mest, ikke bare i teorien.
- Lønnskode-sperren og RUH-flytens ekstra friksjon oppfattes begge positivt, ikke negativt —
  bevis på at *streng* håndheving fungerer godt når den er konsekvent og forstått, i sterk
  kontrast til den *myke* håndhevingen andre steder.

### Kritiske svakheter

Håndhevingsgapet på "Påkrevd"-merking, manglende selvbetjent feilretting, og usynlig
synk-/offlinestatus — se "Kritisk før pilot"-listen for de to første; den tredje er nær-kritisk.

### Hvem Punchout passer best for

Erfarne, selvstendige feltarbeidere i de fire eksisterende org-segmentene (anlegg, havn,
jernbane, kraft), spesielt i geografisk isolerte eller dekningsutsatte arbeidsmiljøer der
lokal-først-arkitekturen gir en reell, merkbar fordel over papir.

### Hvem som vil slite mest

Lav-digital-selvtillit-brukere uansett alder (Odd er tydeligst, men mønsteret er ikke
aldersbestemt i seg selv — det er selvtillit- og feiltoleranse-drevet), formenn/ledere som
forventer et oppfølgingsverktøy og ikke får ett, og enhver bruker i en bransje uten
matchende org-pakke.

### Forventet adopsjonsgrad etter 1 måned

Rundt 14-15 av 20 (70-75%) blir selvstendig produktive uten vedvarende støttebehov. 2-3
(Odd, Bjarne, og delvis Bjørg) trenger fortsatt aktiv støtte. 2-3 (Nora, Ingrid, delvis
Camilla) bruker produktet uten motstand, men uten reell tilfredshet — "compliance", ikke
tilfredshet.

### Forventet adopsjonsgrad etter 6 måneder

Hvis "kritisk før pilot"-punktene (håndhevingsgap, synk-synlighet) rettes: sannsynlig 17-18 av 20
solide, tilfredse brukere, med Odd og Bjarne som varige unntak av strukturelle årsaker
(feiltoleranse-frykt; for lav brukshyppighet) som ingen UI-endring alene løser. Hvis punktene
*ikke* rettes: risiko for at håndhevingsgapet manifesterer seg som et konkret, dokumentert
HMS-avvik i løpet av 6 måneder — noe som ville skade tilliten til hele produktet langt mer
alvorlig enn de daglige småfrustrasjonene i denne rapporten.

### Sannsynlige supporthenvendelser

I fallende forventet frekvens: "kom dataene mine frem / sendte det?" (dekningsutsatte
bransjer), "jeg gjorde en feil, kan noen rette den?" (nybegynnere), "hva betyr
lønnskode/hovedtimeføring?" (håndrens-sjargong), "hvorfor stoppet mikrofonen/hvorfor virker den
ikke?" (nett-avhengighet, ikke kommunisert), "appen har frosset" (som oftest er nettverks-
relatert ventetid, ikke faktisk frysing).

### Anbefalte produktforbedringer

Se "Prioriterte forbedringer" over — 2 kritiske, 4 viktige, 4 som kan vente.

### Endelig UX Readiness Score: 6,5 / 10

Kjernemekanikken (logging, lokal lagring, synk, tale-til-struktur) er solid og i flere tilfeller
genuint bedre enn dagens metoder. Poenget trekkes ned av ett systematisk, gjentatt funn (gapet
mellom kommunisert og faktisk håndheving) og ett strukturelt gap (usynlig synk-status) som
begge er rimelig billige å rette, men som i dagens tilstand skaper reell, målbar utrygghet hos
en betydelig andel av simulerte brukere.

### Endelig Pilot Readiness Score: 7 / 10

Produktet er klart for en avgrenset pilot i de fire eksisterende org-segmentene (anlegg, havn,
jernbane, kraft) — ingen av funnene i denne rapporten er blokkerende for å *starte* en pilot der.
Det er **ikke** klart for en pilot som inkluderer noen av de seks bransjene uten org-pakke (VA,
bygg, elektro, fiber, skogbruk/landbruk, kommunal drift) uten forutgående domenetilpasning — å
inkludere dem nå ville sannsynligvis produsere lav brukstilfredshet av årsaker produktet ikke
kan løse midt i en pilot. Poenget forutsetter at "Kritisk før pilot"-punktene (håndhevingsgap,
synk-synlighet) adresseres før pilotstart, ikke underveis — begge er observert som de mest
sannsynlige kildene til at en ellers vellykket pilot mister tillit hos ledelse eller
sikkerhetskritiske brukergrupper.

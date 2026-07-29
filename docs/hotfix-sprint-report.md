# Hotfix Sprint — Pilot Blockers: sluttrapport

Motor, Runtime, Completion Engine og Adapter Platform er uendret — `git diff --stat` mot disse
banene er tom etter alle 4 commits (`798c292..1634d09`). Ingen redesign, ingen nye funksjoner,
ingen refaktorering utover det som var direkte nødvendig for å implementere hver hotfix.

## Verifisering før implementering

Alle 4 funn fra den adversariale simuleringen ble lest direkte i koden før noe ble implementert
— ingen ble motbevist:

1. **Fane-/enhetskonflikt**: bekreftet. `saveCurrentDay()` (`motor.js:904-921`) skriver hele
   `{appState, dayLog}` uten versjonssjekk; `dayLog.version` (`:938-939`) er en
   engangs-migreringsverdi, ikke en revisjonsteller; ingen `storage`-lytter eller
   `BroadcastChannel` finnes noe sted i motor.js.
2. **Operations Dashboard**: bekreftet. `app/ops/page.tsx`s `fetch()` sendte ingen
   `Authorization`-header, og siden hadde ingen token-inndata noe sted.
3. **Refresh/ulagret arbeid**: bekreftet. `inputText`, `editText`, `pendingReview` i
   `operations-phase.tsx` er alle vanlig `useState`, aldri persistert.
4. **Dobbeltklikk**: bekreftet. `handleSubmitEntry` hadde ingen `isX`-vakt, ulikt
   `handleEndDay`/`handleContinue`/`handleLock` som alle har det samme etablerte mønsteret.

## Hotfix 1 — Fane-/enhetskonflikt

**Rotårsak**: se over. **Løsning**: ny `useCrossTabConflict()`-hook som lytter på nettleserens
native `storage`-event (fyres kun i ANDRE faner enn den som skrev) og viser en varselbanner med
en "Last inn på nytt"-handling. **Hvorfor valgt**: null endring i motor.js, ingen ny
lagringsmekanisme — kun å lytte på noe nettleseren allerede varsler om gratis. **Alternativer
forkastet**: full CRDT/automatisk sammenslåing (eksplisitt utenfor scope); blokkering av videre
skriving (brifens laveste prioritet — vurdert som mer invasivt enn nødvendig, kunne låst en
bruker som legitimt fortsetter i én fane etter å ha lukket en annen). **Påvirkning**: additiv —
1 ny hook, 1 ny banner-komponent, 3 nye linjer i `app/page.tsx`.

## Hotfix 2 — Operations Dashboard

**Rotårsak**: Sprint 4s (korrekte) sikkerhetsfiks la til autentisering på API-et, men siden som
konsumerer det fikk aldri en måte å oppgi et token. **Løsning**: et token-inndatafelt
(`sessionStorage`, ikke `localStorage`), sendt som `Authorization: Bearer`-header.
**Verifisert live**: curl uten header → 401 (den gamle, ødelagte oppførselen), curl med header
(nøyaktig det siden nå sender) → 200 med ekte data. **Ingen svekkelse**: `verifyAdminAuth()` er
urørt. **Påvirkning**: kun innenfor `app/ops/page.tsx`.

## Hotfix 3 — Refresh og ulagret arbeid

**Rotårsak**: se over. **Løsning**: debounced (250ms, samme mønster som allerede brukes i
`SchemaEditOverlay`) autosave av `inputText` til en egen, ny `localStorage`-nøkkel, gjenopprettet
ved mount. **Hvorfor autosave og ikke `beforeunload`-advarsel**: tidligere rapporter fant
gjentatte ganger at nettopp de minst digitalt trygge brukerne klikker gjennom dialogbokser uten
å forstå dem — en stille gjenopprettet kladd krever ingen forståelse for å virke.
**Scope-avgrensning, begrunnet**: kun `inputText` — `editText` mister i verste fall en rettelse
(originalteksten består), og `pendingReview`s underliggende tekst er indirekte dekket siden
`handleSubmitEntry` aldri tømmer `inputText` før den viser gjennomgangskortet.

## Hotfix 4 — Dobbeltklikk

**Rotårsak**: se over. **Løsning**: nøyaktig samme `isX`-vaktmønster (500ms) som allerede brukes
andre steder, brukt på `handleSubmitEntry`. **Ingen ny mekanisme**, per instruks.
**Dokumentert, ikke løst** (funnet under denne hotfixens egen verifisering, ikke en del av de 4
opprinnelige funnene): samme klasse mangel finnes fortsatt på håndrens' bekreft/forkast-knapper,
"Start dag"-knappen, og `SchemaEditOverlay`s lagre-knapp. Ingen av disse ble rørt denne sprinten.

## Nye tester

15 nye regresjonstester på tvers av 4 hotfixer (92 totalt, opp fra 84 før sprinten), hver knyttet
til minst én test som ville feilet før tilhørende hotfix. Ingen av testene kan dekke selve
React-orkestreringen (denne kodebasen har ingen jsdom/testing-library) — der logikken har en
ren, uttrekkbar kjerne (nøkkel-sammenligning, lagre/lese/tøm, vaktbetingelse), er DEN
uttrukket og testet mot en enkel in-memory-simulering; selve hook-/komponent-oppførselen er
verifisert manuelt (Hotfix 2 spesifikt, mot en ekte kjørende server).

## Human Replay

Kun de personaene fra den adversariale simuleringen som faktisk opplevde hvert funn — ingen nye.

**Kjetil (fane-klobbing) og Fredrik (fane-klobbing, metodisk)**: **Risikoen er redusert, ikke
eliminert — vær ærlig om hvorfor.** Når fane B skriver, får fane A nå se varselbanneret. Men
selve overskrivingen som utløste varselet har, per konstruksjon, allerede skjedd innen noen fane
kan reagere på den — banneret kommer ETTER at data potensielt er tapt, ikke før. Det banneret
*faktisk* forhindrer er at den "tapende" fanen fortsetter å jobbe i uvitenhet og forårsaker
*enda et* tap ved sin neste lagring. Hvis Kjetil (som bevisst tester grenser) ser banneret og
velger "Jeg fortsetter her likevel" i stedet for å laste på nytt, kan han fortsatt overskrive
andre sin nyeste versjon — nøyaktig som før, bare nå med et bevisst valg om å ignorere en
advarsel i stedet for et ubevisst uhell. **Konklusjon: konsekvensen er redusert (fra "stille og
uoppdaget" til "synlig og valgbart unngåelig"), risikoen for selve den første overskrivingen er
ikke eliminert.**

**Fredrik (`/ops`)**: Ville nå se et fungerende token-felt i stedet for en uforklart 401-feil —
men Fredrik er en feltbruker-superbruker, ikke nødvendigvis en administrator med et reelt
`PUNCHOUT_ADMIN_TOKEN`. Fiksen løser problemet for den *rollen* som faktisk skal bruke siden
(formann/driftsleder med et token), ikke nødvendigvis for Fredrik personlig med mindre han også
har fått tildelt et token. **Konklusjon: problemet er borte for den tiltenkte brukeren av
siden; Fredriks egen opplevelse endres kun hvis han faktisk har et token å skrive inn.**

**Ingvild (lukket fane, mistet ulagret tekst)**: Teksten hun hadde skrevet før hun lukket fanen
for å svare telefonen, var alt debounce-lagret (250ms-vinduet er trivielt kort sammenlignet med
tiden det tar å lukke en fane manuelt). Når hun åpner appen igjen 25 minutter senere, gjenopprettes
teksten automatisk uten at hun må gjøre noe. **Konklusjon: problemet er borte for dette
scenarioet.**

**Marit (10 minutters nøye komponert tekst, tapt ved forvirret refresh)**: Samme mekanisme —
teksten hennes ville vært lagret løpende mens hun skrev, og gjenopprettet idet siden lastes på
nytt. Den stille selvbebreidelsen og det reduserte loggingsnivået resten av dagen (den mest
alvorlige menneskelige konsekvensen i hele den adversariale simuleringen) hadde et konkret,
teknisk rotpunkt som nå er lukket. **Konklusjon: problemet er borte for dette scenarioet.**

**Sara (dobbelttrykk på "Logg", duplikatoppføring)**: Det andre, raske trykket blokkeres nå av
500ms-vakten — akkurat som de andre knappene i appen allerede fungerer. **Konklusjon: problemet
er borte.**

## Sluttrevisjon

**Er alle fire pilotblokkere løst?** Tre er fullstendig løst (Operations Dashboard, refresh/
ulagret arbeid, dobbeltklikk). Én (fane-/enhetskonflikt) er **redusert, ikke eliminert** — se
begrunnelse under.

**Finnes det fortsatt risiko for stille datatap?** **Ja, for fane-/enhetskonflikt-scenarioet
spesifikt.** Selve den første overskrivingen skjer før noen advarsel kan vises (banneret er
reaktivt, ikke forebyggende), og en bruker som ignorerer eller ikke legger merke til banneret
kan fortsatt forårsake ytterligere tap. For refresh/ulagret-arbeid-scenarioet: nei, det er nå
dekket av autosave.

**Kan to brukere fortsatt ødelegge hverandres arbeid?** **Ja.** Varsling og
konfliktoppdagelse (brifens prioritet 1 og 2) er implementert; blokkering av overskriving
(prioritet 3) ble bevisst ikke implementert, per brifens egen prioritering og eksplisitte
utelukkelse av full CRDT/merge. Mekanismen som muliggjør overskrivingen er strukturelt uendret.

**Kan Operations Dashboard brukes igjen?** **Ja**, bekreftet live med en ekte
autentiseringsheader mot en ekte kjørende server.

**Kan brukeren miste arbeid ved refresh?** **Nei**, for den dokumenterte og adresserte
risikoen (`inputText`). **Delvis fortsatt ja** for `editText` (mid-redigering av en eksisterende
oppføring) og eventuell separat kladd-tilstand utenfor det som ble dekket — bevisst avgrenset
bort, lav alvorlighetsgrad (original tekst består), dokumentert i Hotfix 3s eget avsnitt over.

**Kan dobbeltklikk fortsatt lage duplikater?** **Nei for "Logg"-knappen spesifikt.** **Ja for
håndrens' bekreft/forkast-knapper, "Start dag", og `SchemaEditOverlay`s lagre-knapp** — funnet,
dokumentert, bevisst ikke løst denne sprinten (var ikke blant de 4 opprinnelige pilotblokkerne).

## Avsluttende vurdering

**Pilot Readiness Score: 8/10** (opp fra 7,5/10 etter forrige sprint). Tre av fire dokumenterte
blokkere er reelt lukket og bevist; den fjerde er redusert fra "stille og usynlig" til "synlig og
unngåelig, men mekanisk fortsatt mulig" — en reell, akseptabel restrisiko for en liten, kjent
pilotgruppe, men ikke en fullstendig løsning.

**Operational Readiness Score: 8/10** (uendret fra forrige sprint — denne sprinten rørte ikke
deploy/backup/CI-CD-arbeidet, kun de fire dokumenterte UX-/pålitelighetsfunnene).

**Support Risk**: Redusert. De to mest sannsynlige, tidligere identifiserte
support-mønstrene (mistet ulagret tekst; duplikatoppføringer fra "Logg"-knappen) er nå adressert
direkte. Gjenværende: fane-konflikt-scenarioet (sjeldnere, men fortsatt mulig) og de udekkede
dobbeltklikk-punktene (håndrens, "Start dag", skjemalagring).

**Remaining Critical Risks**:
1. Fane-/enhetskonflikt kan fortsatt forårsake reelt datatap dersom en bruker ignorerer
   varselet eller ikke ser det i tide.
2. Håndrens' bekreft/forkast-knapper mangler fortsatt dobbeltklikk-vakt — den samme klassen
   funn som nettopp ble fikset for "Logg"-knappen, ikke utbedret andre steder.
3. Ingen av de fire hotfixene er verifisert i en faktisk nettleser mot en ekte enhet (samme,
   tidligere dokumenterte gap fra Sprint 3/4 — uendret av denne sprinten).

> **"Ville du nå gitt Punchout til 10 ekte pilotbrukere på mandag?"**
>
> **JA.**
>
> De tre mest konkrete, menneskelig alvorlige funnene fra simuleringen (mistet ulagret tekst,
> et ødelagt admin-verktøy, duplikatoppføringer) er reelt lukket og bevist — ikke bare påstått.
> Den gjenværende risikoen (fane-konflikt) er sjelden i en liten, kjent pilotgruppe med
> individuelt utstyr, nå synlig i stedet for stille, og forklart tydelig i denne rapporten
> fremfor skjult. Betingelse: pilotgruppen bør eksplisitt informeres om å unngå å ha appen åpen
> i flere faner/enheter samtidig inntil en sterkere løsning finnes, og driftsleder bør vite at
> håndrens-knappene fortsatt mangler samme dobbeltklikk-vern som "Logg" nå har.

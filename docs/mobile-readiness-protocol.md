# Mobile Readiness Protocol (Oppgave 8)

**Status: forberedt, ikke utført.** Ingen fysiske enheter tilgjengelig i dette miljøet. Skrevet for et menneske å kjøre senere — ikke gjettet, bygget på det som faktisk finnes i koden i dag (`motor.js`s outbox/telemetri-mekanisme, CSS-nivå safe-area/touch-target-fikser fra tidligere faser).

## Forutsetning

Én Android-telefon, én iPhone. Samme nåbare URL som Browser-protokollen (`docs/browser-readiness-protocol.md`).

## Testsekvens — kjør identisk på begge plattformer

1. **Installasjon / "Legg til på Hjem-skjerm"** (appen er ikke en ekte PWA i dag — ingen manifest/service worker finnes; test faktisk hvordan den oppfører seg som en vanlig bokmerket nettside). Forventet: fungerer som en normal mobilnettside; dokumenter eventuell forvirring dette skaper.
2. **Touch targets.** Gjennom hele en arbeidsdag (start → registrering → skjema → håndrens → lås): er noen knapper for små til å treffe pålitelig med en tommel? Tidligere faser hevder 44px minimum er satt — bekreft dette faktisk oppleves riktig, ikke bare at CSS-klassen finnes.
3. **Tastatur.** Åpne et tekstfelt. Forventet: mobiltastaturet dekker ikke feltet som redigeres; iOS zoomer ikke uventet inn ved fokus (en tidligere fase fikset dette — bekreft det faktisk holder).
4. **Scroll.** Lange lister (håndrens med mange poster, skjema med mange felt) — scroller jevnt, ingen elementer sitter fast bak faste topp-/bunnlinjer.
5. **Safe areas.** På en enhet med hakk/home-indikator (nyere iPhone): bekreft faste bunnknapper ikke overlapper home-indikatoren.
6. **Skjermrotasjon** midt i et skjema. Forventet: ingen tapt tilstand, layout tilpasser seg eller låses fornuftig til portrett.
7. **App i bakgrunn i 2+ minutter, midt i en dag**, gjenoppta. Forventet: tilstand er der den var, ingen uventet utlogging/reset.
8. **Fly-modus midt i en eksport** (lås dagen, aktiver fly-modus umiddelbart etter). Forventet: eksport går til `failed`-status i outbox, ingen krasj. Deaktiver fly-modus. Forventet: eksport sendes automatisk innen sekunder — dette er nøyaktig oppførselen `lib/backend/offline-robustness.mjs` allerede har bevist i en simulert vm-sandbox; denne testen bekrefter det samme skjer i en EKTE mobilnettleser, som er en reelt annerledes kjøretidsmiljø.
9. **Dårlig dekning** (ikke fullstendig fly-modus — simuler treg/ustabil tilkobling om mulig via nettleser-devtools-lignende verktøy på enheten, eller fysisk et sted med dårlig dekning). Forventet: ingen fastlåsing av UI mens en forespørsel henger.
10. **Refresh** midt i en økt. Samme forventning som Browser-protokollens steg 5/8.
11. **Eksport, ende-til-ende**, bekreft i `/ops` at den faktisk ankom backend.

## Hva som skal dokumenteres

Samme kategorier som Browser-protokollen (konsollfeil er vanskeligere å se på mobil — bruk ekstern feilsporing hvis tilgjengelig, eller USB-debugging/Safari Web Inspector for iOS), pluss spesifikt for mobil: touch-responsivitet, tastaturoppførsel, batteri-/ytelsesinntrykk over en hel simulert arbeidsdag.

## Godkjenningskriterier

**Godkjent** hvis: full arbeidsdag fullføres på begge plattformer uten tapt data, fly-modus-scenarioet (steg 8) gjenoppretter korrekt, ingen touch-mål oppleves som upraktisk små.

**Ikke godkjent** hvis: data tapes ved bakgrunn/gjenopptak, eksport ikke gjenopptar automatisk etter fly-modus, eller appen låser seg ved dårlig dekning.

## Merk

Steg 8 er den mest verdifulle enkeltsjekken i denne protokollen: den er den ENESTE måten å bekrefte at reconnect-fiksen fra en tidligere fase (motor.js sin `window.addEventListener("online", ...)`-håndtering) faktisk fyrer korrekt i en ekte mobil nettleser — mobile nettlesere har historisk hatt inkonsekvent støtte for `online`/`offline`-hendelser sammenlignet med desktop, noe som ALDRI er verifisert i dette engasjementet fordi det krever en ekte enhet.

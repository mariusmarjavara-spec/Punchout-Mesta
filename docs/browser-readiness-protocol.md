# Browser Readiness Protocol (Oppgave 7)

**Status: forberedt, ikke utført.** Dette miljøet har ingen nettleser-automatiseringsverktøy (bekreftet via verktøysøk før noe testarbeid startet i denne sprinten). Denne protokollen er skrevet slik at et menneske kan kjøre den manuelt, senere, uten å måtte finne opp testsekvensen selv.

## Forutsetning før kjøring

En reell, nåbar URL — enten fra det faktiske deployet (`docs/deployment-decision.md`), eller en tunnel (Cloudflare Tunnel/ngrok) mot en lokal `next dev`. IKKE test kun mot `localhost` hvis målet er å simulere reelle nettverksforhold.

## Nettlesere

Chrome, Edge, Firefox — obligatorisk. Safari — hvis en Mac er tilgjengelig, ellers dokumenter eksplisitt at den ble utelatt (ikke lat som den ble testet).

## Testsekvens (kjør identisk i hver nettleser)

1. **Åpne appen kaldt.** Forventet: siden laster, ingen konsollfeil ved førstegangslasting.
2. **Start dag.** Forventet: `appState` går til `ACTIVE`, UI reflekterer dette umiddelbart.
3. **Registrering (tale eller tekst).** Forventet: oppføringen vises i loggen uten forsinkelse.
4. **Utløs et skjema** (f.eks. en hendelse som krever RUH). Forventet: Prompt Queue viser kravet, `SchemaEditOverlay` åpnes og felt kan fylles og lagres — dette var en reell produksjonsbug i en tidligere fase (`setSchemaField` var aldri eksponert), aldri visuelt bekreftet siden. **Denne enkeltsjekken er den viktigste i hele protokollen.**
5. **Refresh midt i skjemautfylling.** Forventet: ufullstendig skjema-tilstand overlever refresh (ikke tapt), ingen krasj.
6. **Håndrens.** Forventet: uløste poster vises flatt, kan bekreftes/avvises, ingen henging.
7. **Lås dag.** Forventet: `appState` går til `LOCKED`, eksport utløses.
8. **Refresh etter lås.** Forventet: låst tilstand vises korrekt, ingen mulighet til å "gjenåpne" dagen utilsiktet.
9. **Sjekk Runtime-synk**: bekreft riktig organisasjons skjemaer/regler faktisk lastes (ikke Mesta-standarder for en annen org).
10. **Sjekk telemetri**: åpne `/ops`, søk opp organisasjonen, bekreft hendelser fra denne økten vises.

## Hva som skal dokumenteres for hvert steg, i hver nettleser

- Konsollfeil (kopiert ordrett, ikke omskrevet)
- Rendering-feil (layout brutt, elementer som mangler)
- State-feil (UI viser noe som ikke matcher faktisk `dayLog`)
- Fokusproblemer (tastaturnavigasjon, inputfelt som mister fokus uventet)
- Refresh-problemer (noe som IKKE overlever refresh, men burde)
- Race conditions (to raske klikk gir uventet resultat)

## Godkjenningskriterier

**Godkjent** hvis: alle 10 steg fullføres i alle testede nettlesere med null konsollfeil og null state-feil. Mindre visuelle avvik (font-rendering, ikke-blokkerende layoutforskjeller) er akseptable og skal noteres, ikke blokkere godkjenning.

**Ikke godkjent** hvis: steg 4 (skjemalagring) feiler i noen nettleser, eller et krasj/hvit skjerm oppstår i noen nettleser, eller data tapes ved en refresh som burde bevare den.

## Etter kjøring

Resultatet skal dokumenteres som en konkret funnliste (bestått/ikke bestått per steg per nettleser), ikke et generelt "det virket stort sett." Funn som er reelle bugs følger samme "stopp, fiks, verifiser, kjør regresjon"-disiplin som resten av dette engasjementet.

# Pilot Operations (Oppgave 9)

Intern driftsdokumentasjon for teamet som drifter Punchout under en pilot. Alt her refererer til verktøy og endepunkter som faktisk finnes i koden i dag — ingenting er hypotetisk.

## Daily Checklist

Hva sjekkes hver morgen, av én navngitt person, før arbeidsdagen starter:

1. `GET /api/health` — bekreft `status: "ok"` og `persistence.lastWriteOk: true`. Hvis `lastWriteOk` er `false`: se Incident Checklist, "Runtime feiler / persistens-feil."
2. `GET /api/health` — sjekk `registeredDevices` mot forventet antall aktive pilotenheter. Et avvik (færre aktive enn forventet) kan bety en enhet ble deaktivert utilsiktet — sjekk `GET /api/devices/audit` for hvem som gjorde det og når.
3. Åpne `/ops`, slå opp pilotorganisasjonen. Bekreft `exportHealth.successRate` ikke har falt siden i går.
4. Bekreft ingen unormalt høyt antall feilede eksporter siden forrige sjekk (`exportHealth.failed`).

Tidsbruk: under 5 minutter. Hvis noe avviker, gå til Incident Checklist.

## Incident Checklist

### Eksport stopper

1. `GET /api/health` — er `persistence.lastWriteOk` fortsatt `true`? Hvis ikke, dette er en persistens-hendelse, ikke en eksport-hendelse — se under.
2. Sjekk `/ops` for organisasjonen — er `exportHealth.failed` økende?
3. Kjør `node lib/backend/smoke-test.mjs <produksjons-URL>` med et gyldig `PUNCHOUT_ADMIN_TOKEN` — bekrefter om HELE eksportkjeden (ikke bare én brukers enhet) er brutt.
4. Hvis smoke-testen feiler på Eksport-steget spesifikt: sjekk om `/api/export` selv svarer (`curl -I <URL>/api/export`). Server nede, eller kun eksport-logikken?
5. Hvis kun én brukers enhet er berørt: sjekk `GET /api/devices/register` (med admin-token) for den enhetens status — er den utilsiktet `disabled`? Reaktiver via `POST /api/devices/reactivate` om nødvendig.
6. motor.js sin egen outbox har innebygd retry med backoff — en enkeltstående, kortvarig feil trenger ofte ingen handling, den løser seg selv innen timer. Eskaler kun hvis feilen vedvarer eller er systemomfattende.

### Runtime feiler

1. Kjør `node lib/backend/smoke-test.mjs` — Runtime Publish/Activate/Rollback-stegene bekrefter om Runtime-laget fungerer.
2. Hvis en nylig publisering er mistenkt årsak: `POST /api/runtime/rollback` til forrige kjente gode versjon (hent versjonsnummer fra `GET /api/runtime/history?org=<org>`, admin-gated).
3. Rollback er bevist trygt og gjentatte ganger testet i dette prosjektet — ikke nøl med å bruke det ved usikkerhet.

### Telemetri stopper

1. Lavest alvorlighetsgrad av de fire — telemetri påvirker aldri en brukers evne til å registrere eller eksportere (side-kanal, samme design som outbox).
2. Sjekk `GET /api/health` sin `telemetryQueue.totalReceived` — øker den fortsatt over tid for aktive organisasjoner?
3. Hvis ikke: sannsynlig årsak er `ADMIN_CONFIG.telemetryEndpoint` feil konfigurert på klientsiden, ikke en backend-feil. Ingen umiddelbar brukerpåvirkning; fiks når det passer.

### Enhet mistes

1. `POST /api/devices/revoke` med den mistede enhetens `deviceId` UMIDDELBART — dette er den eneste tidskritiske handlingen i denne listen, siden en aktiv enhets HMAC-hemmelighet forblir gyldig helt til den eksplisitt deaktiveres.
2. Bekreft i `GET /api/devices/audit` at revokeringen ble registrert.
3. Hvis enheten dukker opp igjen (funnet, ikke stjålet): `POST /api/devices/reactivate`.
4. Hvis enheten er varig tapt/kompromittert: registrer en NY enhet til brukeren (`POST /api/devices/register`) i stedet for å reaktivere den gamle.

## Backup Checklist

**Hva tas backup av:** én fil — persistensfilen (`PUNCHOUT_DATA_DIR/backend-state.json`). Den inneholder ALT server-side tilstand: Runtime-historikk for alle organisasjoner, eksportlogg, telemetrilogg, enhetsregister (inkludert enhetshemmeligheter — behandle backup-filen med samme sensitivitet som selve produksjonsmiljøet).

**Hvor ofte:** daglig, manuelt, av én navngitt person, for varigheten av en liten pilot. (Automatisert, planlagt backup-infrastruktur ble bevisst vurdert og avvist for denne fasen — byggekostnaden er høyere enn verdien for en 4-ukers pilot av denne størrelsen; revurder hvis pilotens varighet eller antall organisasjoner øker.)

**Hvordan:** kopier filen til et separat, sikkert lagringssted (ikke samme disk/volum som produksjonsserveren). Én kommando, kan kjøres manuelt hver morgen som del av Daily Checklist eller rett før.

**Hvordan testes backup:** minst én gang før pilot starter — gjenopprett en kopiert backup-fil til en TOM `PUNCHOUT_DATA_DIR` på en separat testinstans, start serveren, og bekreft `GET /api/health` viser korrekte enhets-/kø-tall og `GET /api/runtime/history` (med admin-token) viser forventet historikk. En backup som aldri er gjenopprettet er ikke en verifisert backup.

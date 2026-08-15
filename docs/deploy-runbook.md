# Deploy Runbook

Execution Sprint 4, Oppgave 7. Written to be followed by a new developer with no prior context
on this project. Every command below was either actually run this sprint (marked **✅ kjørt**)
or is the documented next manual step for someone with real infrastructure access this sprint
didn't have (marked **⏳ ikke utført her**). See `docs/deployment-decision.md` for why Fly.io/
Railway was chosen over serverless, and `docs/post-sprint-3-strategic-review.md` /
`docs/execution-sprint-4-report.md` for the full context behind why this document exists.

## 1. Første deploy

**⏳ Ikke utført her** — krever en reell Fly.io-/Railway-konto og kredensialer som ikke finnes i
dette miljøet. Prosedyre for en person med tilgang:

```bash
# Én gang, ved førstegangs oppsett:
fly launch --no-deploy                          # opprett appen, ikke deploy ennå — juster app-navnet i fly.toml først
fly volumes create punchout_data --size 1 --region <nærmeste region>
fly secrets set PUNCHOUT_ADMIN_TOKEN=$(openssl rand -hex 32)   # generer en ekte, tilfeldig hemmelighet — aldri gjenbruk et testtoken

# Hvert deploy:
fly deploy
```

**✅ Kjørt og bekreftet denne sprinten** (grunnlaget `fly deploy` faktisk bygger på):
- `npm run build` lykkes i et miljø med internettilgang (se `docs/deployment-decision.md`s
  oppdatering — den tidligere "aldri bekreftet"-påstanden var miljøspesifikk).
- Den ferdige `.next/standalone`-bunten (produsert av `output: "standalone"` i
  `next.config.mjs`) faktisk serverer appen: `node .next/standalone/server.js` med
  `.next/static`, `public/`, og `organizations/` kopiert inn (nøyaktig som `Dockerfile` gjør)
  svarte `200` på `/`, `/api/health`, og `/motor.js`.
- `Dockerfile`s `COPY`-mål er derfor bevist riktige — men `docker build` selv er **ikke** kjørt
  (Docker er ikke installert i dette miljøet). Første reelle `docker build`/`fly deploy` bør
  behandles som et reelt, uverifisert steg, ikke en formalitet.

**Rett etter første (og hvert påfølgende) deploy**: kjør
`node lib/backend/smoke-test.mjs <produksjons-URL>` med et gyldig admin-token — bekrefter hele
kjeden (eksport, Runtime, telemetri) fungerer mot den faktiske, kjørende instansen.

## 2. Onboarde en ny organisasjon

Denne pipelinen finnes og fungerer i dag, men var **udokumentert** før Sprint 4/Oppgave 7 — teknisk
mulig via API siden Phase A, aldri skrevet ned som en prosedyre. **✅ Faktisk kjørt og bekreftet**
(mot `mesta`, og senere fra bunnen mot en helt ny organisasjon, `gronnvik`, i RC1/den fulle
End-to-End Acceptance Test).

> **⚠️ Viktig, funnet under RC1 (F4/F5): denne prosedyren fungerer KUN mot `next start`/`next dev`
> kjørt direkte fra kildekoden — IKKE mot en Docker/Fly.io-deployert instans uten et ekstra steg.**
>
> `.next/standalone/organizations/` er et **byggetids-øyeblikksbilde** — Next.js' file tracing
> kopierer `organizations/`-mappen inn i `.next/standalone` ved `next build`, ikke ved
> kjøretid (`lib/organization-package/loader.mjs` leser org-pakker med `fs.readFileSync`, en
> dynamisk fil-lesing Next.js sin bundler ikke kan spore inn avhengigheter fra på forhånd, så
> tracing tar med hele mappen som den så ut ved siste bygg). Bekreftet direkte: å legge en ny
> org-pakke i kildekoden og kalle `/api/runtime/compile` mot en `.next/standalone`-server bygget
> *før* pakken ble lagt til, feiler med `"missing required file runtime.json"` — selv om filen
> fysisk finnes i `organizations/<slug>/` i kildekoden. Etter en ny `next build` (steg 1
> over, pluss et nytt `docker build`/`fly deploy` i produksjon), fungerer prosedyren under
> nøyaktig som beskrevet.
>
> **Derfor, ved en Docker/Fly.io-deployert instans**: legg til org-pakken i kildekoden (steg 1
> under), **bygg og redeploy applikasjonen på nytt (§1) FØR** du kaller `/api/runtime/compile` —
> ikke bare `git push`/lagre filene og forvente at en kjørende produksjonsinstans plukker dem opp.
> Dette er ikke en databaseendring (ingen `PUNCHOUT_DATA_DIR`-tilstand berøres), men det er heller
> ikke en ren kjøretidsoperasjon slik teksten under isolert sett kan lese som.
>
> Vurdert og bevisst IKKE løst ved å endre deploy-flyten i stedet (f.eks. montere
> `organizations/` som et eksternt volum, slik `PUNCHOUT_DATA_DIR` allerede er): det ville krevd
> å endre `next.config.mjs`s fil-sporing, `Dockerfile`, og `fly.toml` samtidig — reell
> infrastrukturrisiko som ikke kan verifiseres uten en ekte Fly.io-konto, for å løse noe en
> ren dokumentasjonspresisering løser like godt med null kjøretidsrisiko. Se
> `docs/end-to-end-acceptance-test.md` (RC1-03) for den fulle avveiningen.

```bash
# 1. Legg org-pakken i organizations/<slug>/ (knowledge_graph.json, schemas.json, prompts.json,
#    aliases.json, validation.json, corrections.json — se en eksisterende org-mappe som mal).
#    Ved Docker/Fly.io: bygg og redeploy applikasjonen (§1) FØR du fortsetter til steg 2 under.

# 2. Kompiler og valider (rører ingenting live ennå):
curl -X POST $URL/api/runtime/compile \
  -H "Authorization: Bearer $PUNCHOUT_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"organizationSlug":"<slug>"}'
# -> {"ok":true,"stage":"validate","checksum":"...","runtimeVersion":1,"organizationId":"<slug>"}

# 3. Dry run — kjører hele arbeidsdag-scenarioet mot ekte motor.js i vm-sandkasse:
curl -X POST $URL/api/runtime/dry-run \
  -H "Authorization: Bearer $PUNCHOUT_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"organizationSlug":"<slug>"}'
# -> {"ok":true,"stage":"complete",...}  — MÅ være ok:true før publish

# 4. Publiser (blir umiddelbart synlig for feltenheter via GET /api/runtime/active):
curl -X POST $URL/api/runtime/publish \
  -H "Authorization: Bearer $PUNCHOUT_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"organizationSlug":"<slug>","publishedBy":"<ditt navn>","approved":true}'

# 5. Registrer hver pilotenhet for organisasjonen — organizationId er PÅKREVD
#    (Operation Punchout Soft Launch, Phase B: dette er den eneste plassen en
#    enhets organisasjon noensinne fastsettes — alt nedstrøms, inkludert
#    hvilken Runtime enheten faktisk mottar, stoler på denne, aldri på noe
#    enheten selv hevder):
curl -X POST $URL/api/devices/register \
  -H "Authorization: Bearer $PUNCHOUT_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"deviceId":"<enhets-id>","organizationId":"<slug>","registeredBy":"<ditt navn>"}'
# -> secret vises KUN i dette svaret — lagre det, sammen med deviceId, til steg 6

# 6. Sett opp den fysiske enheten — ÉN gang, gjort AV en administrator/IT-ansvarlig
#    PÅ selve enheten, ALDRI av arbeideren selv, FØR arbeideren tar den i bruk:
#    Åpne $URL/provision i enhetens nettleser, lim inn deviceId og secret fra
#    steg 5. Dette setter to httpOnly cookies enheten deretter sender med
#    hver forespørsel: punchout_org_id (organisasjonstilhørighet) og
#    punchout_device_session (Founder-beslutning 2026-08-14, se under —
#    den faktiske autorisasjonen for å hente hele den kompilerte Runtime-en).
#    app/layout.tsx leser begge server-side og server-rendrer den ekte,
#    publiserte Runtime-en for RIKTIG organisasjon FØR motor.js kjører
#    (erstatter det statiske public/punchout-config.js kun for denne
#    enheten; en ikke-oppsatt enhet fortsetter å bruke det statiske
#    fallback-konfiget akkurat som før — ingen regresjon).
#    Verifisert med ekte HTTP mot en ekte server, inkludert at to enheter for
#    to ulike organisasjoner aldri ser hverandres data:
#    node lib/regression/runtime-provisioning.mjs (kjøres også i CI).
```

Registrering (steg 5) har ingen UI ennå — kun API, kjørt av en administrator med
`PUNCHOUT_ADMIN_TOKEN`. Enhetsoppsett (steg 6) har en minimal UI (`/provision`) siden det er
den ene enkeltdelen en fysisk person faktisk må gjøre PÅ enheten selv. Vurder et fullt
admin-UI for steg 1-5 hvis antall organisasjoner vokser forbi et par håndfuller.

**Viktig presisering (Phase B, funnet ved å faktisk lese `app/layout.tsx` og hente
rot-siden over ekte HTTP — ikke antatt fra API-lagets egen oppførsel alene): en enhet som
ALDRI har gjennomført steg 6 fungerer fortsatt, men mottar det statiske, organisasjons-agnostiske
`public/punchout-config.js`-fallback-konfiget — IKKE den organisasjonens faktiske publiserte
Runtime, uansett hvor mange ganger steg 2-4 er kjørt for den organisasjonen. Steg 6 er derfor
ikke valgfritt for en reell pilotenhet, kun for en ren demo-/standardøkt.**

**Oppdatert presisering (Founder-beslutning 2026-08-14, "runtime confidentiality
boundary" — po-runtime-active-authorization-boundary): `GET /api/runtime/active` krever nå en
gyldig `punchout_device_session`-cookie for å returnere hele den kompilerte Runtime-en (regler,
skjemaer, ordre, maskiner, kunnskapsgraf — konfidensiell driftskonfigurasjon). Uten en gyldig
sesjon (aldri provisjonert, eller enheten er deaktivert av en administrator siden sist) svarer
ruten fortsatt `200`, men KUN med minimal, ikke-sensitiv bootstrap-/versjonsmetadata
(`organizationId`, `runtimeVersion`, `compiledAt`, `checksum`) — samme praktiske utfall som over:
enheten faller tilbake til det statiske konfiget, ikke organisasjonens faktiske Runtime.
Deaktivering av en enhet (`POST /api/devices/revoke`) ugyldiggjør derfor en eksisterende
provisjonert enhets sesjon umiddelbart, uten at cookien selv fjernes fysisk fra enheten — neste
sideinnlasting faller tilbake til fallback-konfiget automatisk.**

## 3. Backup

Se `docs/pilot-operations.md`s "Backup Checklist" for den løpende, daglige prosedyren (én fil,
manuell kopi, én navngitt person). **✅ Restore-siden er nå faktisk bevist**, ikke bare anbefalt
— se `docs/execution-sprint-4-report.md` Oppgave 4 for den fullstendige, manuelt kjørte øvelsen,
og `lib/regression/backup-restore-drill.mjs` for den permanente, automatiserte versjonen (kjøres
av `npm test`).

## 4. Restore (etter datatap)

```bash
# 1. Stopp instansen (om den fortsatt kjører).
# 2. Kopier siste backup-fil til $PUNCHOUT_DATA_DIR/backend-state.json.
# 3. Start instansen på nytt.
# 4. Bekreft: GET /api/health (enhets-/kø-tall ser fornuftige ut) og
#    GET /api/runtime/history?org=<org> med admin-token (forventet historikk er tilbake).
```

Målt lokalt denne sprinten (se full drill i sluttrapporten): oppstart tar konsistent ~1,5–1,7
sekunder uansett scenario — RTO domineres av menneskelig responstid (hvor fort noen oppdager
problemet og utfører stegene over), ikke av mekanismen selv.

## 5. Rollback (dårlig Runtime-publisering)

Allerede dokumentert og bevist i `docs/pilot-operations.md`s Incident Checklist ("Runtime
feiler") — gjentatt her for synlighet:

```bash
curl -X POST $URL/api/runtime/rollback \
  -H "Authorization: Bearer $PUNCHOUT_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"organizationId":"<org>","toVersion":<forrige kjente gode versjon>}'
```

For en dårlig **kode**-utrulling (ikke Runtime-data): re-deploy forrige Docker-image
(`fly deploy --image <tidligere image-referanse>`, eller tilsvarende i Railway) — ⏳ ikke
utført/verifisert her, krever reell deploy-historie.

## 6. Produksjonsfeil / support / incident response

`docs/pilot-operations.md`s Daily Checklist og Incident Checklist (Eksport stopper / Runtime
feiler / Telemetri stopper / Enhet mistes) dekker dette allerede og er ikke duplisert her.
Denne sprintens tillegg til den flyten: `lib/observability/request-log.mjs` gir nå strukturerte
JSON-loggrader (metode, sti, status, varighet) for alle admin-autentiserte ruter — søk etter
`"level":"error"` eller `"level":"warn"` i serverloggene (Fly.io/Railway fanger stdout
automatisk) som et første steg ved en mistenkt admin-handlingsfeil.

**Kjent gjenværende gap** (se sluttrapporten for full begrunnelse): ingen ekte
feil-/krasjsporing (Sentry e.l.) og ingen ekstern oppetidsovervåkning finnes — begge krever en
tredjepartskonto denne sprinten ikke kunne opprette.

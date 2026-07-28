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

Denne pipelinen finnes og fungerer i dag, men var **udokumentert** før denne sprinten — teknisk
mulig via API siden Phase A, aldri skrevet ned som en prosedyre. **✅ Faktisk kjørt og bekreftet
denne sprinten** (mot `mesta`, som en del av Oppgave 4s backup-øvelse):

```bash
# 1. Legg org-pakken i organizations/<slug>/ (knowledge_graph.json, schemas.json, prompts.json,
#    aliases.json, validation.json, corrections.json — se en eksisterende org-mappe som mal).

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

# 5. Registrer hver pilotenhet for organisasjonen:
curl -X POST $URL/api/devices/register \
  -H "Authorization: Bearer $PUNCHOUT_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"deviceId":"<enhets-id>","registeredBy":"<ditt navn>"}'
# -> secret vises KUN i dette svaret — lagre det på enheten nå
```

Ingen UI finnes for dette ennå — kun API. Vurder å bygge et minimalt admin-UI hvis antall
organisasjoner vokser forbi et par håndfuller.

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

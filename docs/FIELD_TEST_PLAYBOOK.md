# Field Test Playbook

**For:** the founder, standing with a phone, about to run the first real
Punchout workday.
**Assumes:** nothing except this repository and the machine it is on.
**Time to first screen on the phone:** about 10 minutes.

If something goes wrong, jump to [§7 Recovery](#7-recovery-during-the-test).
Nothing in that section deletes your field data.

---

## 1. Start Punchout

Two options. **Use option A** unless you specifically want to test the container.

### Option A — production-equivalent standalone server (recommended)

```bash
cd "e:/Claude projects/Punchout - Mesta"

# 1. Build
npm run build

# 2. Assemble the deployable directory (same as the Dockerfile's COPY steps).
#    organizations/ is read with fs.readFileSync, not imported, so Next's
#    tracer does not include it — it must be copied explicitly.
cp -r .next/static .next/standalone/.next/static
cp -r public/. .next/standalone/public/
cp -r organizations/. .next/standalone/organizations/

# 3. Run it
cd .next/standalone
PUNCHOUT_DATA_DIR="e:/punchout-field-data" \
PUNCHOUT_ADMIN_TOKEN="velg-et-langt-tilfeldig-token" \
HOSTNAME=0.0.0.0 \
PORT=3000 \
node server.js
```

**`PUNCHOUT_DATA_DIR` is mandatory** and the server refuses to start without it
in production. That is deliberate: it is where your workdays are stored. Point
it at a real, persistent path — not a temp directory.

**`HOSTNAME=0.0.0.0` is mandatory for phone access.** Without it the server
binds only to localhost and the phone gets connection-refused.

**`PUNCHOUT_ADMIN_TOKEN`** gates every admin surface, including the Relay
inspection page you will use afterwards. The app fails closed if it is unset.

### Option B — Docker

```bash
docker build -t punchout .
docker run --rm -p 3000:3000 \
  -v "e:/punchout-field-data:/data" \
  -e PUNCHOUT_ADMIN_TOKEN="velg-et-langt-tilfeldig-token" \
  punchout
```

`PUNCHOUT_DATA_DIR=/data` and `HOSTNAME=0.0.0.0` are already set in the image.

### Confirm it is up

```bash
curl http://localhost:3000/api/health
```

Expect `"status":"ok"` and a `relay` block. `relay.workdaysHeld` will be `{}`
before the first day arrives — that is correct.

---

## 2. Getting the phone to reach it

Your phone `marius-sin-s25` is already on the Tailscale tailnet, and this
machine is `desktop-a24a2kv.tailc834b8.ts.net` (`100.81.253.30`). Use Tailscale
rather than Wi-Fi — it works from anywhere, including from the vehicle.

### ⚠️ Read this before choosing: voice input requires HTTPS

Browsers block the Web Speech API on insecure origins. Over plain `http://` to
an IP address, **the microphone button will not work** — the app will report
voice as unsupported. Everything else (text entry, schemas, hours, lock,
export) works normally.

This is a browser security rule, not a Punchout limitation, and it cannot be
worked around from inside the app.

| Path | URL on the phone | Voice | Setup |
|---|---|---|---|
| **B1 — Tailscale HTTPS** (recommended if testing voice) | `https://desktop-a24a2kv.tailc834b8.ts.net` | ✅ works | Enable **HTTPS Certificates** in the Tailscale admin console (Settings → Feature previews), then run `tailscale serve --bg 3000` on this machine |
| **B2 — Tailscale plain HTTP** | `http://100.81.253.30:3000` | ❌ blocked | none |
| **B3 — Local Wi-Fi** | `http://192.168.10.175:3000` | ❌ blocked | phone on the same Wi-Fi; Windows Firewall must allow inbound TCP 3000 |

`tailscale serve` changes what this machine exposes on your tailnet. It is
reversible with `tailscale serve --https=443 off`. **This has not been run for
you** — it is your call whether to expose the port.

**For a first test, B2 is enough.** Use text entry, confirm the whole chain
works, and add HTTPS on a second pass if you want to exercise voice.

---

## 3. Provision the phone

Three steps: publish the organization's runtime, register the device, then set
the device up from the phone itself.

**On the machine** (register produces a one-time secret):

```bash
TOKEN="velg-et-langt-tilfeldig-token"

# Publish Mesta's runtime
curl -X POST http://localhost:3000/api/runtime/publish \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"organizationSlug":"mesta","publishedBy":"founder","approved":true}'

# Register the phone — copy the "secret" from the response
curl -X POST http://localhost:3000/api/devices/register \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"deviceId":"marius-s25","organizationId":"mesta"}'
```

**On the phone**, open `<your URL>/provision` and fill in:

| Field | Value |
|---|---|
| Enhets-ID | `marius-s25` |
| Hemmelighet | the `secret` from the register response |
| Bruker-ID | `marius` (this becomes the `userId` on every workday you send) |

Press **Sett opp enhet**. You should see Mesta confirmed.

> **The user ID is what attributes the workday to you.** It is stored on the
> phone and asserted to the server — it is not verified by a login, and the
> Relay records it as `userIdVerified: false`. Use a stable value; changing it
> later changes who subsequent days belong to.

Then open the root URL. **Expected first screen:** the start screen, with a
microphone button, a text field, **Start dag**, and Elrapp/Linx links.

To confirm the phone got the real runtime rather than the demo fallback, check
on the machine that the org is `mesta`:

```bash
curl -s http://localhost:3000/api/health | grep -o '"relay":.*'
```

---

## 4. During the workday

Use it as you actually would. Nothing below is required in a fixed order.

**What is safe:**

- **Everything you record is saved on the phone immediately.** You do not need
  coverage to record work.
- **You can lose signal.** The header shows *Lagret lokalt*, and the app says
  so in plain language. Recording continues normally.
- **You can switch apps, take calls, lock the phone.** Returning restores the
  same screen, including a half-filled schema.
- **You can reload the page.** The day, entries, drafts and any open overlay
  come back.
- **You can leave a day open overnight.** Next morning you will be offered
  *Fortsett*, *Avslutt* or *Forkast* — and *Forkast* archives the day rather
  than destroying it.

**What needs coverage:** voice input (and only under HTTPS — see §2), and
sending the day at the end. Sending retries automatically.

**Suggested test script** (covers everything the acceptance run covers):

1. Open Punchout, confirm the org and user look right.
2. **Start dag.**
3. Fill in the SJA. Skip or defer the vehicle check — both are recorded.
4. **Gå til drift.** Confirm the start time.
5. Log ordinary work: *"Sjekket kjøretøy og utstyr før avreise"*.
6. Log a structured order line: *"204481-0014 fra 07:30 til 11:00 brøyting på Fv. 17"* — confirm the parsed order line when it appears.
7. Log an incident: *"Nestenulykke ved påkjøring"*. Note that this produces **two** cards at end of day (a hendelse and an RUH) — that is current behaviour, and known.
8. Correct an entry: tap it, change the text, save.
9. **Switch to another app for a few minutes. Come back.**
10. **Turn on flight mode.** Log more work. Confirm the header says *Lagret lokalt*.
11. **Turn flight mode off.**
12. **Avslutt dag.**
13. Work through Håndrens. For **Hovedtimeføring**, press *+ Legg til lønnskode* — the line arrives pre-filled with your day minus hours already booked on orders. Adjust if needed, then *Bekreft timeark*.
14. **Lås dag.** Read the line above the button before pressing it.
15. Confirm the completion screen shows the export as sent.

---

## 5. Inspecting what arrived

### The Relay page (this is the main one)

Open `<your URL>/relay` — on the phone or on the machine.

Enter `mesta` and your admin token, press **Hent**. You will see one row per
workday:

| Column | What it tells you |
|---|---|
| Dag | the date, the working window, and the export ID |
| Bruker / enhet | who and which phone; flags if the user is unverified |
| Innhold | how many entries, timesheet lines and schemas arrived |
| CSV-status | Mottatt / Klar / Levert / Feilet |

Press **Vis** to see the full stored payload — the exact JSON the phone sent.

### Generate the CSV

Press **Kjør CSV-adapter på alle ventende** (or **CSV** on a single row).

### Where the files are

```
<PUNCHOUT_DATA_DIR>/relay/mesta/<exportId>.json           the workday as delivered
<PUNCHOUT_DATA_DIR>/relay/mesta/<exportId>.delivery.json  delivery state
<PUNCHOUT_DATA_DIR>/adapter-output/csv/mesta/<exportId>/  the CSV files
```

With the example above: `e:/punchout-field-data/adapter-output/csv/mesta/<exportId>/`

### What should be in the CSV

Six files. All are UTF-8 with a BOM and semicolon-separated, so they open
directly in Norwegian Excel with correct columns and correct æ/ø/å.

| File | Contents |
|---|---|
| `summary.csv` | export ID, organization, user, device, day, working window, lock and receive times, runtime version, signature status, record counts |
| `time_entries.csv` | one row per confirmed timesheet line: order, date, from, to, work description |
| `wage_codes.csv` | one row per wage-code line: order, date, code, from, to |
| `entries.csv` | every logged entry: time, type, text |
| `schemas.csv` | confirmed and discarded schemas with their field values |
| `machine_hours.csv` | machine hours per order |
| `quantities.csv` | **only if quantities were recorded.** Nothing produces them yet — an absent file means none were observed, not that any were lost. |

**Check specifically:** your order number appears in `time_entries.csv`; your
work description survived with its Norwegian characters intact; and
`wage_codes.csv` contains the hours you confirmed.

### If you prefer the command line

```bash
TOKEN="velg-et-langt-tilfeldig-token"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/relay?org=mesta"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/relay?org=mesta&exportId=<exportId>"
```

---

## 6. Checking status without DevTools

| Question | Where to look |
|---|---|
| Which org/user is this phone? | `/provision` shows the current setup |
| Is my work saved locally? | The header chip during the day: *Lagret lokalt* means saved, waiting to send |
| Did the day send? | The completion screen after locking |
| Did the server actually receive it? | `/relay` — if the row is there, the server has it |
| Is the server healthy? | `/api/health` — `relay.workdaysHeld` counts workdays in custody |
| Did the CSV generate? | The CSV-status column on `/relay` |

---

## 7. Recovery during the test

**None of these lose your field data. Do not clear browser data as a first
resort — that is the one action that does.**

| Situation | Do this |
|---|---|
| Screen looks stuck | Reload the page. The day, entries and open overlay all come back. |
| Closed the browser | Reopen the URL. The day resumes. |
| Restarted the phone | Reopen the URL. The day resumes. |
| No coverage | Keep working. The header says *Lagret lokalt*. It sends itself later. |
| Export shows failed | Nothing is lost. It retries automatically on an interval, on regaining coverage, and when you bring the tab back to the foreground. |
| Day from yesterday still open | Choose *Fortsett* to continue it, *Avslutt* to close it properly, or *Forkast* to archive it. Forkast keeps confirmed schemas in history. |
| **"Lagringsfeil" appears** | The phone's storage is full or blocked. Punchout already tried to free space by dropping already-sent exports and old history. Choose *Nullstill dagen* only if you accept losing today; otherwise free space on the phone and reload. See the known limitation below. |
| Provisioning failed | Re-register the device on the machine (a new secret) and redo `/provision`. Historical days already in the Relay keep their original attribution. |
| Server restarted | Nothing is lost on either side. Reload the phone; the Relay still holds every workday. |

**Known limitation, stated plainly.** If the phone's storage refuses *every*
write (Safari private mode, or a genuinely full disk with nothing reclaimable),
Punchout shows *Lagringsfeil* and the in-memory day is ahead of what is stored.
Reloading at that point loses the work since the last successful save. Punchout
retries and reclaims space first, and a later successful write clears the error
— but no client-side strategy can write to a disk that refuses every write. If
you see *Lagringsfeil* and it does not clear, finish the day but treat the last
few entries as unsaved.

---

## 8. What to send back to Gateway afterwards

1. Whether you completed the full sequence in §4, and where you stopped if not.
2. The `/relay` row for the day (screenshot is fine).
3. `summary.csv` and `time_entries.csv`.
4. Anything that was unclear **while standing outside with gloves on** — that
   is the part no amount of simulation replaces.
5. Whether voice was tested, and under which option from §2.

---

## Appendix — what has and has not been proven

**Proven** against the real production standalone build, in real Chromium at
iPhone-13 viewport, with a real HMAC-signed export and a genuine server
restart (`node lib/regression/production-acceptance.mjs`, 22/22):

full workday → main hours confirmed → lock → signed export → Relay custody →
CSV artifact → server restart → identical payload read back.

**Not proven, and only your phone can prove it:** real touch and gloves, the
real on-screen keyboard, real Safari/Chrome on Android, real network
transitions, real GPS/battery behaviour, and whether the flow makes sense to
someone standing in the road rather than sitting at a desk.

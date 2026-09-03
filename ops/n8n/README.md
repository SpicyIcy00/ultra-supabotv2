# The morning brief — n8n schedule

Delivers George's brief to Telegram at 06:00 Manila.

Two workflow files, same behaviour:

| file | for |
|---|---|
| `morning-brief-starter.json` | **n8n Starter** — values inlined, secrets in Credentials |
| `morning-brief.json` | Pro/self-hosted — reads instance Variables (`$env`) |

Instance Variables are a Pro feature. On Starter, import the `-starter` file: the
URL and chat id are inlined, and the two secrets live in Credentials, which
Starter does have. Nothing sensitive is in the workflow JSON either way.

Import via Workflows → ⋯ → Import from File.

## Starter: the two credentials

**Header Auth** — name it `George brief token`:
- Name: `Authorization`
- Value: `Bearer <BRIEF_TOKEN>`

Select it in the "Build and send the brief" node (Authentication → Generic
Credential Type → Header Auth).

**Telegram API** — your bot token. Select it in the "Say that it failed" node.

## Environment

Set these on the n8n instance, not in the workflow:

| variable | what |
|---|---|
| `GEORGE_API_BASE` | `https://ultra-supabotv2-production.up.railway.app` |
| `BRIEF_TOKEN` | must match `BRIEF_TOKEN` on the backend |
| `BRIEF_CHAT_IDS` | JSON array, e.g. `["-1001234567890"]` |
| `TELEGRAM_BOT_TOKEN` | same bot, used only by the failure alarm |
| `BRIEF_ALERT_CHAT_ID` | where "the brief did not run" goes |

On the backend set `BRIEF_TOKEN` (any long random string) and `TELEGRAM_BOT_TOKEN`.
Generate a token with `openssl rand -hex 32`.

**Set the workflow timezone to Asia/Manila** — Settings → Timezone. n8n cron runs
in the workflow's timezone and the instance default is UTC, which would fire this
at 14:00 Manila.

## Why the backend renders the message

n8n is a dumb pipe: fetch, post. "Notices always surface" is a product guarantee
(CLAUDE.md UI rule 4), and templating the message in an n8n node would move that
guarantee into a workflow anyone can edit. The first person to tidy the layout
would quietly delete the caveats.

`POST /api/v1/brief/send` builds the brief, renders it, and sends it. Use
`GET /api/v1/brief` to read one without broadcasting — that split exists so you
can inspect tomorrow's brief without waking anyone.

## The failure branch is not optional

**A job that fails silently is indistinguishable from a quiet morning.** Nobody
notices a brief that did not arrive; they notice one that says it broke. The `IF`
node also routes on `ok: false`, which is set when *any* message to *any* chat
failed — a brief split into three that lost the middle one reads as complete,
with items missing and no sign of it.

## Auth

`BRIEF_TOKEN` is a scoped shared secret accepted **only** on the brief endpoints.
The alternative was storing the admin passcode in n8n, which would give a
scheduled job full UI access as an administrator in order to send one read-only
message. A leaked brief token costs the morning brief and nothing else.

If it is unset on the backend, the endpoint returns 503 and refuses — an
unconfigured secret must never mean "no secret required".

## Checking it by hand

```bash
curl -sS -H "Authorization: Bearer $BRIEF_TOKEN" \
  "$GEORGE_API_BASE/api/v1/brief" | jq '.meta.sections, .messages | length'

curl -sS -X POST -H "Authorization: Bearer $BRIEF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"chat_ids":["<your chat id>"]}' \
  "$GEORGE_API_BASE/api/v1/brief/send"
```

`?as_of=2026-09-01` reproduces a past morning, which is the quickest way to see
what the brief looks like on a Monday — the day the naive day-over-day comparison
would have reported a catastrophe.

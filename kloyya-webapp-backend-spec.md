# Kloyya — Web App
## Backend handoff spec

**Scope:** the authenticated product at `app.kloyya.com`. Auth, sessions and billing entitlements are owned by the landing service — see `kloyya-landing-backend-spec.md`.

**Reference prototype:** `Kloyya-prototype.html` — screens `New outcome`, `Plan review`, `Live run`, `Outcome delivered`, `Outcomes`, `Connections`.

---

## 1. The core object

Everything in this product is one thing: an **Outcome**. A user states a desired end state in plain language; Kloyya plans how to get there, reads across connected tools, reasons, and returns an answer plus artifacts. It pauses for human approval before any write.

An outcome moves through a strict state machine. Every screen in the prototype is a view of one of these states:

```
draft → clarifying → planned → running → paused_for_approval → delivered
                                    ↓
                                 blocked / failed / cancelled
```

| State | Screen | Meaning |
|---|---|---|
| `draft` | New outcome | Text captured, nothing planned |
| `clarifying` | New outcome | Kloyya has asked one question back, awaiting answer |
| `planned` | Plan review | Steps generated, editable, not executed |
| `running` | Live run | Executing; emits progress + log |
| `paused_for_approval` | Outcome detail | Stopped at a write step or a mid-run finding |
| `delivered` | Outcome detail | Answer + artifacts + reasoning trail |
| `blocked` | Outcomes | Missing a connection or a permission |
| `failed` / `cancelled` | Outcomes | Terminal |

State transitions must be server-authoritative and logged. The client never sets state directly; it calls an action endpoint and receives the new state.

---

## 2. Data model

```sql
workspaces        (id, name, persona, role, first_outcome, tier, seat_limit,
                   trial_ends_at, free_period_ends_at, created_at)
users             (id, workspace_id, email, name, role, identity_provider,
                   external_id, email_verified_at, created_at)

outcomes          (id, workspace_id, created_by, title, state, persona_context,
                   scope_json, created_at, started_at, delivered_at, duration_ms)
outcome_questions (id, outcome_id, question, options_json, answer, answered_at)
plan_steps        (id, outcome_id, ordinal, title, detail, kind, tool_ids,
                   requires_approval, state, edited_by_user)
runs              (id, outcome_id, state, started_at, finished_at, error)
run_events        (id, run_id, ts, tag, message, level, step_id)     -- the activity log
findings          (id, outcome_id, kind, body, surfaced_at, user_response)
answers           (id, outcome_id, headline, narrative, confidence, stats_json)
answer_rows       (id, outcome_id, ordinal, label, value_json, risk, rationale)
citations         (id, outcome_id, tool_id, source_ref, what_was_read, record_count)
artifacts         (id, outcome_id, kind, name, state, destination, payload_ref, size_label)
approvals         (id, outcome_id, artifact_id, state, decided_by, decided_at)

connections       (id, workspace_id, tool_id, state, scopes_json, granted_by,
                   granted_at, last_sync_at, revoked_at)
connection_scopes (id, connection_id, resource, allowed, meta)       -- e.g. per Slack channel
memory_facts      (id, workspace_id, fact, source_outcome_id, confidence,
                   created_at, retracted_at)
usage_counters    (workspace_id, period_start, runs_used)
audit_log         (id, workspace_id, actor, action, target, meta_json, ts)
```

Notes that matter:

- `plan_steps.kind ∈ read | reason | write | approval`. Only `read` and `reason` execute unattended. `write` always requires an `approvals` row.
- `answers.confidence` is a real field, not decoration. The prototype shows Kloyya explicitly flagging one account as "I genuinely can't tell" — that's a per-row confidence below threshold, surfaced as UI. If the model can't express calibrated uncertainty, this product's central promise doesn't hold.
- `citations` is not optional. Every claim in an answer must resolve to a source the user can open. Build it as a hard constraint: an answer that can't cite doesn't ship to the user.
- `memory_facts` is what makes it feel like a colleague. Facts are workspace-scoped, user-retractable (`retracted_at`), and must be shown in the UI with an Undo. The prototype surfaces "I still remember: paused seats don't count as churn risk — you decided that in the March QBR."
- `run_events.tag` values used in the prototype's log pane: `auth`, `read`, `filter`, `rule`, `signal`, `gap`, `insight`, `notify`, `reason`. Keep them a closed enum; the UI colour-codes them.

---

## 3. API

```
POST   /api/outcomes                      { title, scope? }        → outcome (draft)
POST   /api/outcomes/:id/clarify          { answer }               → outcome (planned)
GET    /api/outcomes/:id/plan                                       → plan_steps[]
PATCH  /api/outcomes/:id/plan             { steps[] }              → plan_steps[]  (user edits)
POST   /api/outcomes/:id/run                                        → run
GET    /api/outcomes/:id/stream                                     → SSE (see §4)
POST   /api/outcomes/:id/pause
POST   /api/outcomes/:id/cancel
POST   /api/outcomes/:id/findings/:fid    { response: 'pivot'|'note' }
GET    /api/outcomes/:id                                            → full detail + answer + citations
POST   /api/outcomes/:id/approve          { artifactIds[] }        → executes writes
GET    /api/outcomes?state=&cursor=                                 → dashboard list
POST   /api/outcomes/:id/transcribe       { audio }                → { text }

GET    /api/connections                                             → connections[]
POST   /api/connections/:toolId/authorize                           → 302 provider
GET    /api/connections/:toolId/callback                            → 302 back to app
PATCH  /api/connections/:toolId/scopes    { resources[] }
DELETE /api/connections/:toolId                                     → revoke + purge (§5)

GET    /api/memory                                                  → memory_facts[]
DELETE /api/memory/:id                                              → retract

GET    /api/impact                                                  → dashboard stat cards
```

Idempotency keys on `POST /run` and `POST /approve` — a double-click must not send an email twice.

---

## 4. Live run transport

Use **SSE** (`GET /api/outcomes/:id/stream`), not WebSockets. Traffic is one-directional, SSE reconnects natively, and it survives proxies. Control actions go over normal POSTs.

Event types:

```
event: step      data: { stepId, state, detail, ts }
event: log       data: { tag, message, level, ts }
event: progress  data: { pct, etaSeconds, elapsedMs }
event: finding   data: { id, kind, body }
event: state     data: { state }
event: done      data: { outcomeId }
```

- Include a monotonic `id:` on every event and honour `Last-Event-ID` so a reconnect replays rather than drops. Users will close the laptop mid-run.
- Runs are long (5–20 minutes; deep digs longer). They must survive the client disconnecting entirely — the run lives in a queue worker, not in the request. On reconnect, replay `run_events` from the database, then attach to the live stream.
- Notify by email and in-app when a run finishes with no client attached.

---

## 5. Connections

Fourteen tools: Slack, Gmail, Google Calendar, Google Drive, Notion, Linear, Jira, GitHub, Figma, Salesforce, HubSpot, Asana, WhatsApp Business, Instagram.

**Read-only by default.** This is a product promise, not a default setting — enforce it:

- Request the narrowest read scope each provider offers at connect time.
- Write scopes are requested **per outcome**, at the approval step, and the grant expires with that outcome. Never a standing write grant.
- `connection_scopes` gives per-resource control. The prototype's Slack detail pane lists individual channels with read counts and an explicit "Never: DMs, private channels you haven't shared, and anything in `#exec-comp`". Model that as an allow-list, plus a hard deny-list the user maintains.
- Store tokens encrypted at rest with a KMS-managed key, per workspace. Refresh proactively.
- A missing connection produces a `gap` log event and an explicit low-confidence flag on any affected answer row — the prototype does exactly this for the Northwind account with no Zendesk access. Silently answering with incomplete data is the single worst failure mode this product has.

**Revocation cascade.** The marketing site promises Kloyya forgets a revoked source "within the hour". `DELETE /api/connections/:toolId` must enqueue a job that:

1. Revokes the token with the provider.
2. Deletes cached raw records from that source.
3. Deletes `citations` rows pointing at it.
4. Retracts `memory_facts` whose `source_outcome_id` derived solely from it.
5. Marks affected delivered outcomes as `sources_revoked` so the UI can say the trail is no longer verifiable.
6. Writes an `audit_log` entry the user can see.

Budget real engineering time for step 4. It's the hard one and it's the one that was promised.

---

## 6. Entitlements

Read tier from the workspace; enforce at run-start, not at outcome creation — users should be able to draft freely.

| Tier | Runs | Connections | Seats |
|---|---|---|---|
| Free | Unlimited for 30 days, then 3 per calendar month, for life | 3 | 1 |
| Starter | Unlimited | 14 | 1 |
| Business | Unlimited + deep digs across a full quarter | 14 | 1 |
| Teams | Unlimited, shared library, team memory | 14 | 10 |
| Enterprise | Custom | 14 + custom | Custom |

`usage_counters` resets on the 1st, UTC. When a Free workspace hits 3, `POST /run` returns `402` with the tier that unblocks it — the client shows an upgrade prompt, it does not fail silently.

Enforce a per-workspace concurrent-run cap and a global queue, or one enthusiastic Teams customer will exhaust your model budget in an afternoon.

---

## 7. Model orchestration

Not prescribing a stack, but these constraints are load-bearing:

- **Clarify before running.** Exactly one question, with concrete options, generated from the outcome text plus workspace persona. If the model has nothing worth asking, skip to `planned` — a pointless question is worse than none.
- **Plan is user-editable and must be honoured.** If a user deletes a step, that step does not run. Track `edited_by_user` so you can measure how often the plan was wrong.
- **The pushback step is a distinct plan step** (`kind: 'reason'`), not a side effect. In the prototype it's step 4: "Find the cause they share, not just the accounts at risk — this is the step you did not ask for." Findings surfaced mid-run write to `findings` and stream as a `finding` event; the user can pivot or note-and-continue.
- **Costs and timeouts:** per-run token budget, hard wall-clock cap, graceful degradation to a partial answer with an explicit gap rather than a failure.
- **Never fabricate a citation.** An uncited claim must be dropped or explicitly labelled as inference.
- **Prompt injection is a live threat here.** You are feeding untrusted third-party content — emails, Slack messages, Instagram DMs — into a model that can propose write actions. Treat all tool content as hostile input. Writes go through the approval gate with the exact final text shown to the user; no tool-content-derived instruction may bypass it.

---

## 8. Multi-tenancy and security

- Every query filtered by `workspace_id`. Use row-level security if your database supports it; do not rely on application discipline alone.
- Tenant isolation for cached tool data. No shared embedding index across workspaces — "nothing trains a shared model" has to be architecturally true, not policy-true.
- Full `audit_log` for connection grants, revocations, approvals, memory retraction, seat changes, and every write action executed.
- Enterprise: SAML/OIDC SSO, SCIM provisioning, exportable audit log, configurable data residency (the marketing site claims UK).

---

## 9. Voice input

The composer accepts typed or spoken input. `POST /api/outcomes/:id/transcribe` takes audio and returns text.

- Server-side transcription via a provider API is preferable to browser `SpeechRecognition` — consistent quality, and it doesn't ship user audio to a browser vendor.
- Never persist the audio after transcription completes.
- The prototype simulates the waveform and progressive transcription. Real streaming partial results are a nice-to-have, not launch-blocking.

---

## 10. Build order

1. Auth + workspace + connections for **three** tools (Slack, Gmail, Salesforce). Prove the read path end to end.
2. Outcome create → clarify → plan. No execution. Ship it internally and check whether the plans are any good — if they aren't, nothing downstream matters.
3. Run engine + SSE + activity log, read-only steps only.
4. Answer + citations + confidence. This is the product. Do not rush it.
5. Approvals and write actions.
6. Memory facts.
7. Remaining eleven connections.
8. Impact dashboard.

Steps 1–4 are the whole bet. Everything after is expansion.

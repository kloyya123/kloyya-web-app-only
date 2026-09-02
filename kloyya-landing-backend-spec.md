# Kloyya — Landing Page & Growth Surface
## Backend handoff spec

**Scope:** everything at `kloyya.com` before authentication, plus signup, plan selection and checkout. The authenticated product is a separate service — see `kloyya-webapp-backend-spec.md`.

**Reference prototype:** `Kloyya-prototype.html` — screens `Landing`, `Sign up`, `Log in`, `Onboarding`, `Choose plan`, `Checkout`, `Welcome`.

**Deploy target:** static-first. The marketing page should be prerendered and CDN-cached; only the forms below need a server.

---

## 1. Why this is a separate service

The landing page is read-mostly, must survive a product outage, and is the only surface indexed by search. Keeping it separate from the app means:

- marketing copy changes don't require an app deploy
- a product incident doesn't take down signup
- the app service never needs a public unauthenticated route except OAuth callbacks

The only shared state is the **identity + billing** boundary in §4 and §6.

---

## 2. Routes

| Route | Rendering | Auth | Notes |
|---|---|---|---|
| `GET /` | Prerendered static | none | Hero, how-it-works, outcome gallery, security, pricing, FAQ |
| `GET /#usecases` `#customers` `#security` `#pricing` `#faq` | anchors on `/` | none | In-page scroll targets; keep the ids stable, they're linked from nav and emails |
| `GET /signup` | SSR or static + JS | none | |
| `GET /login` | SSR or static + JS | none | |
| `GET /onboarding` | App shell | session required | 5 steps, client-side state, one save at the end |
| `GET /plans` | App shell | session required | |
| `GET /checkout` | App shell | session required | Three branches: paid / free / enterprise |
| `GET /welcome` | App shell | session required | |
| `POST /api/auth/*` | API | see §4 | |
| `POST /api/onboarding` | API | session | §5 |
| `POST /api/billing/*` | API | session | §6 |
| `POST /api/demo-request` | API | none + captcha | §7 |
| `POST /api/waitlist` | API | none + captcha | §7 |

**SEO:** `/` needs server-rendered HTML with the real copy in the markup — not JS-injected. Ship `sitemap.xml`, `robots.txt`, OpenGraph and Twitter card images, and JSON-LD `SoftwareApplication` + `FAQPage` (the FAQ accordion content is the source for the latter).

---

## 3. Content model

The marketing page has five repeating collections. Put them in a CMS or a versioned JSON file in the repo — **do not** hardcode them in components, because marketing will iterate on this weekly without you.

```ts
type Pillar   = { num: string; title: string; body: string; meta: string }        // 4 items, "How it works"
type Outcome  = { title: string; audience: string; runCount: number; tools: ToolId[]; accent: string }  // 6 items, gallery
type Guarantee= { tag: string; title: string; body: string }                      // 3 items, security
type Faq      = { question: string; answer: string }                              // 6 items
type Tier     = { id: TierId; name: string; monthlyCents: number|null; blurb: string; features: string[]; badge?: string }
```

`runCount` on the outcome gallery is displayed as "Run 1,240 times". Either wire it to real aggregate counts from the app's `outcome_runs` table (a nightly rollup is fine — this does not need to be live) or freeze it as CMS copy. **Do not ship an invented number that never moves.**

### Tool registry

The tool icons on the landing page, onboarding and app all come from one registry. Single source of truth, shared by both services:

```ts
type ToolId = 'slack'|'gmail'|'gcal'|'notion'|'linear'|'jira'|'github'
            | 'figma'|'salesforce'|'hubspot'|'gdrive'|'asana'|'whatsapp'|'instagram'
```

The prototype loads brand marks from a favicon CDN as a placeholder. **Replace with self-hosted SVGs** before launch: third-party icon CDNs drop marks over trademark policy (this already happened mid-build with two of them), they leak visitor IPs to a third party, and they're a render-blocking dependency on your highest-traffic page. Store them as an inlined SVG sprite. Check each vendor's brand guidelines for permitted use.

---

## 4. Identity

Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day rolling. Store server-side (Redis or a `sessions` table) so revocation is real. **Do not put a JWT in `localStorage`.**

```
POST /api/auth/signup      { name, email, password }        → 201 { userId } + Set-Cookie
POST /api/auth/login       { email, password }              → 200 + Set-Cookie
POST /api/auth/logout                                        → 204
GET  /api/auth/oauth/:provider                               → 302 to provider
GET  /api/auth/oauth/:provider/callback                      → 302 /onboarding | /app
POST /api/auth/forgot      { email }                        → 204 always
POST /api/auth/reset       { token, password }               → 204
```

- `provider ∈ google | microsoft | slack`. These are **identity only** — they do not grant data-read scopes. Tool connections are requested separately in onboarding step 4 and in the app, with their own consent screen. Do not conflate the two; asking for Gmail read scope at the login button will crater conversion and fail Google's verification.
- Password rules: minimum 12 characters, checked against a breached-password list (k-anonymity range query against HIBP). The prototype's strength meter is advisory UI — enforce server-side.
- Rate limit: 5 login attempts per email per 15 min, 20 per IP per hour. Return an identical response and timing for unknown email vs. wrong password.
- `POST /api/auth/forgot` always returns 204 regardless of whether the account exists.
- Email verification: required before the first tool connection, not before signup. Users must reach onboarding immediately.
- Enterprise SSO (SAML/OIDC) and SCIM are Enterprise-tier features — design the `users` table with an `identity_provider` and `external_id` column now so retrofitting isn't a migration nightmare.

---

## 5. Onboarding

Four questions plus a reflection. All state is client-side; **one** write at the end. If a user drops out mid-flow, they resume at step 1 — that's an acceptable trade for not writing five times.

```
POST /api/onboarding
{
  persona: 'work' | 'business' | 'school' | 'life',
  role: string,                    // from a persona-specific list
  firstOutcome: string,            // picked from a list, or free text
  requestedTools: ToolId[]
}
→ 200 { workspaceId, connectUrls: Record<ToolId, string> }
```

**The persona drives everything downstream.** It selects the role list, the suggested outcome list, and the recommended tool set. Keep those three lists server-side and versioned, keyed by persona, so growth can tune them without a client deploy:

```ts
type PersonaConfig = {
  roles: string[]
  suggestedOutcomes: string[]
  recommendedTools: ToolId[]
}
```

Current values are in the prototype's logic class (`ROLES`, `GOALS`, `RECO`) — lift them verbatim as the seed data.

`requestedTools` records *intent*, not a grant. Each returned `connectUrl` is an OAuth authorize URL; the actual connection completes in the app service (§ webapp spec). A tool the user selected but never authorised must show as pending, never as connected.

Persist `persona`, `role` and `firstOutcome` on the workspace. The app reads them to seed the composer and to pick which suggested outcomes to surface. This is the thing that makes the product feel like it remembered — don't drop it on the floor after onboarding.

---

## 6. Billing

Five tiers. Prices in **cents**, currency USD, never floats.

| id | Name | Monthly | Yearly | Trial | Seats |
|---|---|---|---|---|---|
| `free` | Free | $0 | $0 | 30 days unlimited, then 3 outcomes/month for life | 1 |
| `starter` | Starter | $69 | $745 | 7 days | 1 |
| `business` | Business | $99 | $1,069 | 7 days | 1 |
| `teams` | Teams | $279 | $3,013 | 7 days | up to 10 |
| `enterprise` | Enterprise | custom | custom | none — sales-led | custom |

**Yearly is computed, not stored:** `round(monthly × 12 × 0.9)` — 10% off. The prototype computes it live; do the same server-side so a price change can't desync the two figures. Never let the client compute a price it then sends back.

```
POST /api/billing/subscribe   { tierId, cadence: 'monthly'|'yearly', paymentMethodId? }
GET  /api/billing/subscription                → current tier, cadence, trial_ends_at, renews_at
POST /api/billing/cancel
POST /api/billing/portal                     → 302 to provider portal
POST /api/billing/enterprise-inquiry  { email, seatRange, firstOutcome }
POST /api/webhooks/stripe                    → signature-verified
```

Three checkout branches, and they must not leak into each other — the prototype gates all three:

- **Paid:** collect a card, `$0.00` due today, charge on day 8. Send a reminder email on day 5.
- **Free:** no card fields rendered, no card token collected, no trial row, no VAT line. `POST /api/billing/subscribe { tierId: 'free' }` and go.
- **Enterprise:** no card. Writes a CRM lead via `/api/billing/enterprise-inquiry` and notifies sales. Never render a self-serve total for a custom-priced plan.

**Free tier enforcement.** Two distinct windows — get this right or the tier is either abusable or a lie:
- Days 0–30: unlimited outcomes.
- Day 31 onward: 3 outcome runs per calendar month, forever. Reset on the 1st, UTC.
- Enforce the counter in the **app** service at run-start (see webapp spec §6). The landing service only sets the entitlement.

Use Stripe (or equivalent) as the source of truth for subscription state. Mirror it locally for fast reads, but reconcile from webhooks — never from client callbacks. Handle `customer.subscription.updated|deleted`, `invoice.payment_failed`, `invoice.paid`. Make the webhook handler idempotent on event id.

Card data must never touch your servers — use the provider's tokenising element. The prototype shows a styled placeholder form; the real one is an iframe you don't own.

---

## 7. Forms

```
POST /api/demo-request   { email, name?, company?, seatRange?, note? }
POST /api/waitlist       { email }
```

Captcha (Turnstile or hCaptcha) plus a honeypot field plus IP rate limiting. Both write to CRM and fire a Slack notification. Return 204 on success — never echo back whether the email already exists.

---

## 8. Analytics

Fire these; the funnel is unreadable without them:

`landing_viewed` · `hero_query_typed` (length only, **never the text**) · `hero_voice_started` · `demo_chapter_selected {index}` · `pricing_viewed` · `plan_selected {tierId, cadence}` · `signup_started {method}` · `signup_completed` · `onboarding_step_completed {step, persona}` · `onboarding_completed {persona, role, toolCount}` · `checkout_viewed {tierId}` · `subscription_created {tierId, cadence}` · `demo_requested`

Do not log the content of anything a user types into the hero ask box. It will contain confidential business information from the first day.

---

## 9. Non-functional

- LCP under 2.0s on 4G for `/`. The hero is a CSS gradient, not an image — keep it that way.
- Self-host the fonts (Geist, Geist Mono, Newsreader) with `font-display: swap` and preconnect. Don't ship a Google Fonts request on the critical path.
- The hero mesh gradient uses a slow `filter: blur()` animation. Wrap it in `@media (prefers-reduced-motion: reduce)` and disable. Same for every onboarding sketch animation.
- All decorative SVG sketches: `aria-hidden="true"`.
- Keyboard: the whole signup → onboarding → checkout flow must be completable without a mouse. Every card in onboarding is a real `<button>` in the prototype — keep them as buttons, not divs.
- Contrast: verify AA on the gradient hero. The BETA pill and hero sub-copy sit on a live gradient and are the two most likely to fail.
- Cookie consent before any non-essential analytics, given the EU/UK positioning and the data-residency claims on the security section.

---

## 10. Don't ship these claims until they're true

The security section and the FAQ make specific commitments. Legal and security need to sign off, or the copy changes:

- SOC 2 Type II, ISO 27001, GDPR, UK data residency, quarterly penetration testing
- "Nothing trains a shared model. Ever."
- "Revoke in one click. Kloyya forgets what it read from that source within the hour." — this requires a real cascade-delete job. See webapp spec §5.
- "All systems operational" in the footer must be wired to a real status source, not hardcoded.

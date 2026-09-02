# Kloyya — Handoff

Three files. Read this first, it's short.

## What's here

| File | What it is |
|---|---|
| `Kloyya-prototype.html` | The full clickable prototype. One self-contained file — double-click, no build step, no install. |
| `kloyya-landing-backend-spec.md` | Backend spec for the marketing site, signup, onboarding, plans and checkout. |
| `kloyya-webapp-backend-spec.md` | Backend spec for the authenticated product. |

The two specs are deliberately separate services. Reasons are in §1 of the landing spec.

## Driving the prototype

The dark bar across the top switches screens — twelve of them. Everything below it is the real design at 1440px.

The intended path through it, in order:

1. **Landing** — nav works. Product opens a dropdown into the app screens; How it works, Security and Pricing scroll. Type in the hero ask box, or hit **Speak it** for the voice state. Your text carries through to the Plan screen.
2. **Sign up** → **Onboarding** — four questions and a reflection. Answer step 1 differently and watch steps 2, 3 and 4 change: roles, suggested outcomes and recommended tools are all persona-driven. That adaptivity is the product's first impression and it's spec'd in landing §5.
3. **Choose plan** → **Checkout** — five tiers. Toggle monthly/yearly. Select Free, then Enterprise, then a paid tier and re-open Checkout each time: three genuinely different states, no card form on two of them. Landing §6.
4. **New outcome** → **Plan review** → **Live run** → **Outcome delivered** — the core loop. Webapp §1.
5. **Outcomes**, **Connections** — the surrounding product.

## What's real and what's staged

**Real:** all layout, type, colour, spacing, states, transitions, and the persona-adaptive logic. Screen routing. The plan/tier/price arithmetic — yearly is computed as `monthly × 12 × 0.9`, not typed in.

**Staged:** the voice recording (simulated waveform and transcription — a prototype can't hold a mic grant), the demo player chapters, and all data. No network calls anywhere.

## Three things to look at before you estimate

1. **Webapp §1, the state machine.** Every screen is a view of one outcome state. If you get that model right the rest follows; if you model this as a chat thread you'll rebuild it later.
2. **Webapp §5, the revocation cascade.** The marketing page promises Kloyya forgets a revoked source within the hour. Step 4 of that cascade — retracting derived memory — is the genuinely hard one, and it's already a public commitment.
3. **Webapp §7, prompt injection.** Untrusted content from fourteen tools flows into a model that proposes write actions. The approval gate is the mitigation and it can't be optional.

## Known placeholder to replace

Tool and SSO brand marks currently load from a favicon CDN. Self-host them as an SVG sprite before launch — third-party icon CDNs drop marks over trademark policy (happened twice during this build), leak visitor IPs, and block rendering on the highest-traffic page. Landing §3.

## Open questions for you

- Are the five tiers final? Prices are in one array in the prototype and one table per spec, so they're cheap to change now and expensive later.
- Does Free at 3 outcomes/month for life survive contact with your unit economics? Every run costs model tokens.
- Which three tools ship first? The specs assume Slack, Gmail, Salesforce.

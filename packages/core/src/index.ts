/**
 * @kloyya/core — the shared domain contract.
 *
 * The single source of truth for the shapes that cross the wire: the domain
 * model, the KAS request/response envelope, and the feature sub-domains
 * (calendar, integrations, knowledge, search, sources). The web app and the
 * API both depend on these, so a change to the contract is one change, in one
 * place, that neither side can drift from.
 *
 * These are pure type declarations plus a few frozen constants (API_VERSION,
 * API_STATUS) — no runtime, no Node or DOM dependency.
 */
export * from './domain.js';
export * from './api.js';
export * from './permissions.js';
export * from './preferences.js';
export * from './entitlements.js';
export * from './calendar.js';
export * from './integrations.js';
export * from './integration-catalogue.js';
export * from './feedback.js';
export * from './knowledge.js';
export * from './search.js';
export * from './sources.js';

// ✅ CETTE LIGNE EST OBLIGATOIRE POUR QUE LE BUILD PASSE :
export * from './unified-event.js';

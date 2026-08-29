import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Kloyya database schema — Phase 3, core tenancy.
 *
 * Derived field-for-field from the frontend's domain model
 * (apps/web/types/domain.ts + apps/web/services/auth/types.ts) so the API returns
 * these shapes without translation drift.
 *
 * Conventions:
 *   • snake_case columns/tables (Postgres/Supabase idiom), camelCase in TS.
 *   • Every table carries audit columns (created/updated/deleted_at, version),
 *     per KDA "Every table includes … Soft Delete Flag, Version".
 *   • RLS is ENABLED on every table here (`.enableRLS()`), a deny-by-default
 *     posture. The server connects as the table-owning role, which bypasses
 *     ENABLE'd (not FORCE'd) RLS for the app; unprivileged Supabase roles are
 *     denied. Per-tenant policies read an app-set GUC —
 *     `current_setting('app.current_org_id')` — set by `withTenantScope`.
 *   • Identity lives in Supabase Auth (`auth.users`), NOT in this schema. The
 *     `users` table is the domain profile whose primary key IS the Supabase auth
 *     uid (no cross-schema FK). Email/verification come from the JWT at request
 *     time; `users.full_name`/`users.email` denormalize what member listings and
 *     invitation checks need for OTHER users.
 */

// ---------------------------------------------------------------------------
// Enums — the closed sets the frontend already defines
// ---------------------------------------------------------------------------

export const plan = pgEnum('plan', ['starter', 'growth', 'enterprise']);

/**
 * Beta subscription tier on the (internal) organization. Free and Pro only — no
 * Max during the private beta. Distinct from the legacy `plan` enum above, which
 * is the pre-beta billing tier and will be retired in the cleanup phase.
 */
export const subscriptionTier = pgEnum('subscription_tier', ['free', 'pro']);

/** How assertive Kloyya should be, chosen at onboarding. */
export const proactiveness = pgEnum('proactiveness', [
  'minimal',
  'balanced',
  'highly_proactive',
]);

/** What a draft is — the kinds the beta supports. */
export const draftType = pgEnum('draft_type', [
  'email',
  'note',
  'report',
  'document',
  'meeting_summary',
]);

/** A draft's lifecycle. `archived` is "organized away", not deleted. */
export const draftStatus = pgEnum('draft_status', ['active', 'archived']);

/**
 * Where an uploaded document is in its pipeline. `processing` while text is
 * being extracted, `ready` once it's searchable, `failed` if extraction died
 * (the file is still stored and can be re-tried).
 */
export const documentStatus = pgEnum('document_status', ['processing', 'ready', 'failed']);

/** A task's lifecycle. */
export const taskStatus = pgEnum('task_status', ['todo', 'in_progress', 'blocked', 'done']);

/** KDSE priority bands — human-set, distinct from the AI priority score. */
export const priorityLevel = pgEnum('priority_level', [
  'Critical',
  'High',
  'Medium',
  'Low',
  'Background',
]);

/** A project's lifecycle. */
export const projectStatus = pgEnum('project_status', [
  'planning',
  'active',
  'at_risk',
  'paused',
  'complete',
]);

/** What a piece of beta feedback is. */
export const feedbackType = pgEnum('feedback_type', ['feature_request', 'bug', 'general']);

/** Which area a feature request or bug is about (from the settings spec). */
export const feedbackCategory = pgEnum('feedback_category', [
  'ai',
  'search',
  'workspace',
  'tasks',
  'projects',
  'documents',
  'integrations',
  'mobile',
  'performance',
  'design',
  'other',
]);

/** KESM RBAC roles, including the machine principals — an agent is authorized
 *  and audited like any user. */
export const membershipRole = pgEnum('membership_role', [
  'owner',
  'administrator',
  'executive',
  'manager',
  'team_lead',
  'employee',
  'contractor',
  'guest',
  'auditor',
  'support',
  'ai_service',
  'automation_service',
]);

export const workStyle = pgEnum('work_style', ['deep_focus', 'collaborative', 'reactive']);

export const notificationLevel = pgEnum('notification_level', [
  'everything',
  'important_only',
  'critical_only',
]);

/** Mirrors NOTIFICATION_CATEGORIES in packages/core/src/domain.ts. */
export const notificationCategory = pgEnum('notification_category', [
  'ai',
  'important',
  'mentions',
  'meetings',
  'tasks',
  'projects',
  'system',
]);

export const goal = pgEnum('goal', [
  'reduce_meeting_load',
  'stay_on_top_of_email',
  'track_project_risk',
  'prepare_for_meetings',
  'organize_knowledge',
  'make_faster_decisions',
]);

// ---------------------------------------------------------------------------
// Shared audit columns — KDA mandates these on every table.
// ---------------------------------------------------------------------------

const audit = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
};

// ---------------------------------------------------------------------------
// Identity lives in Supabase Auth (auth.users), not in this schema. The former
// Better Auth tables (user/session/account/verification) were dropped in
// migration 0017; `users.id` below stores the Supabase auth uid directly, with
// no cross-schema foreign key.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tenant tables
// ---------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  industry: text('industry').notNull(),
  logoUrl: text('logo_url'),
  plan: plan('plan').notNull().default('starter'),
  /** Beta subscription tier, chosen on the onboarding plan step. Free by default. */
  subscriptionTier: subscriptionTier('subscription_tier').notNull().default('free'),
  ...audit,
}).enableRLS();

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** DCTF Trust Score, 0–100. Surfaced on the dashboard. */
    trustScore: integer('trust_score').notNull().default(0),
    ...audit,
  },
  (t) => [index('workspaces_organization_id_idx').on(t.organizationId)],
).enableRLS();

export const users = pgTable(
  'users',
  {
    /** The domain profile for a Supabase Auth user — 1:1, storing the auth uid
     *  as the primary key. Email and verification state come from the Supabase
     *  JWT at request time (never duplicated here); `fullName` is the canonical
     *  display name, editable in Settings. */
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull().default(''),
    /** Denormalized from the Supabase identity at provisioning. The caller's own
     *  email is read live from the JWT; this copy exists so member listings and
     *  invitation checks can name OTHER users without reaching into auth.users. */
    email: text('email').notNull().default(''),
    jobTitle: text('job_title').notNull().default(''),
    timezone: text('timezone').notNull().default('UTC'),
    /** False until onboarding completes. Gates the dashboard. */
    hasCompletedOnboarding: boolean('has_completed_onboarding').notNull().default(false),
    /** Which workspace the user currently has open (they may belong to several). */
    activeWorkspaceId: uuid('active_workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    ...audit,
  },
  (t) => [index('users_organization_id_idx').on(t.organizationId)],
).enableRLS();

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The user's role IN THIS WORKSPACE. The frontend's flat `user.role` is the
     *  role from the active workspace's membership. */
    role: membershipRole('role').notNull().default('employee'),
    ...audit,
  },
  (t) => [
    uniqueIndex('memberships_user_id_workspace_id_uq').on(t.userId, t.workspaceId),
    index('memberships_workspace_id_idx').on(t.workspaceId),
    index('memberships_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * Pending invitations into a workspace.
 *
 * `tokenHash` holds a SHA-256 of the token we emailed, never the token itself —
 * the same reason `account.password` is a hash. An invitation is a credential:
 * whoever holds the token can join the organization, so a leaked database must
 * not hand out working invites.
 *
 * Status is derived, not stored: pending means not accepted, not revoked, and
 * not past `expiresAt`. A status column would be a second source of truth that
 * can disagree with the timestamps.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Stored lowercased; addresses are compared case-insensitively. */
    email: text('email').notNull(),
    /** The role the invitee gets on acceptance. */
    role: membershipRole('role').notNull().default('employee'),
    /** Kept for the audit trail; survives the inviter leaving. */
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...audit,
  },
  (t) => [
    index('invitations_organization_id_idx').on(t.organizationId),
    index('invitations_workspace_id_idx').on(t.workspaceId),
    index('invitations_email_idx').on(t.email),
  ],
).enableRLS();

/** The connection lifecycle the frontend's IntegrationsService already models. */
export const connectionStatus = pgEnum('connection_status', [
  'not_connected',
  'connecting',
  'syncing',
  'connected',
  'paused',
  'error',
]);

/**
 * A workspace's connection to a third-party tool.
 *
 * The catalogue (what CAN be connected, and the permissions each card promises)
 * is static config in @kloyya/core — only the live connection state lives here,
 * keyed by that catalogue's `integrationId`. There is deliberately no foreign key
 * to a providers table: the catalogue is code, reviewed and deployed, not rows a
 * bug could invent.
 *
 * The tokens are the customer's access to their own Gmail, Calendar and Drive.
 * They are stored ONLY as ciphertext (AES-256-GCM, see api/src/crypto/tokens.ts)
 * and are never selected into any response — no endpoint returns them, and the
 * connection DTO the API sends has no field to put them in.
 */
export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Matches IntegrationDefinition.id in the shared catalogue, e.g. 'gmail'. */
    integrationId: text('integration_id').notNull(),
    status: connectionStatus('status').notNull().default('not_connected'),
    /** Ciphertext. Never plaintext, never returned. */
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    /** The scopes the provider actually granted — which can be less than we asked. */
    grantedScopes: text('granted_scopes').array().notNull().default(sql`'{}'::text[]`),
    /** Who connected it; kept for the audit trail. */
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    /**
     * Where the last incremental sync got to, per resource.
     *
     * A map because one connection has many streams — Google Calendar issues a
     * separate syncToken per calendar, so a single cursor column would silently
     * only ever sync one of them. Opaque provider values; we store and return
     * them, never parse them.
     */
    syncCursors: jsonb('sync_cursors').notNull().default(sql`'{}'::jsonb`),
    /** Human-readable, shown with a Reconnect action. Present only on 'error'. */
    errorReason: text('error_reason'),
    composioConnectedAccountId: text('composio_connected_account_id'),
    ...audit,
  },
  (t) => [
    // One connection per tool per workspace: connecting Gmail twice is a bug, not
    // a feature, and two live token pairs for one provider is a sync race.
    uniqueIndex('connections_workspace_id_integration_id_uq').on(t.workspaceId, t.integrationId),
    index('connections_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * Raw provider data, exactly as the provider gave it.
 *
 * Connectors land; the pipeline interprets. Nothing in this table has been
 * reshaped, renamed, scored or summarised — `payload` is verbatim provider JSON.
 * That separation is what makes the pipeline re-runnable: when the way we read a
 * calendar event changes, we re-read what Google already told us instead of
 * asking Google again. Re-fetching everyone's history to fix our own bug is a
 * rate limit, a bill, and an outage.
 *
 * One row per provider object per connection, holding its latest raw form.
 * `contentHash` is what makes a re-sync cheap: an unchanged payload is skipped
 * rather than re-processed downstream.
 *
 * Provider deletions are tombstoned (`deletedAtSource`) rather than deleted:
 * "this meeting was cancelled" is intelligence, and a row that vanishes cannot
 * tell the pipeline anything.
 */
export const syncRecords = pgTable(
  'sync_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Disconnecting a tool takes its landed data with it. */
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    /** Denormalized from the connection so the pipeline can filter without a join. */
    integrationId: text('integration_id').notNull(),
    /** What kind of thing this is: 'calendar_event', 'message', 'file'. */
    resourceType: text('resource_type').notNull(),
    /** The provider's own id. Stable across syncs; ours is not. */
    externalId: text('external_id').notNull(),
    /** Verbatim provider JSON. Never edited, never interpreted here. */
    payload: jsonb('payload').notNull(),
    /** SHA-256 of the payload — an unchanged object is skipped, not reprocessed. */
    contentHash: text('content_hash').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when the provider says it's gone. A tombstone, not a delete. */
    deletedAtSource: timestamp('deleted_at_source', { withTimezone: true }),
    ...audit,
  },
  (t) => [
    uniqueIndex('sync_records_connection_resource_external_uq').on(
      t.connectionId,
      t.resourceType,
      t.externalId,
    ),
    index('sync_records_workspace_resource_idx').on(t.workspaceId, t.resourceType),
    index('sync_records_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * Ask Kloyya usage, one row per workspace per day.
 *
 * The Free plan caps questions per day (see @kloyya/core entitlements); this is
 * the counter that cap reads and increments. Keyed by (workspace, day) so a
 * day rolls over on its own — no cleanup job, just a new row. Kept tiny on
 * purpose: it counts, it does not log what was asked.
 */
export const askUsage = pgTable(
  'ask_usage',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** The UTC calendar day this count is for. */
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.day] }),
    index('ask_usage_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * The generated morning briefing, one row per workspace per day.
 *
 * Cached rather than regenerated because a briefing costs a model call: without
 * this, every dashboard load paid a few seconds of latency and real money to
 * re-derive the same three sentences from the same records. Keyed by
 * (workspace, day) so a second visit on the same morning is a plain row read.
 *
 * `evidenceCount` is stored alongside the prose because it is what `confidence`
 * was computed from — keeping it means a briefing can be explained after the
 * fact ("written from 12 items across 3 tools") rather than presenting a number
 * nobody can account for.
 */
export const briefings = pgTable(
  'briefings',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** The UTC calendar day this briefing covers. */
    day: date('day').notNull(),
    kind: text('kind').notNull().default('morning'),
    headline: text('headline').notNull(),
    narrative: text('narrative').notNull(),
    confidence: integer('confidence').notNull(),
    /** How many landed records it was written from. */
    evidenceCount: integer('evidence_count').notNull().default(0),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.day] }),
    index('briefings_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * Pre-meeting briefings — "walk into meetings prepared" (packages/core's
 * `MeetingBriefing`), generated once per meeting and cached, same reasoning
 * as `briefings` above: two page loads must produce one account of a
 * meeting, not two differently-worded ones from two model calls.
 *
 * `meetingId` is the calendar event's own external id (see
 * server/meetings/service.ts — a "meeting" is a shaped `sync_records` row,
 * not its own entity), so it is text, not a uuid.
 */
export const meetingBriefings = pgTable(
  'meeting_briefings',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    meetingId: text('meeting_id').notNull(),
    headline: text('headline').notNull(),
    objective: text('objective').notNull(),
    talkingPoints: text('talking_points').array().notNull().default(sql`'{}'::text[]`),
    risks: text('risks').array().notNull().default(sql`'{}'::text[]`),
    confidence: integer('confidence').notNull(),
    /** Serialized `NonEmpty<Evidence>` — structured, so kept as jsonb rather than parallel arrays. */
    evidence: jsonb('evidence').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.meetingId] }),
    index('meeting_briefings_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * In-app notifications — workspace-wide, not per-user, matching
 * apps/web/types/domain.ts's `AppNotification` (no `userId` field). Ranked by
 * `decisionScore`, not `createdAt`, per KDSE: a Critical alert from an hour ago
 * outranks a routine one from a minute ago.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    category: notificationCategory('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    href: text('href'),
    decisionScore: integer('decision_score').notNull().default(0),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_workspace_id_idx').on(t.workspaceId),
    index('notifications_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * A browser's Web Push subscription for one user. Per-user (unlike
 * `notifications` above) — a push has to land on a specific person's device,
 * not a shared workspace feed. `endpoint` is unique: resubscribing the same
 * browser updates its keys rather than accumulating duplicate rows.
 *
 * Per KDSE (see lib/decision-score.ts `isAllowedOnChannel`), only a Critical
 * (90-100) decision score may trigger a push — that policy is enforced where
 * a push is sent, not here; this table only stores where to send it.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
    index('push_subscriptions_user_id_idx').on(t.userId),
    index('push_subscriptions_workspace_id_idx').on(t.workspaceId),
  ],
).enableRLS();

/**
 * API rate-limit buckets — a blunt abuse guard, not tenant data.
 *
 * A fixed-window counter: one row per (subject, window-start), incremented on
 * every guarded request. `subject` is `user:<id>` (never PII), `windowStart` is
 * the epoch-second the minute began. The server reads/writes this as the owner
 * role, outside `withTenantScope` — it isn't scoped to any organization, so it
 * has no org/workspace columns and no tenant policy, just RLS enabled to deny
 * every other role by default. Rows for elapsed windows are cleaned up on write.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    subject: text('subject').notNull(),
    /** Epoch seconds at the start of the fixed window this row counts. */
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.subject, t.windowStart] })],
).enableRLS();

/**
 * Drafts — the things a person is writing but hasn't sent or filed.
 *
 * Email replies, notes, reports, documents, meeting summaries. Kloyya can create
 * one ("draft this"), and the editor auto-saves as you type, so a draft is never
 * a thing you can lose. Workspace-scoped and RLS-isolated like everything else;
 * `archived` organizes a draft away without deleting it, and a real delete is a
 * soft delete (deletedAt) so "I didn't mean to" is recoverable.
 */
export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Who created it; kept for the audit trail, survives the author leaving. */
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    type: draftType('type').notNull().default('note'),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    status: draftStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [
    index('drafts_workspace_id_idx').on(t.workspaceId),
    index('drafts_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * Uploaded documents.
 *
 * A file the user uploaded (or, later, scanned) so Kloyya can search it. The
 * bytes live in object storage; this row holds the metadata and the extracted
 * text — `extractedText` is what full-text search and Ask Kloyya read, so a PDF
 * becomes as searchable as an email. Workspace-scoped and RLS-isolated. Delete is
 * a soft delete so an accidental removal is recoverable (the stored object is
 * cleaned up separately).
 *
 * The Free plan caps how many a workspace may keep (see @kloyya/core
 * entitlements); the upload route counts live rows here against that cap.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** The original filename, shown to the user. */
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Where the bytes live in object storage. Opaque; not a public URL. */
    storagePath: text('storage_path').notNull(),
    /** The searchable text pulled out of the file. Empty until/unless extracted. */
    extractedText: text('extracted_text').notNull().default(''),
    status: documentStatus('status').notNull().default('processing'),
    /**
     * Cached AI summary for the Knowledge feature (server/knowledge/service.ts).
     * Generated once per document, not on every read — the same reasoning as
     * `briefings`: an AI-written summary that reworded itself on every refresh
     * would be harder to trust than a stable one, and costs a real model call
     * to boot. Null until a provider is configured and generation succeeds.
     */
    aiSummary: text('ai_summary'),
    aiSummaryConfidence: integer('ai_summary_confidence'),
    aiSummarizedAt: timestamp('ai_summarized_at', { withTimezone: true }),
    ...audit,
  },
  (t) => [
    index('documents_workspace_id_idx').on(t.workspaceId),
    index('documents_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * Projects — the unit of work Kloyya tracks health for.
 *
 * `healthScore`/`riskScore` are read here as plain columns; the reasoning behind
 * them (ProjectHealth) is generated on demand, not stored, so it can never go
 * stale next to a number nobody re-explained. Workspace-scoped and RLS-isolated.
 * Soft delete, like everything else.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: projectStatus('status').notNull().default('planning'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    progress: integer('progress').notNull().default(0),
    riskScore: integer('risk_score').notNull().default(0),
    healthScore: integer('health_score').notNull().default(100),
    deadline: timestamp('deadline', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...audit,
  },
  (t) => [
    index('projects_workspace_id_idx').on(t.workspaceId),
    index('projects_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * Tasks — the unit of work itself.
 *
 * `priority` is human-set (KDSE bands); `aiPriorityScore` is a separate,
 * AI-derived 0-100 ranking — the two are never conflated. `projectId` is
 * nullable: a task need not belong to a project. Workspace-scoped and
 * RLS-isolated. Soft delete, like everything else.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: taskStatus('status').notNull().default('todo'),
    priority: priorityLevel('priority').notNull().default('Medium'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    aiPriorityScore: integer('ai_priority_score').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...audit,
  },
  (t) => [
    index('tasks_workspace_id_idx').on(t.workspaceId),
    index('tasks_organization_id_idx').on(t.organizationId),
    index('tasks_project_id_idx').on(t.projectId),
  ],
).enableRLS();

/**
 * Beta feedback — feature requests, bug reports, and general notes.
 *
 * Kloyya is built alongside its users; this is where their ideas and problems
 * land. One table for all three kinds keeps the "Community & Feedback" screen and
 * its beta-status counters reading from a single place. `details` holds the
 * kind-specific extras (a bug's steps/expected/actual, a request's frequency)
 * rather than a column per rarely-used field. Workspace-scoped and RLS-isolated.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: feedbackType('type').notNull(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    /** Present for feature requests and bugs; null for general feedback. */
    category: feedbackCategory('category'),
    /** A 1–5 star rating, on general feedback. Null otherwise. */
    rating: integer('rating'),
    /** Kind-specific extras (steps to reproduce, frequency, …). */
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    ...audit,
  },
  (t) => [
    index('feedback_workspace_id_idx').on(t.workspaceId),
    index('feedback_organization_id_idx').on(t.organizationId),
  ],
).enableRLS();

/**
 * The private-beta waiting list.
 *
 * Deliberately outside the tenant model: a person on this list has no account,
 * no organization, and no workspace — that is the whole point of them being on
 * it. So there is no organization_id, and no `app_tenant` policy could be
 * written for it. RLS is enabled with no policy, which denies anon and
 * authenticated outright, and the API route reaches it as the owner. The
 * PostgREST grants revoked in 0023 mean it is unreachable with the public key.
 *
 * The email is the primary key rather than a surrogate id: signing up twice is
 * not an error, it is the same person being keen, and an upsert on the address
 * expresses that without a uniqueness check in application code.
 */
export const waitlist = pgTable(
  'waitlist',
  {
    /** Stored lower-cased and trimmed by the API; the address IS the identity. */
    email: text('email').primaryKey(),
    /** Where they came from — a landing-page section, a campaign. Free-form. */
    source: text('source').notNull().default('landing'),
    /**
     * Set when the address is moved onto the allowlist and told. Null means
     * still waiting, so "who has not heard from us yet" is a WHERE clause.
     */
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('waitlist_created_at_idx').on(t.createdAt)],
).enableRLS();

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** How the user describes their work (onboarding "role"). Free-form so the
   *  "Other" option is real; drives what Kloyya puts first. */
  role: text('role').notNull().default(''),
  /** The user's own words for what matters right now. Free-form, multiple. */
  priorities: text('priorities')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** How assertive Kloyya should be. */
  proactiveness: proactiveness('proactiveness').notNull().default('balanced'),
  /** Awkward literal values ('1-10', '06:00') are stored as text and validated
   *  by the app (zod), rather than forced into Postgres enum identifiers. */
  teamSize: text('team_size').notNull().default('51-200'),
  briefingTime: text('briefing_time').notNull().default('07:00'),
  goals: goal('goals')
    .array()
    .notNull()
    .default(sql`'{}'::goal[]`),
  workStyle: workStyle('work_style').notNull().default('deep_focus'),
  notificationLevel: notificationLevel('notification_level').notNull().default('important_only'),
  /** Whether Kloyya may draft from an idea in the Drafts editor. On by default;
   *  the core version is a single switch — no per-field or style controls yet. */
  aiDraftingEnabled: boolean('ai_drafting_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}).enableRLS();

// ---------------------------------------------------------------------------
// Relations — for the query builder (db.query.users.findMany({ with: … }))
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  workspaces: many(workspaces),
  users: many(users),
  memberships: many(memberships),
  invitations: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
  invitedBy: one(users, { fields: [invitations.invitedByUserId], references: [users.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  memberships: many(memberships),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  activeWorkspace: one(workspaces, {
    fields: [users.activeWorkspaceId],
    references: [workspaces.id],
  }),
  memberships: many(memberships),
  preferences: one(userPreferences),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [memberships.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, { fields: [userPreferences.userId], references: [users.id] }),
}));
// ============================================================================
// KNOWLEDGE GRAPH & MEMORY (Étape 1 : Intelligence Organisationnelle)
// ============================================================================

export const graphNodeTypeEnum = pgEnum('graph_node_type', [
  'person', 'project', 'document', 'meeting', 'decision', 'task', 'conversation', 'tool', 'knowledge',
]);

export const graphEdgeTypeEnum = pgEnum('graph_edge_type', [
  'WORKS_ON', 'OWNS', 'ASSIGNED_TO', 'DEPENDS_ON', 'PARTICIPATES_IN',
  'MENTIONS', 'AUTHORED', 'REVIEWED', 'RELATES_TO', 'REFERENCES',
  'SUPERSEDES', 'SUPPORTS', 'REPORTS_TO', 'COLLABORATES_WITH', 'MEMBER_OF',
]);

export const memoryLayerEnum = pgEnum('memory_layer', [
  'short_term', 'working', 'session', 'long_term', 'organizational',
  'knowledge', 'decision', 'conversational', 'user',
]);

export const graphNodes = pgTable(
  'graph_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    type: graphNodeTypeEnum('type').notNull(),
    externalId: text('external_id'),
    externalProvider: text('external_provider'),
    name: text('name').notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    content: text('content'),
    embedding: text('embedding'), // Sera converti en vector(1536) via migration SQL
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('graph_nodes_workspace_type_idx').on(t.workspaceId, t.type),
    uniqueIndex('graph_nodes_external_id_idx').on(t.workspaceId, t.externalProvider, t.externalId),
    index('graph_nodes_tenant_idx').on(t.organizationId, t.workspaceId),
  ]
).enableRLS();

export const graphEdges = pgTable(
  'graph_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull(),
    targetId: uuid('target_id').notNull(),
    type: graphEdgeTypeEnum('type').notNull(),
    weight: integer('weight').default(1).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    metadata: jsonb('metadata').default('{}').notNull(),
    sourceProvider: text('source_provider'),
    sourceEventId: text('source_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('graph_edges_source_idx').on(t.sourceId, t.type),
    index('graph_edges_target_idx').on(t.targetId, t.type),
    uniqueIndex('graph_edges_edge_idx').on(t.workspaceId, t.sourceId, t.targetId, t.type),
    index('graph_edges_tenant_idx').on(t.organizationId, t.workspaceId),
  ]
).enableRLS();

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    layer: memoryLayerEnum('layer').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    embedding: text('embedding'),
    importance: integer('importance').default(50).notNull(),
    accessCount: integer('access_count').default(0).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('memories_user_layer_idx').on(t.userId, t.layer),
    index('memories_org_layer_idx').on(t.organizationId, t.layer),
    index('memories_tenant_idx').on(t.organizationId, t.workspaceId),
  ]
).enableRLS();

export const graphNodesRelations = relations(graphNodes, ({ one, many }) => ({
  organization: one(organizations, { fields: [graphNodes.organizationId], references: [organizations.id] }),
  workspace: one(workspaces, { fields: [graphNodes.workspaceId], references: [workspaces.id] }),
  outgoingEdges: many(graphEdges),
}));

export const graphEdgesRelations = relations(graphEdges, ({ one }) => ({
  organization: one(organizations, { fields: [graphEdges.organizationId], references: [organizations.id] }),
  workspace: one(workspaces, { fields: [graphEdges.workspaceId], references: [workspaces.id] }),
  source: one(graphNodes, { fields: [graphEdges.sourceId], references: [graphNodes.id], relationName: 'sourceEdges' }),
  target: one(graphNodes, { fields: [graphEdges.targetId], references: [graphNodes.id], relationName: 'targetEdges' }),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  organization: one(organizations, { fields: [memories.organizationId], references: [organizations.id] }),
  workspace: one(workspaces, { fields: [memories.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [memories.userId], references: [users.id] }),
}));

import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@kloyya/db/client';
import { withTenantScope } from '@kloyya/db/scope';
import { connections } from '@kloyya/db/schema';
import type { TokenCrypto } from '../crypto/tokens';
import { GOOGLE_SCOPES } from './google';
import { SLACK_SCOPES } from './slack';
import type { ProviderTokens } from './oauth';

// StartContext + resolveStartContext moved to the tenant layer (server/tenant.ts)
// — they belong to tenancy, not the connectors. Re-exported here so the many
// integration/service files that import them from this module keep working.
export { resolveStartContext, type StartContext } from '../tenant';
import type { StartContext } from '../tenant';

/** Mark the connection as in-flight, so the UI can show 'connecting'. */
export async function markConnecting(
  db: AppDb,
  ctx: StartContext,
  integrationId: string,
): Promise<void> {
  await withTenantScope(db, ctx.organizationId, async (tx) => {
    await tx
      .insert(connections)
      .values({
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        integrationId,
        status: 'connecting',
        connectedByUserId: ctx.userId,
      })
      .onConflictDoUpdate({
        target: [connections.workspaceId, connections.integrationId],
        set: { status: 'connecting', errorReason: null },
      });
  });
}

export type StoreResult =
  | { ok: true; missingScopes: string[] }
  | { ok: false; reason: 'no_refresh_token' | 'scopes_refused' };

/**
 * Persist the tokens Google returned.
 *
 * Two ways this legitimately fails, and both are the user's business:
 *
 *  • No refresh token. Google only issues one on first consent unless asked with
 *    access_type=offline&prompt=consent. Without it the connection dies silently
 *    when the access token expires in an hour — so it is refused now, loudly,
 *    rather than working today and breaking on its own tomorrow.
 *  • Scopes refused. Google's consent screen lets a user tick fewer boxes than
 *    we asked for. A connector missing the scope it needs isn't connected; it's
 *    a card that says "connected" above a sync that will 403 forever.
 *
 * Tokens are encrypted before they touch the row. Nothing else in this file, or
 * any file, writes them in the clear.
 */
/**
 * Persist the tokens a provider returned. Shared by every OAuth connector.
 *
 * `scopeGranted` is the one part that differs by provider — Google echoes
 * every scope it granted verbatim, so an exact-includes check is right, and
 * each provider supplies its own check accordingly. Everything else — refuse
 * a missing refresh token, encrypt before storing, never write plaintext —
 * is identical, so it lives here once.
 */

export async function storeProviderTokens(
  db: AppDb,
  crypto: TokenCrypto,
  ctx: StartContext,
  integrationId: string,
  tokens: ProviderTokens,
  opts: {
    requiredScopes: readonly string[];
    scopeGranted: (granted: string[], required: readonly string[]) => boolean;
    /**
     * The message shown when a refresh token is required but absent. Passing
     * `null` declares this provider's tokens never expire (Notion), so a missing
     * refresh token is expected, not a failure.
     */
    noRefreshMessage: string | null;
  },
): Promise<StoreResult> {
  if (!opts.scopeGranted(tokens.grantedScopes, opts.requiredScopes)) {
    await failConnection(
      db,
      ctx,
      integrationId,
      'Kloyya needs all the permissions on the card to read this. Reconnect and accept them.',
    );
    return { ok: false, reason: 'scopes_refused' };
  }

  if (opts.noRefreshMessage !== null && !tokens.refreshToken) {
    await failConnection(db, ctx, integrationId, opts.noRefreshMessage);
    return { ok: false, reason: 'no_refresh_token' };
  }

  // A provider whose tokens never expire stores no refresh token; one that
  // refreshes has already been guaranteed to carry one above.
  const refreshEnc = tokens.refreshToken ? crypto.encrypt(tokens.refreshToken) : null;

  await withTenantScope(db, ctx.organizationId, async (tx) => {
    await tx
      .insert(connections)
      .values({
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        integrationId,
        status: 'connected',
        connectedByUserId: ctx.userId,
        accessTokenEnc: crypto.encrypt(tokens.accessToken),
        refreshTokenEnc: refreshEnc,
        ...(tokens.expiresAt ? { accessTokenExpiresAt: tokens.expiresAt } : {}),
        grantedScopes: tokens.grantedScopes,
        errorReason: null,
        // Seed provider metadata (e.g. Slack's team id) at connect time — most
        // providers pass nothing here, and the column already defaults to '{}'.
        ...(tokens.metadata ? { syncCursors: tokens.metadata } : {}),
      })
      .onConflictDoUpdate({
        target: [connections.workspaceId, connections.integrationId],
        set: {
          status: 'connected',
          connectedByUserId: ctx.userId,
          accessTokenEnc: crypto.encrypt(tokens.accessToken),
          refreshTokenEnc: refreshEnc,
          accessTokenExpiresAt: tokens.expiresAt ?? null,
          grantedScopes: tokens.grantedScopes,
          errorReason: null,
          // A fresh token means the sync pipeline knows nothing about what this
          // token can reach yet — most importantly after a revoke-then-reconnect,
          // where the row otherwise still carries the OLD token's lastSyncedAt.
          // useFirstSync (features/connections/use-first-sync.ts) only auto-syncs
          // when this is null, so leaving the old value meant a reconnect after
          // a revoked/rotated OAuth client silently never synced again.
          lastSyncedAt: null,
          // Only touched when the provider actually returns metadata (Slack) —
          // Google/Notion's sync cursors must survive a reconnect untouched,
          // exactly as before this field existed.
          ...(tokens.metadata ? { syncCursors: tokens.metadata } : {}),
        },
      });
  });

  return { ok: true, missingScopes: [] };
}

/** Google grants every scope verbatim, so require them all, exactly. */
export function storeGoogleTokens(
  db: AppDb,
  crypto: TokenCrypto,
  ctx: StartContext,
  integrationId: string,
  tokens: ProviderTokens,
): Promise<StoreResult> {
  return storeProviderTokens(db, crypto, ctx, integrationId, tokens, {
    requiredScopes: GOOGLE_SCOPES[integrationId] ?? [],
    scopeGranted: (granted, required) => required.every((s) => granted.includes(s)),
    noRefreshMessage:
      'Google did not return a refresh token, so the connection would expire within the hour. Reconnect to try again.',
  });
}

/**
 * Notion has no OAuth scopes and no refresh token: access is per-page, granted in
 * Notion's own UI, and the token never expires. So there is nothing to verify and
 * nothing to refresh — just store what came back.
 */
export function storeNotionTokens(
  db: AppDb,
  crypto: TokenCrypto,
  ctx: StartContext,
  integrationId: string,
  tokens: ProviderTokens,
): Promise<StoreResult> {
  return storeProviderTokens(db, crypto, ctx, integrationId, tokens, {
    requiredScopes: [],
    scopeGranted: () => true,
    // null: Notion tokens never expire, so a missing refresh token is expected.
    noRefreshMessage: null,
  });
}

/**
 * Slack grants bot scopes exactly, the same as Google, so an exact-includes
 * check is right. The bot token never expires (token rotation is off), so —
 * like Notion — a missing refresh token is expected, not a failure.
 */
export function storeSlackTokens(
  db: AppDb,
  crypto: TokenCrypto,
  ctx: StartContext,
  integrationId: string,
  tokens: ProviderTokens,
): Promise<StoreResult> {
  return storeProviderTokens(db, crypto, ctx, integrationId, tokens, {
    requiredScopes: SLACK_SCOPES,
    scopeGranted: (granted, required) => required.every((s) => granted.includes(s)),
    noRefreshMessage: null,
  });
}
/**
 * Persist a successful Composio connection.
 *
 * Composio holds and refreshes the actual OAuth tokens on its side — Kloyya
 * never sees them. What lands here is just the connected_account id, which is
 * enough to call tools through Composio later and enough for the rest of the
 * app (dashboard, Ask Kloyya, the connection manager) to see this as
 * 'connected', because they all read this same table.
 */
export async function storeComposioConnection(
  db: AppDb,
  ctx: StartContext,
  integrationId: string,
  connectedAccountId: string,
): Promise<void> {
  await withTenantScope(db, ctx.organizationId, async (tx) => {
    await tx
      .insert(connections)
      .values({
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        integrationId,
        status: 'connected',
        connectedByUserId: ctx.userId,
        composioConnectedAccountId: connectedAccountId,
        errorReason: null,
      })
      .onConflictDoUpdate({
        target: [connections.workspaceId, connections.integrationId],
        set: {
          status: 'connected',
          connectedByUserId: ctx.userId,
          composioConnectedAccountId: connectedAccountId,
          errorReason: null,
        },
      });
  });
}
/** Put a connection into `error` with a reason a human can act on. */
export async function failConnection(
  db: AppDb,
  ctx: StartContext,
  integrationId: string,
  reason: string,
): Promise<void> {
  await withTenantScope(db, ctx.organizationId, async (tx) => {
    await tx
      .insert(connections)
      .values({
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        integrationId,
        status: 'error',
        connectedByUserId: ctx.userId,
        errorReason: reason,
      })
      .onConflictDoUpdate({
        target: [connections.workspaceId, connections.integrationId],
        set: { status: 'error', errorReason: reason },
      });
  });
}

/** The stored tokens for a connection, decrypted. Never leaves the server. */
export async function readGoogleTokens(
  db: AppDb,
  crypto: TokenCrypto,
  ctx: StartContext,
  integrationId: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const rows = await withTenantScope(db, ctx.organizationId, async (tx) =>
    tx
      .select({
        accessTokenEnc: connections.accessTokenEnc,
        refreshTokenEnc: connections.refreshTokenEnc,
      })
      .from(connections)
      .where(
        and(
          eq(connections.workspaceId, ctx.workspaceId),
          eq(connections.integrationId, integrationId),
        ),
      )
      .limit(1),
  );

  const row = rows[0];
  if (!row?.accessTokenEnc || !row.refreshTokenEnc) return null;

  return {
    accessToken: crypto.decrypt(row.accessTokenEnc),
    refreshToken: crypto.decrypt(row.refreshTokenEnc),
  };
}

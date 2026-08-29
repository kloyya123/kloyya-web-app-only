import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@kloyya/db/client';
import { withTenantScope } from '@kloyya/db/scope';
import { connections } from '@kloyya/db/schema';
import type { TokenCrypto } from '../crypto/tokens';
import { refreshGoogleToken } from './google';
import { AuthRevokedError, type RefreshFn } from './oauth';
import type { StartContext } from './connect';
import { getComposioProxyFetch } from './composio-proxy';

/**
 * Keeping a connection alive.
 *
 * Google's access tokens last about an hour, so after day one a connector runs
 * entirely on this. The refresh token is the long-lived credential; the access
 * token is disposable.
 *
 * Refreshed a minute early on purpose: a token that is valid when we check and
 * expired when Google reads it produces a 401 that looks like revocation and
 * isn't. The skew costs nothing and removes a whole class of phantom failure.
 */
const EXPIRY_SKEW_MS = 60 * 1000;

  const rows = await withTenantScope(db, ctx.organizationId, async (tx) =>
    tx
      .select({
        status: connections.status,
        accessTokenEnc: connections.accessTokenEnc,
        refreshTokenEnc: connections.refreshTokenEnc,
        accessTokenExpiresAt: connections.accessTokenExpiresAt,
        composioConnectedAccountId: connections.composioConnectedAccountId,
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
  if (!row) return { ok: false, reason: 'not_connected' };

  // Composio-managed: Composio holds and refreshes the real provider token.
  // Kloyya only needs the connected_account id to route calls through its
  // proxy — there is nothing local to decrypt or refresh.
  if (row.composioConnectedAccountId) {
    return {
      ok: true,
      accessToken: '__composio_managed__', // unused — the proxy fetch ignores it
      fetchImpl: getComposioProxyFetch(row.composioConnectedAccountId),
    };
  }

  if (!row.accessTokenEnc || !row.refreshTokenEnc) return { ok: false, reason: 'not_connected' };

export interface RefreshDeps {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  /** Injectable so tests don't wait for a real clock. */
  now?: () => number;
  /**
   * How this provider refreshes a token. Defaults to Google, so the three Google
   * connectors need not pass it; Microsoft supplies its own, and a provider whose
   * tokens never expire (Notion) never reaches this path at all.
   */
  refresh?: RefreshFn;
}

/**
 * The access token to call Google with, refreshing it if needed.
 *
 * Callers never touch the stored ciphertext; they ask for a token and get one
 * that works, or a reason it can't. The refreshed token is re-encrypted before
 * it is written back — there is no path here that puts a Google token in the
 * database in the clear.
 */
export async function getValidAccessToken(
  db: AppDb,
  crypto: TokenCrypto,
  ctx: StartContext,
  integrationId: string,
  deps: RefreshDeps,
): Promise<AccessTokenResult> {
  const now = deps.now ?? Date.now;

  const rows = await withTenantScope(db, ctx.organizationId, async (tx) =>
    tx
      .select({
        status: connections.status,
        accessTokenEnc: connections.accessTokenEnc,
        refreshTokenEnc: connections.refreshTokenEnc,
        accessTokenExpiresAt: connections.accessTokenExpiresAt,
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
  if (!row?.accessTokenEnc || !row.refreshTokenEnc) return { ok: false, reason: 'not_connected' };

  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
  const stillFresh = expiresAt - EXPIRY_SKEW_MS > now();
  if (stillFresh) {
    return { ok: true, accessToken: crypto.decrypt(row.accessTokenEnc) };
  }

  const refreshToken = crypto.decrypt(row.refreshTokenEnc);

  const refresh = deps.refresh ?? refreshGoogleToken;
  let refreshed;
  try {
    refreshed = await refresh({
      refreshToken,
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
  } catch (error) {
    if (error instanceof AuthRevokedError) {
      // Permanent, whatever the provider. Park the connection with a reason a
      // person can act on, rather than retrying what will never work again.
      await markRevoked(db, ctx, integrationId);
      return { ok: false, reason: 'revoked' };
    }
    // Transient. Leave the connection alone — it is not broken, the provider was.
    return { ok: false, reason: 'refresh_failed' };
  }

  await withTenantScope(db, ctx.organizationId, async (tx) => {
    await tx
      .update(connections)
      .set({
        accessTokenEnc: crypto.encrypt(refreshed.accessToken),
        accessTokenExpiresAt: refreshed.expiresAt ?? null,
        // Google rotates refresh tokens sometimes. Keeping the old one when a new
        // one arrives means the next refresh fails for no visible reason.
        ...(refreshed.refreshToken
          ? { refreshTokenEnc: crypto.encrypt(refreshed.refreshToken) }
          : {}),
        // A refresh proves the connection works; if it was parked in error, it
        // has recovered.
        ...(row.status === 'error' ? { status: 'connected' as const, errorReason: null } : {}),
      })
      .where(
        and(
          eq(connections.workspaceId, ctx.workspaceId),
          eq(connections.integrationId, integrationId),
        ),
      );
  });

  return { ok: true, accessToken: refreshed.accessToken };
}

/**
 * The stored access token for a provider whose tokens never expire (Notion).
 *
 * There is no refresh token and nothing to refresh, so this is the whole of it:
 * decrypt what we stored, or report the connection isn't there. A revoked Notion
 * grant is discovered at call time — the API returns 401 — not here, because
 * Notion gives us no earlier signal that a token has died.
 */
export async function getStaticAccessToken(
  db: AppDb,
  crypto: TokenCrypto,
  ctx: StartContext,
  integrationId: string,
): Promise
  | { ok: true; accessToken: string; fetchImpl?: typeof fetch }
  | { ok: false; reason: 'not_connected' }
> {
  const rows = await withTenantScope(db, ctx.organizationId, async (tx) =>
    tx
      .select({
        accessTokenEnc: connections.accessTokenEnc,
        composioConnectedAccountId: connections.composioConnectedAccountId,
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
  if (!row) return { ok: false, reason: 'not_connected' };

  if (row.composioConnectedAccountId) {
    return {
      ok: true,
      accessToken: '__composio_managed__',
      fetchImpl: getComposioProxyFetch(row.composioConnectedAccountId),
    };
  }

  if (!row.accessTokenEnc) return { ok: false, reason: 'not_connected' };
  return { ok: true, accessToken: crypto.decrypt(row.accessTokenEnc) };
}

/**
 * Park a connection whose grant is gone, and destroy the tokens with it.
 *
 * They are dead weight the moment Google stops honouring them, and a revoked
 * token kept "just in case" is a secret held for no reason — the user asked us
 * to stop having it.
 */
export async function markRevoked(
  db: AppDb,
  ctx: StartContext,
  integrationId: string,
  reason = 'Google no longer accepts this connection — it was revoked, or the account password changed. Reconnect to resume syncing.',
): Promise<void> {
  await withTenantScope(db, ctx.organizationId, async (tx) => {
    await tx
      .update(connections)
      .set({
        status: 'error',
        errorReason: reason,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        accessTokenExpiresAt: null,
      })
      .where(
        and(
          eq(connections.workspaceId, ctx.workspaceId),
          eq(connections.integrationId, integrationId),
        ),
      );
  });
}

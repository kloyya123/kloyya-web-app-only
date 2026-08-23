import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@server/config';
import { getDeps } from '@server/deps';
import { createTokenCrypto, type TokenCrypto } from '@server/crypto/tokens';
import type { AppDb } from '@kloyya/db/client';
import {
  failConnection,
  storeGoogleTokens,
  storeNotionTokens,
  storeSlackTokens,
  type StartContext,
  type StoreResult,
} from '@server/integrations/connect';
import { exchangeGoogleCode } from '@server/integrations/google';
import { exchangeNotionCode } from '@server/integrations/notion';
import type { ProviderTokens } from '@server/integrations/oauth';
import { exchangeSlackCode } from '@server/integrations/slack';
import { decodeState } from '@server/integrations/state';

type Provider = 'google' | 'notion' | 'slack';

interface ProviderAdapter {
  label: string;
  configured: boolean;
  exchange: (code: string) => Promise<ProviderTokens>;
  store: (
    db: AppDb,
    crypto: TokenCrypto,
    ctx: StartContext,
    integrationId: string,
    tokens: ProviderTokens,
  ) => Promise<StoreResult>;
}

function adapterFor(provider: Provider): ProviderAdapter | null {
  switch (provider) {
    case 'google':
      return {
        label: 'Google',
        configured: Boolean(config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET),
        exchange: (code) =>
          exchangeGoogleCode({
            code,
            clientId: config.GOOGLE_OAUTH_CLIENT_ID!,
            clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET!,
            redirectUri: config.GOOGLE_OAUTH_REDIRECT_URI!,
          }),
        store: storeGoogleTokens,
      };
    case 'notion':
      return {
        label: 'Notion',
        configured: Boolean(config.NOTION_OAUTH_CLIENT_ID && config.NOTION_OAUTH_CLIENT_SECRET),
        exchange: (code) =>
          exchangeNotionCode({
            code,
            clientId: config.NOTION_OAUTH_CLIENT_ID!,
            clientSecret: config.NOTION_OAUTH_CLIENT_SECRET!,
            redirectUri: config.NOTION_OAUTH_REDIRECT_URI!,
          }),
        store: storeNotionTokens,
      };
    case 'slack':
      return {
        label: 'Slack',
        configured: Boolean(config.SLACK_OAUTH_CLIENT_ID && config.SLACK_OAUTH_CLIENT_SECRET),
        exchange: (code) =>
          exchangeSlackCode({
            code,
            clientId: config.SLACK_OAUTH_CLIENT_ID!,
            clientSecret: config.SLACK_OAUTH_CLIENT_SECRET!,
            redirectUri: config.SLACK_OAUTH_REDIRECT_URI!,
          }),
        store: storeSlackTokens,
      };
  }
}

function back(status: string, integration?: string): URL {
  const url = new URL('/connections', config.APP_URL);
  url.searchParams.set('status', status);
  if (integration) url.searchParams.set('integration', integration);
  return url;
}

export async function GET(
  req: NextRequest,
  route: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await route.params;
  const adapter =
    provider === 'google' || provider === 'notion' || provider === 'slack' ? adapterFor(provider) : null;
  if (!adapter) return NextResponse.redirect(back('invalid'));

  const params = req.nextUrl.searchParams;
  const code = params.get('code') ?? undefined;
  const state = params.get('state') ?? undefined;
  const providerError = params.get('error') ?? undefined;

  if (!state) return NextResponse.redirect(back('invalid'));
  if (!config.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(back('unconfigured'));

  const decoded = decodeState(state, config.TOKEN_ENCRYPTION_KEY);
  if (!decoded.ok) {
    return NextResponse.redirect(back(decoded.reason === 'expired' ? 'expired' : 'invalid'));
  }

  const { db } = await getDeps();
  const start: StartContext = {
    userId: decoded.state.userId,
    workspaceId: decoded.state.workspaceId,
    organizationId: decoded.state.organizationId,
  };
  const integrationId = decoded.state.integrationId;

  if (providerError || !code) {
    await failConnection(db, start, integrationId, 'The connection was cancelled before it finished.');
    return NextResponse.redirect(back('cancelled', integrationId));
  }

  if (!adapter.configured) return NextResponse.redirect(back('unconfigured', integrationId));

  try {
    const tokens = await adapter.exchange(code);
    const stored = await adapter.store(
      db,
      createTokenCrypto(config.TOKEN_ENCRYPTION_KEY),
      start,
      integrationId,
      tokens,
    );
    if (!stored.ok) return NextResponse.redirect(back(stored.reason, integrationId));
    return NextResponse.redirect(back('connected', integrationId));
  } catch (error) {
    console.error(`[oauth] ${adapter.label} token exchange failed`, error);
    await failConnection(db, start, integrationId, `${adapter.label} refused the connection. Try again.`);
    return NextResponse.redirect(back('failed', integrationId));
  }
}

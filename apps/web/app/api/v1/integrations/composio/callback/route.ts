import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@server/config';
import { getDeps } from '@server/deps';
import { failConnection, storeComposioConnection, type StartContext } from '@server/integrations/connect';
import { decodeState } from '@server/integrations/state';

function back(status: string, integration?: string): URL {
  const url = new URL('/connections', config.APP_URL);
  url.searchParams.set('status', status);
  if (integration) url.searchParams.set('integration', integration);
  return url;
}

export async function GET(req: NextRequest): Promise<Response> {
  const params = req.nextUrl.searchParams;
  const state = params.get('state') ?? undefined;
  const status = params.get('status') ?? undefined;
  // Composio ajoute ce paramètre en snake_case, voir la doc "Redirecting users
  // after authentication".
  const connectedAccountId = params.get('connected_account_id') ?? undefined;

  if (!state) return NextResponse.redirect(back('invalid'));
  if (!config.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(back('unconfigured'));

  const decoded = decodeState(state, config.TOKEN_ENCRYPTION_KEY);
  if (!decoded.ok) {
    return NextResponse.redirect(back(decoded.reason === 'expired' ? 'expired' : 'invalid'));
  }

  const { db } = await getDeps();
  const ctx: StartContext = {
    userId: decoded.state.userId,
    workspaceId: decoded.state.workspaceId,
    organizationId: decoded.state.organizationId,
  };
  const integrationId = decoded.state.integrationId;

  if (status !== 'success' || !connectedAccountId) {
    await failConnection(db, ctx, integrationId, 'La connexion a été annulée ou refusée avant la fin.');
    return NextResponse.redirect(back('cancelled', integrationId));
  }

  try {
    await storeComposioConnection(db, ctx, integrationId, connectedAccountId);
    return NextResponse.redirect(back('connected', integrationId));
  } catch (error) {
    console.error('[composio callback] failed to store connection', error);
    await failConnection(db, ctx, integrationId, 'Composio a refusé la connexion. Réessaie.');
    return NextResponse.redirect(back('failed', integrationId));
  }
}

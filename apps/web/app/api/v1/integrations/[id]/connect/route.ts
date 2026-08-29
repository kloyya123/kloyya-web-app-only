import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { resolveStartContext } from '@/server/tenant';
import { markConnecting } from '@server/integrations/connect';
import { encodeState } from '@server/integrations/state';
import { config } from '@server/config';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing integration id' }, { status: 400 });
    }

    const composioAppName = id.trim().toUpperCase();

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveStartContext(db, user.id);
    if (!context || !context.organizationId || !context.workspaceId) {
      return NextResponse.json({ error: 'User workspace is not configured' }, { status: 400 });
    }

    const authConfigId = process.env[`COMPOSIO_${composioAppName}_AUTH_CONFIG_ID`] || process.env.COMPOSIO_AUTH_CONFIG_ID;
    if (!authConfigId) {
      return NextResponse.json({ error: `Missing auth config ID for ${composioAppName}` }, { status: 500 });
    }
    if (!config.TOKEN_ENCRYPTION_KEY) {
      return NextResponse.json({ error: 'TOKEN_ENCRYPTION_KEY is not configured' }, { status: 500 });
    }

    // ✅ Marque la connexion "en cours" immédiatement : la page /connections
    // reflète l'état sans attendre le retour de Composio.
    await markConnecting(db, context, id);

    // ✅ state signé (même mécanisme que le flux OAuth natif) : porte
    // userId/workspaceId/organizationId/integrationId à travers l'aller-retour
    // chez Composio, sans dépendre des cookies de session au retour.
    const state = encodeState(
      {
        userId: user.id,
        workspaceId: context.workspaceId,
        organizationId: context.organizationId,
        integrationId: id,
      },
      config.TOKEN_ENCRYPTION_KEY,
    );

    const callbackUrl = new URL('/api/v1/integrations/composio/callback', config.APP_URL);
    callbackUrl.searchParams.set('state', state);

    // ✅ Même identité ("entité") des deux côtés : c'est ce qui manquait.
    const connectionRequest = await getComposioClient().connectedAccounts.link(
      `workspace:${context.workspaceId}`,
      authConfigId,
      callbackUrl.toString(),
    );

    return NextResponse.json({
      success: true,
      integration: id,
      redirectUrl: connectionRequest.redirectUrl,
      connectedAccountId: connectionRequest.connectedAccountId,
    }, { status: 200 });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Composio Connect Error]:', message);
    return NextResponse.json({ error: 'Failed to initiate integration connection', details: message }, { status: 500 });
  }
}

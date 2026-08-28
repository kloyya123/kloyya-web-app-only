import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { resolveStartContext } from '@/server/tenant';

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
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.kloyya.com'}/connections`;

    if (!authConfigId) {
      return NextResponse.json({ error: `Missing auth config ID for ${composioAppName}` }, { status: 500 });
    }

    // ✅ CORRECTION : Appel avec des arguments positionnels comme défini dans composio-client.ts
    const connectionRequest = await getComposioClient().connectedAccounts.link(
      user.id,
      authConfigId,
      redirectUri
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

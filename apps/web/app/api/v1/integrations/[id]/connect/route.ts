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
    const { id } = await params; // ex: 'gmail'
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // 1. Auth Supabase
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Contexte Tenant
    const context = await resolveStartContext(db, user.id);
    if (!context?.workspaceId) return NextResponse.json({ error: 'Workspace missing' }, { status: 400 });

    // 3. Appel Composio
    const composio = getComposioClient();
    // Normalisation stricte pour Composio
    const appNameMap: Record<string, string> = {
      'gmail': 'GMAIL',
      'slack': 'SLACK',
      'notion': 'NOTION',
      'google_drive': 'GOOGLEDRIVE',
      'drive': 'GOOGLEDRIVE'
    };
    const composioAppName = appNameMap[id.toLowerCase()] || id.toUpperCase();

    console.warn(`[Composio] Initiating connection for ${composioAppName} (Entity: workspace:${context.workspaceId})`);

    const connectionRequest = await composio.connectedAccounts.initiate({
      appName: composioAppName,
      entityId: `workspace:${context.workspaceId}`,
    });

    if (!connectionRequest?.redirectUrl) {
      throw new Error('Composio did not return a redirect URL');
    }

    return NextResponse.json({ redirectUrl: connectionRequest.redirectUrl });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Composio Connect Error]:', msg);
    return NextResponse.json({ error: 'Connection failed', details: msg }, { status: 500 });
  }
}

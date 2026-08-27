import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { resolveStartContext } from '@/server/tenant';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: appName } = await params;

    if (!appName) {
      return NextResponse.json({ error: 'appName is required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {}
        }
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[Composio Connect] Unauthorized:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveStartContext(db, user.id);

    if (!ctx || !ctx.organizationId || !ctx.workspaceId) {
      console.error('[Composio Connect] User profile incomplete');
      return NextResponse.json({ error: 'User profile incomplete' }, { status: 400 });
    }

    const composio = getComposioClient();
    const formattedAppName = appName.toUpperCase(); // Composio attend les noms en majuscules
    
    const connectionRequest = await composio.connectedAccounts.initiate({
      appName: formattedAppName,
      entityId: user.id,
    });

    return NextResponse.json({ 
      redirectUrl: connectionRequest.redirectUrl,
      connectedAccountId: connectionRequest.connectedAccountId 
    });

  } catch (error) {
    console.error('[Composio Connect Error] CRITICAL:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

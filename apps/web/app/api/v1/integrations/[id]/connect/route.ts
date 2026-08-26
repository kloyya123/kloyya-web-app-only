import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { users } from '@kloyya/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/v1/integrations/[id]/connect
 * Initie le flux OAuth via Composio pour un outil donné.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[Composio Connect] Step 1: Parsing params');
    const { id: appName } = await params;
    console.log('[Composio Connect] Step 2: appName received =', appName);

    if (!appName) {
      return NextResponse.json({ error: 'appName is required' }, { status: 400 });
    }

    console.log('[Composio Connect] Step 3: Getting user from Supabase');
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
      console.error('[Composio Connect] Step 3 Error: Unauthorized', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Composio Connect] Step 3 Success: user =', user.id);

    console.log('[Composio Connect] Step 4: Getting user record from DB');
    const [userRecord] = await db
      .select({ 
        organizationId: users.organizationId, 
        activeWorkspaceId: users.activeWorkspaceId 
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!userRecord || !userRecord.organizationId || !userRecord.activeWorkspaceId) {
      console.error('[Composio Connect] Step 4 Error: User profile incomplete');
      return NextResponse.json({ error: 'User profile incomplete' }, { status: 400 });
    }
    console.log('[Composio Connect] Step 4 Success: org =', userRecord.organizationId);

    console.log('[Composio Connect] Step 5: Initializing Composio client');
    const composio = getComposioClient();
    
    // ✅ CORRECTION CRITIQUE : Composio attend souvent les noms d'app en MAJUSCULES
    const formattedAppName = appName.toUpperCase();
    console.log('[Composio Connect] Step 6: Calling initiate with appName =', formattedAppName);
    
    const connectionRequest = await composio.connectedAccounts.initiate({
      appName: formattedAppName,
      entityId: user.id,
    });

    console.log('[Composio Connect] Step 7: Success! redirectUrl =', connectionRequest.redirectUrl);

    return NextResponse.json({ 
      redirectUrl: connectionRequest.redirectUrl,
      connectedAccountId: connectionRequest.connectedAccountId 
    });

  } catch (error) {
    console.error('[Composio Connect Error] CRITICAL:', error);
    // On renvoie le message d'erreur exact pour le débogage
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

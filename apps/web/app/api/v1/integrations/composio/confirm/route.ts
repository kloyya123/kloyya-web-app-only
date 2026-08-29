import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { db } from '@kloyya/db';
import { resolveStartContext } from '@/server/tenant';
import { storeComposioConnection } from '@server/integrations/connect';

export async function POST(request: Request) {
  try {
    const { connectedAccountId, integrationId } = await request.json();

    if (!connectedAccountId || !integrationId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
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

    // C'est ICI que la magie opère : on écrit enfin dans la table `connections`
    await storeComposioConnection(db, context, integrationId, connectedAccountId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Composio Confirm API Error]:', error);
    return NextResponse.json({ error: 'Failed to confirm connection' }, { status: 500 });
  }
}

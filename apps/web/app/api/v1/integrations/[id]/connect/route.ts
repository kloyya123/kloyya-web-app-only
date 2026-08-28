import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { initiateComposioConnection } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { resolveStartContext } from '@/server/tenant';

const SUPPORTED_APPS = new Set([
  'gmail',
  'slack',
  'notion',
  'google_drive',
  'googledrive',
  'drive',
]);

function normalizeAppName(value: string): string {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'gmail': return 'GMAIL';
    case 'slack': return 'SLACK';
    case 'notion': return 'NOTION';
    case 'google_drive':
    case 'googledrive':
    case 'drive': return 'GOOGLEDRIVE';
    default: return normalized.toUpperCase();
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing integration id' }, { status: 400 });
    }

    const appId = id.trim().toLowerCase();
    if (!SUPPORTED_APPS.has(appId)) {
      return NextResponse.json(
        { error: 'Unsupported integration', integration: appId, supported: [...SUPPORTED_APPS] },
        { status: 400 }
      );
    }

    // 1. Auth Supabase
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Integration Connect] Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Contexte Tenant
    const context = await resolveStartContext(db, user.id);
    if (!context || !context.organizationId || !context.workspaceId) {
      console.error('[Integration Connect] Missing organization/workspace', { userId: user.id });
      return NextResponse.json({ error: 'User workspace is not configured' }, { status: 400 });
    }

    const composioAppName = normalizeAppName(appId);
    const entityId = `workspace:${context.workspaceId}`;
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.kloyya.com'}/connections`;

    console.warn('[Integration Connect] Initiating OAuth', {
      app: composioAppName,
      workspaceId: context.workspaceId,
    });

    // 3. Appel direct à l'API Composio (sans SDK déprécié)
    const connection = await initiateComposioConnection(composioAppName, entityId, redirectUrl);

    if (!connection.redirectUrl) {
      throw new Error('Composio did not return a redirect URL');
    }

    return NextResponse.json({
      success: true,
      integration: appId,
      redirectUrl: connection.redirectUrl,
      connectedAccountId: connection.connectedAccountId,
    }, { status: 200 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Integration Connect] Failed:', errorMessage);

    return NextResponse.json(
      {
        error: 'Failed to initiate integration connection',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

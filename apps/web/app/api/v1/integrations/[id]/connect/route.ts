import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { resolveStartContext } from '@/server/tenant';

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveStartContext(db, user.id);
    if (!context?.organizationId || !context?.workspaceId) {
      return NextResponse.json({ error: 'User workspace is not configured' }, { status: 400 });
    }

    const composio = getComposioClient();
    const composioAppName = normalizeAppName(id);
    
    // ✅ AJOUT CRUCIAL : Définir l'URL de votre application pour la redirection
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.kloyya.com';
    const redirectUri = `${appUrl}/connections`; // Redirige vers la page des connexions après succès

    // Récupérez l'ID de config approprié (adaptez cette ligne à votre logique de gestion des variables d'environnement)
    const authConfigId = process.env[`COMPOSIO_${composioAppName}_AUTH_CONFIG_ID`] || process.env.COMPOSIO_AUTH_CONFIG_ID;

    const connectionRequest = await composio.connectedAccounts.link({
      user_id: user.id,
      auth_config_id: authConfigId,
      redirectUri: redirectUri, // ou callbackUrl selon la version exacte de votre SDK Composio
    });

    if (!connectionRequest?.redirectUrl) {
      throw new Error('Composio did not return a redirect URL');
    }

    return NextResponse.json({
      success: true,
      integration: id,
      redirectUrl: connectionRequest.redirectUrl,
      connectedAccountId: connectionRequest.connectedAccountId,
    }, { status: 200 });

  } catch (error) {
    console.error('[Composio Connect Error]:', error);
    return NextResponse.json(
      { 
        error: 'Failed to initiate integration connection', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

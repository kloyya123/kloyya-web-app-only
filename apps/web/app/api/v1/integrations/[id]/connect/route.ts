import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { composio } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { users } from '@kloyya/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/v1/integrations/connect
 * Initie le flux OAuth via Composio pour un outil donné (ex: 'slack', 'gmail').
 */
export async function POST(request: NextRequest) {
  try {
    const { appName } = await request.json(); // ex: "slack", "gmail", "notion"

    if (!appName) {
      return NextResponse.json({ error: 'appName is required' }, { status: 400 });
    }

    // 1. Vérifier l'utilisateur connecté
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Récupérer les infos du workspace/org de l'utilisateur
    const [userRecord] = await db
      .select({ organizationId: users.organizationId, activeWorkspaceId: users.activeWorkspaceId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!userRecord) {
      return NextResponse.json({ error: 'User profile incomplete' }, { status: 400 });
    }

    // 3. Demander à Composio d'initier la connexion
    // Composio gère automatiquement le redirect_uri et le stockage sécurisé des tokens
    const connectionRequest = await composio.client.connectedAccounts.initiate({
      appName: appName,
      entityId: user.id, // L'ID de l'utilisateur dans ton système (Supabase)
      // redirectUri est optionnel avec Composio, ils fournissent une page de succès par défaut,
      // mais tu peux en spécifier une si tu veux gérer le retour toi-même.
    });

    // 4. Retourner l'URL de redirection au frontend
    return NextResponse.json({ 
      redirectUrl: connectionRequest.redirectUrl,
      connectedAccountId: connectionRequest.connectedAccountId 
    });

  } catch (error) {
    console.error('[Composio Connect Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { resolveStartContext } from '@/server/tenant';
import { db } from '@kloyya/db';

type PossibleConnection = Record<string, unknown>;

/**
 * GET /api/v1/integrations
 *
 * Returns a small list of connected app names for the current workspace/user.
 * Uses Composio backend to list connected accounts for the workspace.
 */
export async function GET() {
  try {
    // 1. Vérifier l'authentification
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            /* no-op for SSR */
          },
        },
      },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;
    if (!user) {
      return NextResponse.json({ connectedApps: [] }, { status: 200 });
    }

    // 2. Récupérer le contexte workspace
    const context = await resolveStartContext(db, user.id);
    if (!context?.workspaceId) {
      return NextResponse.json({ connectedApps: [] }, { status: 200 });
    }

    // 3. Interroger Composio pour obtenir les comptes connectés
    const composio = getComposioClient();

    const raw = await composio.connectedAccounts.getConnectedAccounts(context.workspaceId);

    // Défensive: Composio peut renvoyer divers formats; s'assurer que c'est un tableau.
    if (!Array.isArray(raw)) {
      // réponse inattendue — journaliser pour debugger et renvoyer une liste vide.
      // eslint-disable-next-line no-console
      console.warn('[GET Integrations] Composio returned non-array response', typeof raw, raw);
      return NextResponse.json({ connectedApps: [] }, { status: 200 });
    }

    // Extraire les noms des apps connectées (ex: ['gmail', 'slack'])
    const connectedApps = raw.flatMap((entry: PossibleConnection) => {
      if (entry && typeof entry === 'object') {
        const maybeName = entry['appName'] ?? entry['app_name'] ?? entry['name'] ?? entry['provider'];
        if (typeof maybeName === 'string' && maybeName.trim() !== '') {
          return [maybeName.toLowerCase()];
        }
      }
      return [];
    });

    return NextResponse.json({ connectedApps }, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET Integrations] Error:', error);
    return NextResponse.json({ connectedApps: [] }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { resolveStartContext } from '@/server/tenant';
import { db } from '@kloyya/db';

export async function GET() {
  try {
    // 1. Vérifier l'authentification
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
    );
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ connectedApps: [] }); // Ou 401 selon ta logique
    }

    // 2. Récupérer le contexte workspace
    const context = await resolveStartContext(db, user.id);
    if (!context?.workspaceId) {
      return NextResponse.json({ connectedApps: [] });
    }

    // 3. Interroger Composio pour obtenir les comptes connectés
    // Note: Adapte cette partie si tu stockes déjà l'info dans ta propre table Drizzle
    const composio = getComposioClient();
    
    // Nous ajoutons une méthode pour lister les connexions (voir Étape 1bis ci-dessous)
    const connections = await composio.getConnectedAccounts(context.workspaceId);
    
    // Extraire les noms des apps connectées (ex: ['gmail', 'slack'])
    const connectedApps = connections.map((c: any) => c.appName?.toLowerCase());

    return NextResponse.json({ connectedApps });

  } catch (error) {
    console.error('[GET Integrations] Error:', error);
    return NextResponse.json({ connectedApps: [] }, { status: 500 });
  }
}

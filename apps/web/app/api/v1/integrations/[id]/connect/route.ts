import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { getComposioClient } from '@/server/integrations/composio-client';
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
    case 'gmail':
      return 'GMAIL';

    case 'slack':
      return 'SLACK';

    case 'notion':
      return 'NOTION';

    case 'google_drive':
    case 'googledrive':
    case 'drive':
      return 'GOOGLEDRIVE';

    default:
      return normalized.toUpperCase();
  }
}

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          error: 'Missing integration id',
        },
        { status: 400 },
      );
    }

    const appId = id.trim().toLowerCase();

    if (!SUPPORTED_APPS.has(appId)) {
      return NextResponse.json(
        {
          error: 'Unsupported integration',
          integration: appId,
          supported: [...SUPPORTED_APPS],
        },
        { status: 400 },
      );
    }

    /*
     * ---------------------------------------------------------
     * 1. Authentification Supabase
     * ---------------------------------------------------------
     */

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
            // Les cookies de session sont gérés par le middleware.
          },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Integration Connect] Unauthorized');

      return NextResponse.json(
        {
          error: 'Unauthorized',
        },
        { status: 401 },
      );
    }

    /*
     * ---------------------------------------------------------
     * 2. Contexte tenant
     * ---------------------------------------------------------
     */

    const context = await resolveStartContext(db, user.id);

    if (
      !context ||
      !context.organizationId ||
      !context.workspaceId
    ) {
      console.error(
        '[Integration Connect] Missing organization/workspace',
        {
          userId: user.id,
        },
      );

      return NextResponse.json(
        {
          error: 'User workspace is not configured',
        },
        { status: 400 },
      );
    }

    /*
     * ---------------------------------------------------------
     * 3. Composio
     * ---------------------------------------------------------
     */

    const composio = getComposioClient();

    const composioAppName = normalizeAppName(appId);

    /*
     * IMPORTANT :
     *
     * entityId identifie le compte/application Composio
     * appartenant à cet utilisateur.
     *
     * On utilise une valeur stable par workspace plutôt que
     * d'utiliser directement l'ID utilisateur.
     */

    const entityId = `workspace:${context.workspaceId}`;

    console.info('[Integration Connect] Initiating OAuth', {
      app: composioAppName,
      workspaceId: context.workspaceId,
      organizationId: context.organizationId,
    });

    const connectionRequest =
      await composio.connectedAccounts.initiate({
        appName: composioAppName,
        entityId,
      });

    if (!connectionRequest?.redirectUrl) {
      console.error(
        '[Integration Connect] Composio returned no redirect URL',
      );

      return NextResponse.json(
        {
          error: 'Composio did not return an OAuth URL',
        },
        { status: 502 },
      );
    }

    /*
     * ---------------------------------------------------------
     * 4. Réponse frontend
     * ---------------------------------------------------------
     */

    return NextResponse.json(
      {
        success: true,
        integration: appId,
        redirectUrl: connectionRequest.redirectUrl,
        connectedAccountId:
          connectionRequest.connectedAccountId ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      '[Integration Connect] Failed to initiate OAuth',
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown integration error';

    return NextResponse.json(
      {
        error: 'Failed to initiate integration connection',
        details:
          process.env.NODE_ENV === 'development'
            ? message
            : undefined,
      },
      { status: 500 },
    );
  }
}

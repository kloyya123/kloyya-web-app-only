import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getComposioClient } from '@/server/integrations/composio-client';
import { db } from '@kloyya/db';
import { resolveStartContext } from '@/server/tenant';

const AUTH_CONFIG_IDS: Record<string, string | undefined> = {
  gmail: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
  slack: process.env.COMPOSIO_SLACK_AUTH_CONFIG_ID,
  notion: process.env.COMPOSIO_NOTION_AUTH_CONFIG_ID,
  drive: process.env.COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const appName = id.toLowerCase();

    if (!appName) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    const authConfigId = AUTH_CONFIG_IDS[appName];

    if (!authConfigId) {
      console.error(
        `[Composio Connect] Missing auth config for integration: ${appName}`
      );

      return NextResponse.json(
        {
          error: `No Composio auth config configured for ${appName}`,
        },
        { status: 500 }
      );
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(
        '[Composio Connect] Unauthorized:',
        userError
      );

      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const ctx = await resolveStartContext(db, user.id);

    if (!ctx?.organizationId || !ctx?.workspaceId) {
      console.error(
        '[Composio Connect] User profile incomplete'
      );

      return NextResponse.json(
        { error: 'User profile incomplete' },
        { status: 400 }
      );
    }

    console.warn('[Composio Connect] Initiating OAuth', {
      app: appName,
      userId: user.id,
      workspaceId: ctx.workspaceId,
    });

    const composio = getComposioClient();

    /*
     * Composio-managed OAuth:
     * use connectedAccounts.link()
     *
     * This requires:
     * - userId
     * - authConfigId
     */
    const connectionRequest =
      await composio.connectedAccounts.link(
        user.id,
        authConfigId
      );

    return NextResponse.json({
      redirectUrl: connectionRequest.redirectUrl,
      connectedAccountId:
        connectionRequest.connectedAccountId,
    });
  } catch (error) {
    console.error(
      '[Composio Connect Error] CRITICAL:',
      error
    );

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}

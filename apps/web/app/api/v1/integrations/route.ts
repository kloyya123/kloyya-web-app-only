import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getComposioClient } from "@/server/integrations/composio-client";
import { resolveStartContext } from "@/server/tenant";
import { db } from "@kloyya/db";

type PossibleConnection = {
  id?: string;
  user_id?: string;
  status?: string;
  toolkit?: {
    slug?: string;
  };
  created_at?: string;
  updated_at?: string;
  status_reason?: string;
};

const CONNECTED_STATUSES = new Set([
  "ACTIVE",
  "CONNECTED",
  "INITIALIZING",
  "SYNCING",
]);

export async function GET() {
  try {
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
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { connections: [], connectedApps: [], total: 0, connected: 0 },
        { status: 200 },
      );
    }

    const context = await resolveStartContext(db, user.id);

    if (!context?.workspaceId) {
      console.warn("[GET Integrations] No workspace found for user:", user.id);
      return NextResponse.json(
        { connections: [], connectedApps: [], total: 0, connected: 0 },
        { status: 200 },
      );
    }

    const workspaceId = context.workspaceId;
    const composio = getComposioClient();
    const rawAccounts = await composio.connectedAccounts.getConnectedAccounts(workspaceId);

    const accounts: PossibleConnection[] = Array.isArray(rawAccounts.items)
      ? rawAccounts.items
      : [];

    const connections = accounts
      .map((account) => {
        const toolkitId = account.toolkit?.slug;
        if (!toolkitId) return null;

        const normalizedStatus =
          typeof account.status === "string" ? account.status.toUpperCase() : "UNKNOWN";

        let status:
          | "connected" | "connecting" | "syncing" | "error" | "paused" | "not_connected";

        switch (normalizedStatus) {
          case "ACTIVE":
          case "CONNECTED":
            status = "connected";
            break;
          case "INITIALIZING":
          case "PENDING":
            status = "connecting";
            break;
          case "SYNCING":
            status = "syncing";
            break;
          case "FAILED":
          case "ERROR":
            status = "error";
            break;
          case "DISABLED":
          case "PAUSED":
            status = "paused";
            break;
          default:
            status = "not_connected";
        }

        return {
          definition: { id: toolkitId, name: toolkitId },
          status,
          lastSyncedAt: account.updated_at ?? account.created_at ?? null,
          errorReason: account.status_reason ?? null,
          connectedAccountId: account.id ?? null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const uniqueConnections = Array.from(
      new Map(connections.map((c) => [c.definition.id, c])).values(),
    );

    const connectedApps = uniqueConnections
      .filter((c) => c.status === "connected")
      .map((c) => c.definition.id);

    return NextResponse.json(
      {
        connections: uniqueConnections,
        connectedApps,
        total: uniqueConnections.length,
        connected: connectedApps.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[GET Integrations] Error:", error);
    return NextResponse.json(
      { connections: [], connectedApps: [], total: 0, connected: 0, error: "Impossible de récupérer les intégrations." },
      { status: 500 },
    );
  }
}

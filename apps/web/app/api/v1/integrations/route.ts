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
    // ---------------------------------------------------------
    // 1. Authentification Supabase
    // ---------------------------------------------------------

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
            // Les cookies sont uniquement lus ici.
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          connections: [],
          connectedApps: [],
          total: 0,
          connected: 0,
        },
        { status: 200 },
      );
    }

    // ---------------------------------------------------------
    // 2. Résoudre le workspace
    // ---------------------------------------------------------

    const context = await resolveStartContext(db, user.id);

    if (!context?.workspaceId) {
      return NextResponse.json(
        {
          connections: [],
          connectedApps: [],
          total: 0,
          connected: 0,
        },
        { status: 200 },
      );
    }

    // ---------------------------------------------------------
    // 3. Lire Composio avec LE USER ID
    // ---------------------------------------------------------

    const composio = getComposioClient();

    const rawAccounts =
      await composio.connectedAccounts.getConnectedAccounts(user.id);

    const accounts: PossibleConnection[] = Array.isArray(rawAccounts)
      ? rawAccounts
      : [];

    // ---------------------------------------------------------
    // 4. Transformer Composio -> Kloyya
    // ---------------------------------------------------------

    const connections = accounts
      .map((account) => {
        const toolkitId = account.toolkit?.slug;

        if (!toolkitId) {
          return null;
        }

        const normalizedStatus =
          typeof account.status === "string"
            ? account.status.toUpperCase()
            : "UNKNOWN";

        let status:
          | "connected"
          | "connecting"
          | "syncing"
          | "error"
          | "paused"
          | "not_connected";

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
          definition: {
            id: toolkitId,
            name: toolkitId,
          },
          status,
          lastSyncedAt:
            account.updated_at ??
            account.created_at ??
            null,
          errorReason:
            account.status_reason ??
            null,
          connectedAccountId:
            account.id ??
            null,
        };
      })
      .filter(Boolean);

    // ---------------------------------------------------------
    // 5. Dédupliquer par intégration
    // ---------------------------------------------------------

    const uniqueConnections = Array.from(
      new Map(
        connections.map((connection) => [
          connection!.definition.id,
          connection,
        ]),
      ).values(),
    ).filter(Boolean);

    const connectedApps = uniqueConnections
      .filter((connection) =>
        CONNECTED_STATUSES.has(
          accounts.find(
            (account) =>
              account.toolkit?.slug ===
              connection!.definition.id,
          )?.status ?? "",
        ),
      )
      .map((connection) => connection!.definition.id);

    // ---------------------------------------------------------
    // 6. Réponse API
    // ---------------------------------------------------------

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
      {
        connections: [],
        connectedApps: [],
        total: 0,
        connected: 0,
        error: "Impossible de récupérer les intégrations.",
      },
      { status: 500 },
    );
  }
}

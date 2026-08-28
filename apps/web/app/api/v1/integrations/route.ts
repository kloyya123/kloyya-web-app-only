
import { N
extResponse } from "next/server";
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
    // 2. Résoudre le workspace Kloyya
    // ---------------------------------------------------------

    const context = await resolveStartContext(db, user.id);

    if (!context?.workspaceId) {
      console.warn(
        "[GET Integrations] No workspace found for user:",
        user.id,
      );

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

    const workspaceId = context.workspaceId;

    // ---------------------------------------------------------
    // 3. Récupérer les comptes Composio du WORKSPACE
    // ---------------------------------------------------------

    const composio = getComposioClient();

    const rawAccounts = await composio.connectedAccounts.getConnectedAccounts(
      workspaceId,
    );

    // Composio v3 retourne :
    //
    // {
    //   items: [...],
    //   next_cursor: "...",
    //   total_items: 1,
    //   ...
    // }
    //
    // et non directement un tableau.
    const accounts: PossibleConnection[] = Array.isArray(
      rawAccounts.items,
    )
      ? rawAccounts.items
      : [];

    console.info("[GET Integrations] Composio accounts:", {
      userId: user.id,
      workspaceId,
      count: accounts.length,
      accounts: accounts.map((account) => ({
        id: account.id,
        user_id: account.user_id,
        toolkit: account.toolkit?.slug,
        status: account.status,
      })),
    });

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
          errorReason: account.status_reason ?? null,
          connectedAccountId: account.id ?? null,
        };
      })
      .filter(
        (
          connection,
        ): connection is NonNullable<typeof connection> =>
          connection !== null,
      );

    // ---------------------------------------------------------
    // 5. Dédupliquer par toolkit
    // ---------------------------------------------------------

    const uniqueConnections = Array.from(
      new Map(
        connections.map((connection) => [
          connection.definition.id,
          connection,
        ]),
      ).values(),
    );

    // ---------------------------------------------------------
    // 6. Calculer les applications connectées
    // ---------------------------------------------------------

    const connectedApps = uniqueConnections
      .filter((connection) => connection.status === "connected")
      .map((connection) => connection.definition.id);

    // ---------------------------------------------------------
    // 7. Réponse API
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
```

### `server/integrations/composio-client.ts`

```ts
/**
 * Client Composio utilisant l'API v3 officielle.
 *
 * Responsabilités :
 * - démarrer une connexion OAuth ;
 * - récupérer les comptes connectés ;
 * - fournir une interface serveur unique à Kloyya.
 *
 * IMPORTANT :
 * Ce fichier est server-only.
 * COMPOSIO_API_KEY ne doit jamais être exposée au navigateur.
 */

const COMPOSIO_BASE_URL = "https://backend.composio.dev/api/v3";

type ComposioResponse = Record<string, unknown>;

type FetchOptions = RequestInit & {
  headers?: Record<string, string>;
};

function getApiKey(): string {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error(
      "COMPOSIO_API_KEY is not configured in environment variables",
    );
  }

  return apiKey;
}

async function composioFetch(
  path: string,
  options: FetchOptions = {},
): Promise<ComposioResponse> {
  const apiKey = getApiKey();

  const response = await fetch(`${COMPOSIO_BASE_URL}${path}`, {
    ...options,
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Composio API error: HTTP ${response.status} - ${errorText}`,
    );
  }

  return (await response.json()) as ComposioResponse;
}

function getString(
  object: ComposioResponse | undefined,
  ...keys: string[]
): string | null {
  if (!object) {
    return null;
  }

  for (const key of keys) {
    const value = object[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return null;
}

function getNestedString(
  object: ComposioResponse,
  ...paths: string[][]
): string | null {
  for (const path of paths) {
    let current: unknown = object;

    for (const key of path) {
      if (
        !current ||
        typeof current !== "object" ||
        !(key in current)
      ) {
        current = undefined;
        break;
      }

      current = (current as Record<string, unknown>)[key];
    }

    if (
      typeof current === "string" &&
      current.trim() !== ""
    ) {
      return current;
    }
  }

  return null;
}

export function getComposioClient() {
  return {
    connectedAccounts: {
      /**
       * Crée un lien de session d'authentification OAuth.
       */
      async link(
        userId: string,
        authConfigId: string,
        redirectUri?: string,
      ) {
        const payload: Record<string, string> = {
          user_id: userId,
          auth_config_id: authConfigId,
        };

        if (redirectUri) {
          payload.callback_url = redirectUri;
        }

        const data = await composioFetch(
          "/connected_accounts/link",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );

        const redirectUrl =
          getString(
            data,
            "redirectUrl",
            "redirect_url",
            "link",
            "url",
          ) ??
          getNestedString(
            data,
            ["data", "redirectUrl"],
            ["data", "redirect_url"],
            ["data", "link"],
            ["data", "url"],
          );

        const connectedAccountId =
          getString(
            data,
            "connectedAccountId",
            "connected_account_id",
          ) ??
          getNestedString(
            data,
            ["data", "connectedAccountId"],
            ["data", "connected_account_id"],
          );

        if (!redirectUrl) {
          throw new Error(
            `Composio returned no redirect URL. Response: ${JSON.stringify(
              data,
            )}`,
          );
        }

        return {
          redirectUrl,
          connectedAccountId,
        };
      },

      /**
       * Récupère les comptes connectés d'un workspace.
       *
       * IMPORTANT :
       * Composio v3 retourne un objet avec `items`.
       *
       * Exemple :
       * {
       *   items: [...],
       *   next_cursor: "...",
       *   total_items: 1
       * }
       */
      async getConnectedAccounts(workspaceId: string) {
        return composioFetch(
          `/connected_accounts?entity_id=${encodeURIComponent(
            `workspace:${workspaceId}`,
          )}`,
          {
            method: "GET",
          },
        );
      },
    },
  };
}


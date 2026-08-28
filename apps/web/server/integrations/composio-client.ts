
/**
 * Client Composio utilisant l'API v3 officielle.
 *
 * Responsabilités :
 * - démarrer une connexion OAuth ;
 * - récupérer les comptes connectés ;
 * - fournir une interface serveur unique à Kloyya.
 *
 * IMPORTANT :
 * Ce fichier est server-only. La clé COMPOSIO_API_KEY ne doit jamais
 * être exposée au navigateur.
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

    if (typeof current === "string" && current.trim() !== "") {
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

        /**
         * Composio peut exposer l'URL sous plusieurs formats selon
         * la version/API utilisée.
         */
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
            `Composio returned no redirect URL. Response: ${JSON.stringify(data)}`,
          );
        }

        return {
          redirectUrl,
          connectedAccountId,
        };
      },

      /**
       * Récupère les comptes connectés pour un workspace.
       *
       * Le backend Kloyya utilise ici l'entity_id associée au workspace.
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

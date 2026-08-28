/**
 * Client Composio — API v3 officielle.
 *
 * Les connexions sont liées au user_id Composio.
 * Kloyya utilise l'id Supabase de l'utilisateur comme identité Composio.
 */

const COMPOSIO_BASE_URL = "https://backend.composio.dev/api/v3";

type ComposioConnectedAccount = {
  id?: string;
  user_id?: string;
  status?: string;
  toolkit?: {
    slug?: string;
  };
  auth_config?: {
    id?: string;
  };
  created_at?: string;
  updated_at?: string;
  status_reason?: string;
};

type ComposioConnectedAccountsResponse = {
  items?: ComposioConnectedAccount[];
  next_cursor?: string;
  total_items?: number;
};

export function getComposioClient() {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error(
      "COMPOSIO_API_KEY is not configured in environment variables",
    );
  }

  async function composioFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${COMPOSIO_BASE_URL}${path}`, {
      ...options,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    });
  }

  return {
    connectedAccounts: {
      /**
       * Crée une session OAuth Composio.
       */
      async link(
        userId: string,
        authConfigId: string,
        redirectUri?: string,
      ) {
        const payload: {
          user_id: string;
          auth_config_id: string;
          callback_url?: string;
        } = {
          user_id: userId,
          auth_config_id: authConfigId,
        };

        if (redirectUri) {
          payload.callback_url = redirectUri;
        }

        const res = await composioFetch("/connected_accounts/link", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();

          throw new Error(
            `Composio API error: HTTP ${res.status} - ${errorText}`,
          );
        }

        const data = await res.json();

        const redirectUrl =
          data?.redirect_url ??
          data?.redirectUrl ??
          data?.data?.redirect_url ??
          data?.data?.redirectUrl ??
          data?.link ??
          data?.url;

        const connectedAccountId =
          data?.connected_account_id ??
          data?.connectedAccountId ??
          data?.data?.connected_account_id ??
          data?.data?.connectedAccountId ??
          null;

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
       * Liste les comptes connectés pour un utilisateur Kloyya.
       *
       * IMPORTANT :
       * Le compte Composio est créé avec user_id.
       * On doit donc utiliser user_ids ici et non entity_id=workspace:...
       */
      async getConnectedAccounts(userId: string) {
        const params = new URLSearchParams();

        params.set("user_ids", userId);
        params.set("limit", "100");

        const res = await composioFetch(
          `/connected_accounts?${params.toString()}`,
        );

        if (!res.ok) {
          const errorText = await res.text();

          throw new Error(
            `Composio API error fetching accounts: HTTP ${res.status} - ${errorText}`,
          );
        }

        const data =
          (await res.json()) as ComposioConnectedAccountsResponse;

        return Array.isArray(data?.items) ? data.items : [];
      },
    },
  };
}

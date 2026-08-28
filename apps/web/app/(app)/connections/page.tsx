"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Check,
  ChevronRight,
  Loader2,
  Plug,
  RefreshCw,
  Search,
  Unplug,
  AlertCircle,
  Pause,
} from "lucide-react";

type IntegrationStatus =
  | "not_connected"
  | "connecting"
  | "syncing"
  | "connected"
  | "paused"
  | "error";

type IntegrationDefinition = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon: string;
  enabled?: boolean;
};

type IntegrationConnection = {
  definition: IntegrationDefinition;
  status: IntegrationStatus;
  lastSyncedAt?: string | null;
  errorReason?: string | null;
};

const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Email, conversations et messages",
    category: "Communication",
    icon: "/icons/gmail.svg",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Pages, bases de données et connaissances",
    category: "Productivité",
    icon: "/icons/notion.svg",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Messages et communication d'équipe",
    category: "Communication",
    icon: "/icons/slack.svg",
  },
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Fichiers et documents",
    category: "Stockage",
    icon: "/icons/google-drive.svg",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Messages et conversations",
    category: "Communication",
    icon: "/icons/whatsapp.svg",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Messages et activité sociale",
    category: "Réseaux sociaux",
    icon: "/icons/instagram.svg",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Réseau professionnel et messages",
    category: "Réseaux sociaux",
    icon: "/icons/linkedin.svg",
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Pages, messages et activité sociale",
    category: "Réseaux sociaux",
    icon: "/icons/facebook.svg",
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Emails et calendrier Microsoft",
    category: "Communication",
    icon: "/icons/outlook.svg",
  },
  {
    id: "odoo",
    name: "Odoo",
    description: "ERP et gestion d'entreprise",
    category: "Business",
    icon: "/icons/odoo.svg",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM, ventes et marketing",
    category: "CRM",
    icon: "/icons/hubspot.svg",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Calendriers et événements",
    category: "Productivité",
    icon: "/icons/google-calendar.svg",
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Feuilles de calcul et données",
    category: "Productivité",
    icon: "/icons/google-sheets.svg",
  },
  {
    id: "google_docs",
    name: "Google Docs",
    description: "Documents et rédaction",
    category: "Productivité",
    icon: "/icons/google-docs.svg",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Bases de données et workflows",
    category: "Productivité",
    icon: "/icons/airtable.svg",
  },
  {
    id: "google_tasks",
    name: "Google Tasks",
    description: "Tâches et listes",
    category: "Productivité",
    icon: "/icons/google-tasks.svg",
  },
  {
    id: "todoist",
    name: "Todoist",
    description: "Gestion des tâches",
    category: "Productivité",
    icon: "/icons/todoist.svg",
  },
  {
    id: "microsoft_teams",
    name: "Microsoft Teams",
    description: "Collaboration et communication",
    category: "Communication",
    icon: "/icons/microsoft-teams.svg",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Boutique et commandes",
    category: "Commerce",
    icon: "/icons/shopify.svg",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Stockage de fichiers Microsoft",
    category: "Stockage",
    icon: "/icons/onedrive.svg",
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Réunions et visioconférences",
    category: "Communication",
    icon: "/icons/zoom.svg",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "CRM et gestion commerciale",
    category: "CRM",
    icon: "/icons/salesforce.svg",
  },
  {
    id: "clickup",
    name: "ClickUp",
    description: "Projets, tâches et workflows",
    category: "Productivité",
    icon: "/icons/clickup.svg",
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing et campagnes",
    category: "Marketing",
    icon: "/icons/mailchimp.svg",
  },
  {
    id: "google_meets",
    name: "Google Meet",
    description: "Réunions vidéo",
    category: "Communication",
    icon: "/icons/google-meets.svg",
  },
  {
    id: "zoho",
    name: "Zoho",
    description: "Applications business",
    category: "Business",
    icon: "/icons/zoho.svg",
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    description: "CRM et pipeline commercial",
    category: "CRM",
    icon: "/icons/pipedrive.svg",
  },
  {
    id: "meta_ads",
    name: "Meta Ads",
    description: "Publicités Facebook et Instagram",
    category: "Marketing",
    icon: "/icons/meta-ads.svg",
  },
  {
    id: "canva",
    name: "Canva",
    description: "Création graphique et contenu",
    category: "Création",
    icon: "/icons/canva.svg",
  },
];

function formatDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: IntegrationStatus) {
  switch (status) {
    case "connected":
      return "Connecté";
    case "connecting":
      return "Connexion...";
    case "syncing":
      return "Synchronisation...";
    case "paused":
      return "En pause";
    case "error":
      return "Erreur";
    default:
      return "Non connecté";
  }
}

function statusClass(status: IntegrationStatus) {
  switch (status) {
    case "connected":
      return "text-emerald-600 bg-emerald-50 border-emerald-100";
    case "connecting":
    case "syncing":
      return "text-blue-600 bg-blue-50 border-blue-100";
    case "paused":
      return "text-amber-600 bg-amber-50 border-amber-100";
    case "error":
      return "text-red-600 bg-red-50 border-red-100";
    default:
      return "text-slate-500 bg-slate-50 border-slate-200";
  }
}

function mergeConnections(
  remoteConnections: IntegrationConnection[],
): IntegrationConnection[] {
  const remoteMap = new Map(
    remoteConnections.map((connection) => [
      connection.definition.id,
      connection,
    ]),
  );

  return INTEGRATIONS.map((definition) => {
    const remote = remoteMap.get(definition.id);

    if (remote) {
      return {
        ...remote,
        definition: {
          ...definition,
          ...remote.definition,
        },
      };
    }

    return {
      definition,
      status: "not_connected",
      lastSyncedAt: null,
      errorReason: null,
    };
  });
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConnections(showRefresh = false) {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const response = await fetch("/api/v1/integrations", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Impossible de récupérer les connexions (${response.status})`,
        );
      }

      const data = await response.json();

      const remoteConnections: IntegrationConnection[] = Array.isArray(
        data?.connections,
      )
        ? data.connections
        : Array.isArray(data?.integrations)
          ? data.integrations
          : Array.isArray(data?.connectedApps)
            ? data.connectedApps
            : [];

      setConnections(mergeConnections(remoteConnections));
    } catch (err) {
      console.error("[Connections] load failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les intégrations.",
      );

      // Même si l'API est momentanément indisponible,
      // on affiche le catalogue Kloyya.
      setConnections(
        INTEGRATIONS.map((definition) => ({
          definition,
          status: "not_connected",
          lastSyncedAt: null,
          errorReason: null,
        })),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  const categories = useMemo(() => {
    const values = connections
      .map((connection) => connection.definition.category)
      .filter((value): value is string => Boolean(value));

    return ["Toutes", ...Array.from(new Set(values))];
  }, [connections]);

  const filteredConnections = useMemo(() => {
    const query = search.trim().toLowerCase();

    return connections.filter((connection) => {
      const matchesSearch =
        !query ||
        connection.definition.name.toLowerCase().includes(query) ||
        connection.definition.description?.toLowerCase().includes(query) ||
        connection.definition.category?.toLowerCase().includes(query);

      const matchesCategory =
        category === "Toutes" ||
        connection.definition.category === category;

      return matchesSearch && matchesCategory;
    });
  }, [connections, search, category]);

  const connectedCount = connections.filter(
    (connection) => connection.status === "connected",
  ).length;

  const availableCount = connections.length - connectedCount;

  async function handleConnect(id: string) {
    try {
      setBusyId(id);
      setError(null);

      setConnections((current) =>
        current.map((connection) =>
          connection.definition.id === id
            ? { ...connection, status: "connecting" }
            : connection,
        ),
      );

      const response = await fetch(`/api/v1/integrations/${id}/connect`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Impossible de connecter ${id}.`,
        );
      }

      const redirectUrl =
        data?.redirectUrl ||
        data?.redirect_url ||
        data?.connectionUrl ||
        data?.connection_url ||
        data?.url;

      if (!redirectUrl) {
        throw new Error(
          "Le serveur n'a pas retourné d'URL de connexion.",
        );
      }

      window.location.assign(redirectUrl);
    } catch (err) {
      console.error("[Connections] connect failed:", err);

      setConnections((current) =>
        current.map((connection) =>
          connection.definition.id === id
            ? { ...connection, status: "error" }
            : connection,
        ),
      );

      setError(
        err instanceof Error
          ? err.message
          : "Impossible de démarrer la connexion.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisconnect(id: string) {
    try {
      setBusyId(id);
      setError(null);

      const response = await fetch(
        `/api/v1/integrations/${id}/disconnect`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Impossible de déconnecter ${id}.`,
        );
      }

      setConnections((current) =>
        current.map((connection) =>
          connection.definition.id === id
            ? {
                ...connection,
                status: "not_connected",
                lastSyncedAt: null,
                errorReason: null,
              }
            : connection,
        ),
      );
    } catch (err) {
      console.error("[Connections] disconnect failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Impossible de déconnecter cette intégration.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReconnect(id: string) {
    await handleConnect(id);
  }

  async function handleSync(id: string) {
    try {
      setBusyId(id);
      setError(null);

      setConnections((current) =>
        current.map((connection) =>
          connection.definition.id === id
            ? { ...connection, status: "syncing" }
            : connection,
        ),
      );

      const response = await fetch(
        `/api/v1/integrations/${id}/sync`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Impossible de synchroniser ${id}.`,
        );
      }

      await loadConnections(true);
    } catch (err) {
      console.error("[Connections] sync failed:", err);

      setConnections((current) =>
        current.map((connection) =>
          connection.definition.id === id
            ? { ...connection, status: "error" }
            : connection,
        ),
      );

      setError(
        err instanceof Error
          ? err.message
          : "Impossible de synchroniser cette intégration.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              <Plug className="h-3.5 w-3.5" />
              Centre des connexions
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Intégrations
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Connectez les outils de votre entreprise à Kloyya pour permettre
              à votre chef de cabinet IA de travailler avec vos données,
              applications et workflows.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadConnections(true)}
            disabled={refreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Actualiser
          </button>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Intégrations</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {connections.length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
            <p className="text-sm text-emerald-700">Connectées</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">
              {connectedCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Disponibles</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {availableCount}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
             Une action n&apos;a pas pu être terminée.
              </p>
              <p className="mt-0.5 text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une intégration..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  category === item
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Catalogue */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div
                key={index}
                className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300" />
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Aucune intégration trouvée
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Essayez une autre recherche ou une autre catégorie.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredConnections.map((connection) => {
              const {
                definition,
                status,
                lastSyncedAt,
                errorReason,
              } = connection;

              const isBusy = busyId === definition.id;

              return (
                <article
                  key={definition.id}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm">
                        <Image
                          src={definition.icon}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 object-contain"
                          unoptimized
                        />
                      </div>

                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-slate-950">
                          {definition.name}
                        </h2>

                        {definition.category && (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {definition.category}
                          </p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClass(
                        status,
                      )}`}
                    >
                      {statusLabel(status)}
                    </span>
                  </div>

                  <p className="mt-5 min-h-[40px] text-sm leading-5 text-slate-500">
                    {definition.description}
                  </p>

                  {status === "connected" && lastSyncedAt && (
                    <p className="mt-3 text-xs text-slate-400">
                      Dernière synchronisation :{" "}
                      {formatDate(lastSyncedAt) ?? "inconnue"}
                    </p>
                  )}

                  {status === "error" && errorReason && (
                    <p className="mt-3 line-clamp-2 text-xs text-red-500">
                      {errorReason}
                    </p>
                  )}

                  <div className="mt-5 flex items-center gap-2">
                    {status === "not_connected" && (
                      <button
                        type="button"
                        onClick={() => void handleConnect(definition.id)}
                        disabled={isBusy}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plug className="h-4 w-4" />
                        )}
                        Connecter
                      </button>
                    )}

                    {status === "connecting" && (
                      <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 text-sm font-medium text-blue-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Connexion en cours...
                      </div>
                    )}

                    {status === "syncing" && (
                      <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 text-sm font-medium text-blue-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Synchronisation...
                      </div>
                    )}

                    {status === "connected" && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleSync(definition.id)}
                          disabled={isBusy}
                          title="Synchroniser"
                          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Synchroniser
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDisconnect(definition.id)}
                          disabled={isBusy}
                          title="Déconnecter"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Unplug className="h-4 w-4" />
                        </button>
                      </>
                    )}

                    {status === "paused" && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleReconnect(definition.id)}
                          disabled={isBusy}
                          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Plug className="h-4 w-4" />
                          Reconnecter
                        </button>

                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
                          <Pause className="h-4 w-4" />
                        </div>
                      </>
                    )}

                    {status === "error" && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleReconnect(definition.id)}
                          disabled={isBusy}
                          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Reconnecter
                        </button>
                      </>
                    )}
                  </div>

                  {status === "connected" && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <Check className="h-3.5 w-3.5" />
                      Kloyya peut utiliser cette connexion
                    </div>
                  )}

                  {status === "not_connected" && (
                    <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
                      Configurer cette intégration
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}


"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ConnectionsCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [message, setMessage] = useState(
    "Vérification de votre connexion...",
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifyConnection() {
      try {
        const status = searchParams.get("status");
        const errorParam = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        // OAuth a explicitement échoué.
        if (status === "error" || errorParam) {
          throw new Error(
            errorDescription ||
              errorParam ||
              "La connexion n'a pas pu être finalisée.",
          );
        }

        setMessage("Connexion reçue. Vérification en cours...");

        /*
         * Composio finalise normalement la connexion côté serveur.
         * On laisse donc quelques instants au backend pour enregistrer
         * le Connected Account avant de demander la liste actualisée.
         */
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (cancelled) return;

          try {
            const response = await fetch("/api/v1/integrations", {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              cache: "no-store",
            });

            if (response.ok) {
              const data = await response.json();

              const connections = Array.isArray(data?.connections)
                ? data.connections
                : Array.isArray(data?.integrations)
                  ? data.integrations
                  : [];

              const hasConnectedIntegration = connections.some(
                (connection: {
                  status?: string;
                  definition?: { id?: string };
                }) =>
                  connection?.status === "connected" ||
                  connection?.status === "syncing",
              );

              if (hasConnectedIntegration) {
                if (!cancelled) {
                  setMessage("Connexion réussie. Retour aux intégrations...");
                }

                await new Promise((resolve) =>
                  setTimeout(resolve, 500),
                );

                if (!cancelled) {
                  router.replace("/connections");
                  router.refresh();
                }

                return;
              }
            }
          } catch (verificationError) {
            console.warn(
              "[Connections Callback] verification attempt failed:",
              verificationError,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        /*
         * Même si le backend ne renvoie pas encore le statut attendu,
         * on retourne au catalogue. La page /connections fera une
         * nouvelle lecture avec cache désactivé.
         */
        if (!cancelled) {
          setMessage(
            "Retour aux intégrations pour vérifier le nouvel état...",
          );

          await new Promise((resolve) =>
            setTimeout(resolve, 500),
          );

          router.replace("/connections");
          router.refresh();
        }
      } catch (verificationError) {
        if (cancelled) return;

        console.error(
          "[Connections Callback] OAuth callback failed:",
          verificationError,
        );

        setError(true);
        setMessage(
          verificationError instanceof Error
            ? verificationError.message
            : "La connexion n'a pas pu être finalisée.",
        );
      }
    }

    void verifyConnection();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
          {error ? (
            <AlertCircle className="h-7 w-7" />
          ) : message.startsWith("Connexion réussie") ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin" />
          )}
        </div>

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-950">
          {error ? "Connexion non finalisée" : "Finalisation de la connexion"}
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          {message}
        </p>

        {error && (
          <button
            type="button"
            onClick={() => router.replace("/connections")}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Retour aux intégrations
          </button>
        )}
      </div>
    </main>
  );
}


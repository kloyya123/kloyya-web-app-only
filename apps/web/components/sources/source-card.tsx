'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import type { ConnectedSource } from '@/types/sources';
import { PERMISSION_LABEL, STATUS_META, providerIcon } from './source-meta';
import { useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';

/**
 * One connected source, with everything the spec's "Source Confidence &
 * Freshness" panel wants: confidence, last-updated, permission, status, and how
 * many recommendations lean on it.
 */
export function SourceCard({ source }: { source: ConnectedSource }) {
  const Icon = providerIcon(source.provider);
  const status = STATUS_META[source.status];
  const qc = useQueryClient();
  const [isActioning, setIsActioning] = useState(false);

  async function handleConnect() {
    setIsActioning(true);
    try {
      // Real flow will redirect the browser to the provider (OAuth) and navigation
      // means this promise may never resolve. That's expected. For mocks this will
      // return the updated connection object.
      await services.integrations.connect(source.definition.id);
      // For mock / SSR test paths, ensure UI is refreshed:
      qc.invalidateQueries(['integrations', 'summary']);
      qc.invalidateQueries(['integrations', source.definition.id]);
    } catch (err) {
      // If OAuth navigation happened, this code will not run. For client-side
      // errors, surface to console (or replace with toast).
      // console.error('Connect failed', err);
    } finally {
      setIsActioning(false);
    }
  }

  async function handleDisconnect() {
    setIsActioning(true);
    try {
      await services.integrations.disconnect(source.definition.id);
      qc.invalidateQueries(['integrations', 'summary']);
      qc.invalidateQueries(['integrations', source.definition.id]);
    } catch (err) {
      // console.error('Disconnect failed', err);
    } finally {
      setIsActioning(false);
    }
  }

  return (
    <div
      className={cn(
        'bg-card border-border rounded-md border p-4',
        !status.isWorking && 'border-warning/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="bg-surface text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-small text-foreground truncate font-medium">
              {source.displayName}
            </p>
            <p className="text-caption text-subtle">{PERMISSION_LABEL[source.permission]}</p>
          </div>
        </div>

        {/* Status / action area */}
        <div>
          {source.status === 'connected' ? (
            <div className="flex items-center gap-2">
              {/* Put your GIF in public/images/connected-badge.gif */}
              <img
                src="/images/connected-badge.gif"
                alt="Connecté"
                className="h-6 w-6 rounded-sm"
                width={24}
                height={24}
              />
              <Badge tone={status.tone} withDot>
                Connecté
              </Badge>
            </div>
          ) : source.status === 'syncing' ? (
            <Badge tone="accent" withDot>
              Synchronisation…
            </Badge>
          ) : source.status === 'paused' ? (
            <Badge tone="neutral" withDot>
              En pause
            </Badge>
          ) : source.status === 'error' ? (
            <Badge tone="warning" withDot>
              Erreur
            </Badge>
          ) : (
            // not_connected
            <div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isActioning}
                className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Connecter
              </button>
            </div>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Metric label="Confidence" value={`${source.confidence}%`} />
        <Metric label="Freshness" value={`${source.freshness}%`} />
        <Metric
          label="Last sync"
          value={
            <time dateTime={source.lastSyncedAt}>
              {formatRelativeTime(source.lastSyncedAt)}
            </time>
          }
        />
        <Metric
          label="Referenced by"
          value={
            source.referencedByCount === 1
              ? '1 recommendation'
              : `${source.referencedByCount} recommendations`
          }
        />
      </dl>

      {source.attentionReason ? (
        <div className="border-warning/30 bg-warning/10 mt-3 flex items-start gap-2 rounded-sm border px-3 py-2">
          <AlertTriangle aria-hidden="true" className="text-caution mt-0.5 size-3.5 shrink-0" />
          <p className="text-caption text-muted-foreground">{source.attentionReason}</p>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-subtle">{label}</dt>
      <dd className="text-small text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

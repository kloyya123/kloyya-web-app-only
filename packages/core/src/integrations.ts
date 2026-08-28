
import type { IsoTimestamp } from './domain.js';

/**
 * The integration catalogue and connection lifecycle.
 *
 * The catalogue describes what can be connected.
 * A live connection describes what is currently connected.
 *
 * Icons are part of the catalogue because the Connections UI should have
 * exactly one source of truth for an integration's identity, metadata,
 * permissions, and presentation.
 */

export const INTEGRATION_CATEGORIES = [
  'communication',
  'calendar',
  'documents',
  'project_management',
  'crm',
  'engineering',
  'design',
  'meetings',
  'finance',
  'cloud_storage',
  'ai_productivity',
  'hr',
  'marketing',
  'custom',
] as const;

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

/**
 * What Kloyya will and will not do with a connection.
 *
 * Both lists are required and non-empty because the user must be able to
 * review what access Kloyya requests before connecting an integration.
 */
export interface IntegrationPermissions {
  granted: [string, ...string[]];
  notGranted: [string, ...string[]];
}

export interface IntegrationDefinition {
  /** Stable id, e.g. 'gmail'. */
  id: string;

  /** Human-readable integration name. */
  name: string;

  /** Product category displayed in the Connections Manager. */
  category: IntegrationCategory;

  /** One sentence explaining what connecting this teaches Kloyya. */
  description: string;

  /** What Kloyya can and cannot access. */
  permissions: IntegrationPermissions;

  /** Ballpark for the first full sync, shown on the card. */
  estimatedSyncMinutes: number;

  /**
   * Public icon path used by the web Connections Manager.
   *
   * Example:
   * `/icons/gmail.svg`
   *
   * This remains presentation metadata only; authentication and provider
   * configuration are handled by the integration service.
   */
  icon: string;
}

/**
 * Connection lifecycle.
 *
 * `error` carries a human-readable reason and offers Reconnect.
 * `paused` keeps the data but stops syncing.
 */
export const CONNECTION_STATUSES = [
  'not_connected',
  'connecting',
  'syncing',
  'connected',
  'paused',
  'error',
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export interface IntegrationConnection {
  definition: IntegrationDefinition;
  status: ConnectionStatus;
  lastSyncedAt: IsoTimestamp | null;

  /** Present only when status is `error`. */
  errorReason?: string;
}

/**
 * Whether an integration counts toward "connected sources".
 *
 * Everything except `not_connected` is considered connected.
 * A paused or errored integration still has an established connection,
 * even though it is not currently syncing.
 */
export function isConnected(connection: IntegrationConnection): boolean {
  return connection.status !== 'not_connected';
}

import { db } from '@kloyya/db';
import { connections } from '@kloyya/db/schema';
import { and, eq } from 'drizzle-orm';

export type ToolCapability = 'read' | 'search' | 'write' | 'execute';

export interface ConnectedTool {
  id: string;
  name: string;
  status: 'connected' | 'error' | 'syncing';
  capabilities: ToolCapability[];
  lastSyncedAt: Date | null;
}

/**
 * Retourne les outils réellement connectés et disponibles
 * pour un workspace / une organisation.
 *
 * IMPORTANT :
 * Ce registre ne fait aucune supposition sur les outils.
 * Il utilise uniquement les connexions présentes en BDD.
 */
export async function getAvailableTools(
  workspaceId: string,
  organizationId: string,
): Promise<ConnectedTool[]> {
  const dbConnections = await db
    .select({
      integrationId: connections.integrationId,
      status: connections.status,
      lastSyncedAt: connections.lastSyncedAt,
    })
    .from(connections)
    .where(
      and(
        eq(connections.workspaceId, workspaceId),
        eq(connections.organizationId, organizationId),
      ),
    );

  return dbConnections.map((connection) => {
    const integrationId = connection.integrationId.toLowerCase();

    let capabilities: ToolCapability[];

    switch (integrationId) {
      case 'gmail':
      case 'google_gmail':
      case 'google-mail':
        capabilities = ['read', 'search'];
        break;

      case 'slack':
        capabilities = ['read', 'search'];
        break;

      case 'notion':
        capabilities = ['read', 'search'];
        break;

      case 'google_drive':
      case 'googledrive':
      case 'drive':
        capabilities = ['read', 'search'];
        break;

      default:
        capabilities = ['read', 'search'];
        break;
    }

    let status: ConnectedTool['status'];

    switch (connection.status) {
      case 'connected':
        status = 'connected';
        break;

      case 'syncing':
        status = 'syncing';
        break;

      case 'error':
        status = 'error';
        break;

      default:
        status = 'error';
        break;
    }

    return {
      id: connection.integrationId,
      name: connection.integrationId,
      status,
      capabilities,
      lastSyncedAt: connection.lastSyncedAt ?? null,
    };
  });
}

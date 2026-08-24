import { eq, and } from 'drizzle-orm';
import { db } from '@kloyya/db';
import { graphNodes, graphEdges } from '@kloyya/db/schema';
import type { UnifiedEvent } from '@kloyya/core';

/**
 * Graph Builder — Transforms a UnifiedEvent into Graph Nodes and Edges.
 * 
 * Principles:
 * 1. Idempotent: Running the same event twice updates, doesn't duplicate (thanks to unique indexes).
 * 2. Tenant-scoped: All queries are strictly bound to organizationId and workspaceId.
 * 3. Relational: Automatically creates edges between the actor, the content, and references.
 */

export async function ingestEventToGraph(event: UnifiedEvent): Promise<void> {
  // 1. Upsert the Actor (Person)
  const actorNodeId = await upsertNode({
    organizationId: event.organizationId,
    workspaceId: event.workspaceId,
    externalId: event.actor.externalId || event.actor.id,
    externalProvider: event.provider,
    type: 'person',
    name: event.actor.name,
    content: event.actor.role ? `Role: ${event.actor.role}` : undefined,
    metadata: event.actor.metadata || {},
  });

  // 2. Upsert the Main Event Node (Message, Document, Task, etc.)
  const eventNodeId = await upsertNode({
    organizationId: event.organizationId,
    workspaceId: event.workspaceId,
    externalId: event.externalId,
    externalProvider: event.provider,
    type: event.type,
    name: event.context.channelName || event.context.projectName || `${event.type} ${event.externalId}`,
    content: event.content.text,
    metadata: {
      ...event.metadata,
      status: event.status,
      priority: event.priority,
      dueAt: event.dueAt,
      tags: event.tags,
    },
  });

  // 3. Create Edge: Actor -> AUTHORED -> Event
  await upsertEdge({
    organizationId: event.organizationId,
    workspaceId: event.workspaceId,
    sourceId: actorNodeId,
    targetId: eventNodeId,
    type: 'AUTHORED',
    metadata: { role: 'author', timestamp: event.timestamp },
    sourceProvider: event.provider,
    sourceEventId: event.externalId,
  });

  // 4. Upsert References and create Edges
  for (const ref of event.references) {
    const refNodeId = await upsertNode({
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      externalId: ref.externalId || ref.name,
      externalProvider: ref.type === 'url' ? 'web' : event.provider,
      type: ref.type,
      name: ref.name,
      content: ref.context,
      metadata: { url: ref.url, ...(ref.metadata || {}) },
    });

    await upsertEdge({
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      sourceId: eventNodeId,
      targetId: refNodeId,
      type: 'REFERENCES',
      metadata: { context: ref.context },
      sourceProvider: event.provider,
      sourceEventId: event.externalId,
    });
  }

  // 5. Create Edges for other Participants
  for (const participant of event.participants) {
    if (participant.actor.id === event.actor.id) continue;

    const participantNodeId = await upsertNode({
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      externalId: participant.actor.externalId || participant.actor.id,
      externalProvider: event.provider,
      type: 'person',
      name: participant.actor.name,
      metadata: participant.actor.metadata || {},
    });

    const edgeType = participant.role === 'mention' ? 'MENTIONS' : 'PARTICIPATES_IN';
    
    await upsertEdge({
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      sourceId: participantNodeId,
      targetId: eventNodeId,
      type: edgeType,
      metadata: { role: participant.role, participatedAt: participant.participatedAt },
      sourceProvider: event.provider,
      sourceEventId: event.externalId,
    });
  }
}

/**
 * Helper: Upsert a Graph Node (Insert or Update based on externalId + provider)
 * Returns the internal UUID of the node.
 */
async function upsertNode(input: {
  organizationId: string;
  workspaceId: string;
  externalId: string;
  externalProvider: string;
  type: string;
  name: string;
  // ✅ CORRECTION : Ajout de `| undefined` pour satisfaire exactOptionalPropertyTypes
  content?: string | undefined;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const [existing] = await db
    .select({ id: graphNodes.id })
    .from(graphNodes)
    .where(
      and(
        eq(graphNodes.organizationId, input.organizationId),
        eq(graphNodes.workspaceId, input.workspaceId),
        eq(graphNodes.externalProvider, input.externalProvider),
        eq(graphNodes.externalId, input.externalId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(graphNodes)
      .set({
        name: input.name,
        // ✅ CORRECTION : Gestion propre de undefined pour ne pas écraser avec null/undefined
        content: input.content !== undefined ? input.content : graphNodes.content,
        metadata: input.metadata,
        updatedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(graphNodes.id, existing.id));
    
    return existing.id;
  }

  const [newNode] = await db
    .insert(graphNodes)
    .values({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      externalId: input.externalId,
      externalProvider: input.externalProvider,
      type: input.type as any,
      name: input.name,
      content: input.content,
      metadata: input.metadata,
      lastSeenAt: new Date(),
    })
    .returning({ id: graphNodes.id });

  return newNode.id;
}

/**
 * Helper: Upsert a Graph Edge
 */
async function upsertEdge(input: {
  organizationId: string;
  workspaceId: string;
  sourceId: string;
  targetId: string;
  type: string;
  metadata: Record<string, unknown>;
  sourceProvider?: string;
  sourceEventId?: string;
}): Promise<void> {
  await db
    .insert(graphEdges)
    .values({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type as any,
      metadata: input.metadata,
      sourceProvider: input.sourceProvider,
      sourceEventId: input.sourceEventId,
      occurredAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [graphEdges.workspaceId, graphEdges.sourceId, graphEdges.targetId, graphEdges.type],
      set: {
        metadata: input.metadata,
        updatedAt: new Date(),
        occurredAt: new Date(),
      },
    });
}

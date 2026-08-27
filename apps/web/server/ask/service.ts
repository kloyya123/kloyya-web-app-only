import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import { connections, graphNodes, memories, syncRecords } from '@kloyya/db/schema';
import type { AiProvider } from '@server/ai/provider';
import { stripFootnoteMarkers } from '@server/ai/provider';

const MAX_RECORDS = 24;
const MAX_RECORD_CHARS = 3500;

function questionTerms(question: string): string[] {
  return [...new Set(
    question
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9@._-]+/)
      .filter((word) => word.length >= 4),
  )].slice(0, 8);
}

function payloadText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return '';
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = stripFootnoteMarkers(text)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isExternalQuestion(question: string): boolean {
  return /\b(latest|today|news|actualité|actualite|march[eé]|market|competitor|concurrent|trend|2026|cette semaine|aujourd'hui|aujourd’hui)\b/i.test(
    question,
  );
}

/**
 * Ask Kloyya reads the connected workspace first.
 *
 * The important part is syncRecords: these are the records imported from the
 * connected providers. Memories/graph are useful secondary context, but they
 * must not be the only source used by Ask.
 */
export async function ask(
  dbInstance: any,
  start: any,
  question: string,
  provider: AiProvider | null,
  _context: any,
  _webSearch: any,
) {
  if (!provider) {
    return { ok: false as const, reason: 'not_configured' as const };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const connectedTools = await dbInstance
      .select({
        integrationId: connections.integrationId,
        status: connections.status,
      })
      .from(connections)
      .where(
        and(
          eq(connections.workspaceId, start.activeWorkspaceId),
          eq(connections.organizationId, start.organizationId),
        ),
      );

    const connected = connectedTools
      .filter((tool: { status: string }) => tool.status === 'connected')
      .map((tool: { integrationId: string }) => tool.integrationId);

    const terms = questionTerms(question);

    const tenantConditions = [
      eq(syncRecords.workspaceId, start.activeWorkspaceId),
      eq(syncRecords.organizationId, start.organizationId),
      gte(syncRecords.fetchedAt, today),
    ];

    const keywordConditions = terms.map(
      (term) => sql`${syncRecords.payload}::text ILIKE ${`%${term}%`}`,
    );

    let records = keywordConditions.length
      ? await dbInstance
          .select({
            integrationId: connections.integrationId,
            resourceType: syncRecords.resourceType,
            externalId: syncRecords.externalId,
            payload: syncRecords.payload,
            fetchedAt: syncRecords.fetchedAt,
          })
          .from(syncRecords)
          .innerJoin(connections, eq(syncRecords.connectionId, connections.id))
          .where(
            and(
              ...tenantConditions,
              eq(connections.status, 'connected'),
              or(...keywordConditions),
            ),
          )
          .orderBy(desc(syncRecords.fetchedAt))
          .limit(MAX_RECORDS)
      : [];

    if (records.length === 0) {
      records = await dbInstance
        .select({
          integrationId: connections.integrationId,
          resourceType: syncRecords.resourceType,
          externalId: syncRecords.externalId,
          payload: syncRecords.payload,
          fetchedAt: syncRecords.fetchedAt,
        })
        .from(syncRecords)
        .innerJoin(connections, eq(syncRecords.connectionId, connections.id))
        .where(
          and(
            ...tenantConditions,
            eq(connections.status, 'connected'),
          ),
        )
        .orderBy(desc(syncRecords.fetchedAt))
        .limit(MAX_RECORDS);
    }

    const syncEvidence = records.map((record: any) => {
      const raw = payloadText(record.payload);
      return {
        source: record.integrationId,
        type: record.resourceType,
        externalId: record.externalId,
        fetchedAt: record.fetchedAt,
        content: raw.slice(0, MAX_RECORD_CHARS),
      };
    });

    const internalMemories = await dbInstance
      .select({
        type: sql<string>`'memory'`,
        content: memories.content,
        source: memories.layer,
        timestamp: memories.createdAt,
      })
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, start.activeWorkspaceId),
          eq(memories.organizationId, start.organizationId),
          gte(memories.createdAt, today),
        ),
      )
      .orderBy(desc(memories.importance))
      .limit(5);

    const internalGraph = await dbInstance
      .select({
        type: sql<string>`'graph'`,
        content: graphNodes.content,
        source: graphNodes.type,
        timestamp: graphNodes.lastSeenAt,
      })
      .from(graphNodes)
      .where(
        and(
          eq(graphNodes.workspaceId, start.activeWorkspaceId),
          eq(graphNodes.organizationId, start.organizationId),
          gte(graphNodes.lastSeenAt, today),
        ),
      )
      .orderBy(desc(graphNodes.lastSeenAt))
      .limit(5);

    const evidenceText = [
      ...syncEvidence.map(
        (item: any) =>
          `[CONNECTED:${item.source}/${item.type}] ${item.content}`,
      ),
      ...internalMemories.map(
        (item: any) => `[MEMORY:${item.source}] ${item.content}`,
      ),
      ...internalGraph.map(
        (item: any) => `[GRAPH:${item.source}] ${item.content}`,
      ),
    ].join('\n');

    const hasInternalEvidence = syncEvidence.length > 0 || internalMemories.length > 0 || internalGraph.length > 0;
    const allowWebSearch = isExternalQuestion(question);

    const system = `Tu es Kloyya, le Chef de Cabinet IA.

Tu dois d'abord travailler avec les données internes réellement récupérées des outils connectés.

OUTILS CONNECTÉS ACTIFS:
${connected.length ? connected.join(', ') : 'Aucun'}

DONNÉES INTERNES RÉCUPÉRÉES:
${hasInternalEvidence ? evidenceText : 'AUCUNE DONNÉE INTERNE RÉCUPÉRÉE.'}

RÈGLES:
1. Pour une question sur l'entreprise, les clients, l'équipe, les projets, les contrats, les emails, les documents ou les opérations, utilise les données CONNECTED comme source principale.
2. Ne prétends jamais avoir lu un outil qui n'a pas fourni de données.
3. Si aucune donnée interne pertinente n'a été trouvée, dis-le clairement.
4. La recherche Web est autorisée uniquement lorsque la question demande une information externe, récente ou de marché.
5. Sépare les faits, l'analyse, les risques et la recommandation.
6. Si les preuves se contredisent, signale la contradiction.
7. Ne fabrique aucune information.
8. Pour une décision importante, indique toujours ce qui manque avant de recommander.
9. Retourne UNIQUEMENT le JSON demandé.

FORMAT:
{
  "decision": "ACCEPTER | REFUSER | NEGOCIER | INVESTIGUER",
  "confidence_score": 0.0,
  "reasoning": ["..."],
  "evidence": [
    {"claim": "...", "source": "...", "confidence": 0.0}
  ],
  "risks": ["..."],
  "missing_information": ["..."],
  "recommended_action": "..."
}`;

    const aiResponse = await provider.complete({
      system,
      messages: [{ role: 'user', content: question }],
      maxTokens: 1600,
      allowWebSearch,
    });

    const parsed = extractJson(aiResponse.text) ?? {
      decision: 'INVESTIGUER',
      confidence_score: 0.35,
      reasoning: [stripFootnoteMarkers(aiResponse.text).slice(0, 1200)],
      evidence: [],
      risks: ['Réponse non structurée par le modèle.'],
      missing_information: hasInternalEvidence ? [] : ['Données internes pertinentes non trouvées.'],
      recommended_action: 'Vérifier les outils connectés et relancer la question.',
    };

    const reasoning = arrayOfStrings(parsed.reasoning);
    const risks = arrayOfStrings(parsed.risks);
    const missing = arrayOfStrings(parsed.missing_information);
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];

    const confidence = typeof parsed.confidence_score === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence_score))
      : 0.35;

    return {
      ok: true as const,
      result: {
        answer: typeof parsed.recommended_action === 'string'
          ? parsed.recommended_action
          : 'Investiguer avant de décider.',
        decision: typeof parsed.decision === 'string' ? parsed.decision : 'INVESTIGUER',
        confidence,
        reasoning,
        citations: evidence.map((item: any) => ({
          label: typeof item?.claim === 'string' ? item.claim : 'Preuve interne',
          source: typeof item?.source === 'string' ? item.source : 'connected',
          freshness: new Date().toISOString(),
        })),
        risks,
        missing,
      },
    };
  } catch (error) {
    console.error('[Ask Service] Critical Error:', error);
    return {
      ok: false as const,
      reason: 'ai_unavailable' as const,
      error,
    };
  }
}


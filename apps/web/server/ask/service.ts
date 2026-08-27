import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { db } from '@kloyya/db';
import { connections, graphNodes, memories } from '@kloyya/db/schema';
import type { AiProvider } from '@server/ai/provider';

/**
 * LE CŒUR DU CHEF DE CABINET : Service "ask" réécrit pour l'orchestration.
 * Il lit les données internes AVANT de faire appel au LLM.
 */
export async function ask(
  dbInstance: any, // Type Drizzle DB
  start: any,      // StartContext (évite les erreurs d'import de chemin)
  question: string,
  provider: AiProvider | null, // ✅ CORRECTION : Accepter null si non configuré
  _context: any,
  webSearch: any
) {
  // ✅ CORRECTION : Gérer le cas où aucun fournisseur d'IA n'est configuré
  if (!provider) {
    return {
      ok: false,
      reason: 'not_configured',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 1 : TOOL REGISTRY (Quels outils sont réellement connectés ?)
    // ─────────────────────────────────────────────────────────────────────
    const connectedTools = await dbInstance
      .select({ integrationId: connections.integrationId, status: connections.status })
      .from(connections)
      .where(
        and(
          eq(connections.workspaceId, start.activeWorkspaceId),
          eq(connections.organizationId, start.organizationId)
        )
      );

    const availableTools = connectedTools
      .filter((t: any) => t.status === 'connected')
      .map((t: any) => t.integrationId)
      .join(', ');

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 2 : EVIDENCE ENGINE (Lire les preuves internes AVANT de répondre)
    // ─────────────────────────────────────────────────────────────────────
    const internalMemories = await dbInstance
      .select({ 
        type: sql<string>`'memory'`,
        content: memories.content,
        source: memories.layer,
        timestamp: memories.createdAt
      })
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, start.activeWorkspaceId),
          eq(memories.organizationId, start.organizationId),
          gte(memories.createdAt, today)
        )
      )
      .orderBy(desc(memories.importance))
      .limit(5);

    const internalGraph = await dbInstance
      .select({
        type: sql<string>`'graph'`,
        content: graphNodes.content,
        source: graphNodes.type,
        timestamp: graphNodes.lastSeenAt
      })
      .from(graphNodes)
      .where(
        and(
          eq(graphNodes.workspaceId, start.activeWorkspaceId),
          eq(graphNodes.organizationId, start.organizationId),
          gte(graphNodes.lastSeenAt, today)
        )
      )
      .orderBy(desc(graphNodes.lastSeenAt))
      .limit(5);

    const allEvidence = [...internalMemories, ...internalGraph];
    
    const evidenceText = allEvidence.length > 0
      ? allEvidence.map((e: any) => `[${e.source.toUpperCase()}] ${e.content}`).join('\n')
      : 'Aucune donnée interne récente trouvée dans les outils connectés.';

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 3 : CHIEF OF STAFF PROMPT (Forcer le raisonnement basé sur les preuves)
    // ─────────────────────────────────────────────────────────────────────
    const systemPrompt = `Tu es Kloyya, le Chef de Cabinet IA d'un dirigeant. Ta mission est d'analyser les données internes de l'entreprise pour prendre des décisions éclairées, PAS de chercher sur Internet par défaut.

OUTILS CONNECTÉS DISPONIBLES : ${availableTools || 'Aucun outil connecté'}

DONNÉES INTERNES RÉCUPÉRÉES :
${evidenceText}

RÈGLES STRICTES :
1. Base ta réponse EXCLUSIVEMENT sur les "DONNÉES INTERNES RÉCUPÉRÉES" ci-dessus.
2. Si les données internes sont insuffisantes, dis clairement : "Je ne peux pas prendre cette décision avec confiance car il manque des données internes. Voici ce que j'ai trouvé : [résumé]".
3. N'utilise la recherche Web que si la question porte explicitement sur l'actualité externe.
4. Réponds STRICTEMENT au format JSON suivant, sans aucun texte en dehors du JSON.

FORMAT DE RÉPONSE OBLIGATOIRE :
{
  "decision": "ACCEPTER | REFUSER | NÉGOCIER | INVESTIGUER",
  "confidence_score": 0.85,
  "reasoning": ["Raison 1 basée sur les faits internes", "Raison 2"],
  "evidence": [
    {
      "claim": "Le fait observé",
      "source": "gmail | slack | notion | memory | graph",
      "confidence": 0.9
    }
  ],
  "risks": ["Risque identifié"],
  "missing_information": ["Information manquante pour être sûr à 100%"],
  "recommended_action": "Action concrète à proposer"
}`;

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 4 : APPEL AU FOURNISSEUR D'IA
    // ─────────────────────────────────────────────────────────────────────
    const aiResponse = await provider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.1, // Très bas pour un raisonnement factuel et déterministe
    });

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 5 : PARSING ROBUSTE ET FORMATAGE POUR LE FRONTEND
    // ─────────────────────────────────────────────────────────────────────
    let parsed;
    try {
      const jsonMatch = aiResponse.content.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.content.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0].replace(/```json|```/g, '').trim() : aiResponse.content;
      parsed = JSON.parse(jsonString);
    } catch (e) {
      parsed = {
        decision: 'INVESTIGUER',
        confidence_score: 0.5,
        reasoning: ['Le modèle n\'a pas pu structurer sa réponse en JSON.'],
        evidence: [],
        risks: ['Format de réponse invalide'],
        missing_information: ['Données non structurées'],
        recommended_action: 'Veuillez reformuler votre demande ou vérifier les connexions des outils.'
      };
    }

    // Formatage pour correspondre au type `AskAnswer` attendu par le frontend
    return {
      ok: true,
      result: {
        answer: parsed.recommended_action,
        decision: parsed.decision,
        confidence: parsed.confidence_score,
        reasoning: parsed.reasoning,
        citations: parsed.evidence.map((e: any) => ({ 
          label: e.claim, 
          source: e.source, 
          freshness: new Date().toISOString() 
        })),
        risks: parsed.risks,
        missing: parsed.missing_information,
      }
    };

  } catch (error) {
    console.error('[Ask Service] Critical Error:', error);
    return {
      ok: false,
      reason: 'ai_unavailable',
      error
    };
  }
}

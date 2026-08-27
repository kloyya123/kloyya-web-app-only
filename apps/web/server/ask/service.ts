import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { db } from '@kloyya/db';
import { connections, graphNodes, memories } from '@kloyya/db/schema';
import type { StartContext } from '@server/tenant'; // Ajuste l'import selon ton type réel
import type { AiProvider } from '@server/ai/provider';
import type { WebSearch } from '@server/ask/web-search';

/**
 * LE CŒUR DU CHEF DE CABINET : Service "ask" réécrit pour l'orchestration.
 * Il lit les données internes AVANT de faire appel au LLM.
 */
export async function ask(
  dbInstance: any, // Remplace par le type Drizzle réel si nécessaire
  start: StartContext,
  question: string,
  provider: AiProvider,
  _context: any, // Ancien argument undefined, maintenant ignoré car on le reconstruit
  webSearch: WebSearch
) {
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
    // On interroge le graphe de connaissances et les mémoires récentes
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
3. N'utilise la recherche Web que si la question porte explicitement sur l'actualité externe (ex: "Cours de l'action Apple").
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
  "recommended_action": "Action concrète à proposer (ex: 'Préparer un brouillon d'email')"
}`;

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 4 : APPEL AU FOURNISSEUR D'IA
    // ─────────────────────────────────────────────────────────────────────
    // (Ajuste l'appel ci-dessous pour qu'il corresponde exactement à ton interface AiProvider)
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
      // Fallback sécurisé si le LLM ne respecte pas le JSON
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

    // Formatage pour correspondre au type `AskAnswer` attendu par ton frontend (`AskView`)
    return {
      ok: true,
      result: {
        answer: parsed.recommended_action, // Le texte principal affiché
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
        // Tu pourras ajouter ici la logique pour `action: { type: 'draft_email', href: '...' }` plus tard
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

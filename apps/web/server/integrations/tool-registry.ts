import { db } from '@kloyya/db';
import { connections, users } from '@kloyya/db/schema';
import { eq, and } from 'drizzle-orm';

export type ToolCapability = 'read' | 'search' | 'write' | 'execute';

export interface ConnectedTool {
  id: string; // ex: 'gmail', 'slack', 'notion'
  name: string;
  status: 'connected' | 'error' | 'syncing';
  capabilities: ToolCapability[];
  lastSyncedAt: Date | null;
}

/**
 * Tool Registry : Interroge la BDD pour savoir quels outils sont 
 * réellement disponibles pour cet utilisateur/workspace.
 */
export async function getAvailableTools(
  workspaceId: string,
  organizationId: string
): Promise<ConnectedTool[]> {
  // On interroge la table des connexions (que tu as déjà dans ton schéma)
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
        eq(connections.organizationId, organizationId)
0)
  }

  // 2. Tool Registry : Vérifier ce qui est disponible
  const availableTools = await getAvailableTools(workspaceId, organizationId);
  const connectedToolNames = availableTools.map(t => t.name).join(', ');

  // 3. Construction du Prompt "Chef de Cabinet"
  // On force l'IA à se baser SURTOUT sur les preuves internes
  const systemPrompt = `
Tu es Kloyya, le Chef de Cabinet IA d'un dirigeant. 
Ta mission n'est pas de chercher sur Internet, mais d'analyser les données internes de l'entreprise pour prendre des décisions éclairées.

OUTILS CONNECTÉS DISPONIBLES : ${connectedToolNames || 'Aucun outil connecté'}

DONNÉES INTERNES RÉCUPÉRÉES :
${internalEvidence || 'Aucune donnée interne trouvée pour cette requête.'}

RÈGLES STRICTES :
1. Si des données internes sont fournies, base ta décision EXCLUSIVEMENT sur elles.
2. Si les données internes sont insuffisantes, dis clairement : "Je ne peux pas prendre cette décision avec confiance car il manque [X]. Voici ce que j'ai trouvé : [Y]".
3. Ne cherche sur le Web que si la question porte explicitement sur l'actualité externe (ex: "Cours de l'action Apple").
4. Tu dois répondre STRICTEMENT au format JSON suivant, sans aucun texte en dehors du JSON.

FORMAT DE RÉPONSE OBLIGATOIRE :
{
  "decision": "ACCEPTER | REFUSER | NÉGOCIER | INVESTIGUER",
  "confidence_score": 0.85,
  "reasoning": ["Raison 1 basée sur les faits", "Raison 2"],
  "evidence": [
    {
      "claim": "Le fait observé",
      "source": "gmail | slack | notion | drive",
      "confidence": 0.9
    }
  ],
  "risks": ["Risque identifié 1"],
  "missing_information": ["Information manquante pour être sûr à 100%"],
  "recommended_action": "Action concrète à proposer (ex: 'Préparer un brouillon d'email de contre-proposition à 10%')"
}
`;

  // 4. Appel à l'IA (Perplexity)
  const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CLE_SONAR_API_KLOYYA2}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.1, // Très bas pour un raisonnement factuel et déterministe
      max_tokens: 1500,
    }),
  });

  if (!perplexityResponse.ok) {
    throw new Error(`Perplexity API error: ${perplexityResponse.statusText}`);
  }

  const data = await perplexityResponse.json();
  const aiContent = data.choices[0].message.content;

  // 5. Parsing robuste du JSON
  let parsedResponse;
  try {
    const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || aiContent.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0].replace(/```json|```/g, '').trim() : aiContent;
    parsedResponse = JSON.parse(jsonString);
  } catch (e) {
    console.error('[Ask API] Failed to parse Decision JSON. Raw content:', aiContent);
    // Fallback sécurisé
    parsedResponse = {
      decision: 'INVESTIGUER',
      confidence_score: 0.5,
      reasoning: ['Erreur de formatage de la réponse IA'],
      evidence: [],
      risks: ['Données non structurées'],
      missing_information: ['Format de réponse invalide'],
      recommended_action: 'Veuillez reformuler votre demande.'
    };
  }

  // 6. Sauvegarde en mémoire (Conversationnel)
  await db.insert(memories).values({
    workspaceId,
    organizationId,
    userId: userId || null,
    layer: 'conversational',
    title: `Decision: ${question.substring(0, 50)}...`,
    content: JSON.stringify(parsedResponse),
    metadata: { timestamp: new Date().toISOString() },
    importance: 0.9, // Haute importance pour une décision
  });

  return NextResponse.json(parsedResponse, { status: 200 });

} catch (error) {
  console.error('[Ask API] Critical Error:', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}

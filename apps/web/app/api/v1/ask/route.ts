import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@kloyya/db';
import { memories, graphNodes } from '@kloyya/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, conversationId, userId, workspaceId, organizationId } = body;

    if (!query || !workspaceId || !organizationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1a. Récupérer les mémoires à court terme et de travail d'aujourd'hui
    // Préfixé par _ car utilisé dans la future intégration IA
    const _recentMemories = await db
      .select({ title: memories.title, content: memories.content, layer: memories.layer })
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, workspaceId),
          eq(memories.organizationId, organizationId),
          gte(memories.createdAt, today),
          sql`${memories.layer} IN ('short_term', 'working', 'decision')`
        )
      )
      .orderBy(desc(memories.importance))
      .limit(10);

    // 1b. Récupérer les nœuds récents (ex: les emails d'alerte que le briefing a vus)
    // Préfixé par _ car utilisé dans la future intégration IA
    const _recentNodes = await db
      .select({ name: graphNodes.name, type: graphNodes.type, content: graphNodes.content })
      .from(graphNodes)
      .where(
        and(
          eq(graphNodes.workspaceId, workspaceId),
          eq(graphNodes.organizationId, organizationId),
          gte(graphNodes.lastSeenAt, today)
        )
      )
      .orderBy(desc(graphNodes.lastSeenAt))
      .limit(15);

    // 2. Récupérer l'historique de conversation (Mémoire conversationnelle)
    const conversationHistory = await db
      .select({ content: memories.content })
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, workspaceId),
          eq(memories.organizationId, organizationId),
          userId ? eq(memories.userId, userId) : sql`1=1`,
          eq(memories.layer, 'conversational')
        )
      )
      .orderBy(desc(memories.createdAt))
      .limit(5);

    // Préfixé par _ car utilisé dans la future intégration IA
    const _historyText =
      conversationHistory.length > 0
        ? 'Historique récent de la conversation :\n' + conversationHistory.map((m) => `- ${m.content}`).join('\n')
        : 'Aucun historique précédent.';

    // TODO: Construire le prompt final en utilisant _recentMemories, _recentNodes et _historyText
    // const context: DecisionContext = { ... };
    // const finalPrompt = buildDecisionPrompt(context);

    // MOCK DE RÉPONSE pour tester la logique de mémoire et de contexte sans l'IA active
    // Ce mock simule ce que l'IA répondrait après avoir analysé les données ci-dessus.
    const aiResponse = {
      summary: `J'ai analysé tes outils connectés. Aujourd'hui, l'élément le plus important concerne ta sécurité numérique : tu as reçu 3 alertes de sécurité Google et 2 notifications Apple (validation d'email et connexion iCloud) entre 11h04 et 12h31 GMT. Je te recommande de vérifier ces activités immédiatement.`,
      recommendations: [
        {
          recommendation: 'Vérifie les alertes de sécurité Google et Apple.',
          confidenceScore: 0.95,
          businessImpact: 'HIGH',
          priority: 'P1',
          urgency: 'IMMEDIATE',
          evidence: [
            { description: "3 emails 'Alerte de sécurité' Google reçus aujourd'hui.", source: 'gmail', strength: 0.9 },
            { description: '2 notifications Apple (validation et connexion iPhone).', source: 'gmail', strength: 0.9 },
          ],
          reasoning: "Des alertes de sécurité multiples sur une courte période indiquent un risque potentiel de compromission de compte.",
          reasoningChain: [{ step: 1, observation: 'Alertes Google et Apple détectées', inference: 'Risque de sécurité actif' }],
          dependencies: [],
          risks: [{ description: 'Accès non autorisé aux comptes', likelihood: 'MEDIUM', mitigation: 'Changer les mots de passe et activer la 2FA' }],
          expectedOutcome: 'Sécurisation des comptes et paix d’esprit.',
          relatedNodes: [],
        },
      ],
      confidenceInAnalysis: 0.95,
      missingInformation: [],
    };

    // 5. Sauvegarder la mémoire conversationnelle (Pour ne pas oublier)
    await db.insert(memories).values({
      workspaceId,
      organizationId,
      userId: userId || null,
      layer: 'conversational',
      title: `Query: ${query.substring(0, 50)}...`,
      content: `User: ${query}\nKloyya: ${aiResponse.summary}`,
      metadata: { conversationId, timestamp: new Date().toISOString() },
      importance: 0.8,
    });

    return NextResponse.json(aiResponse, { status: 200 });
  } catch (error) {
    console.error('[Ask API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

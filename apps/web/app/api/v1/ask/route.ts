import { NextRequest, NextResponse } from 'next/server';
import { db } from '@kloyya/db';
import { memories, graphNodes } from '@kloyya/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { DECISION_ENGINE_SYSTEM_PROMPT, buildDecisionPrompt, type DecisionContext, type Recommendation } from '@/server/ai/decision-engine';
// Remplace ce import par ton véritable client AI (ex: OpenAI, Perplexity, Anthropic)
// import { generateObject } from 'ai'; 
// import { openai } from '@ai-sdk/openai';

/**
 * POST /api/v1/ask
 * 
 * Le véritable Moteur de Décision de Kloyya.
 * 1. Il cherche le contexte dans VOTRE base de données (pas le web public).
 * 2. Il inclut l'historique de la conversation.
 * 3. Il sauvegarde l'échange pour la mémoire future.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, conversationId, userId, workspaceId, organizationId } = body;

    if (!query || !workspaceId || !organizationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 1 : Récupérer le contexte local (Ce que le Briefing a vu)
    // ─────────────────────────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1a. Récupérer les mémoires à court terme et de travail d'aujourd'hui
    const recentMemories = await db
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
    const recentNodes = await db
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

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 2 : Récupérer l'historique de conversation (Mémoire conversationnelle)
    // ─────────────────────────────────────────────────────────────────────
    const conversationHistory = await db
      .select({ content: memories.content, layer: memories.layer })
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, workspaceId),
          eq(memories.organizationId, organizationId),
          userId ? eq(memories.userId, userId) : sql`1=1`, // Fallback si userId non fourni
          eq(memories.layer, 'conversational')
        )
      )
      .orderBy(desc(memories.createdAt))
      .limit(5); // Garder les 5 derniers échanges

    // Formater l'historique pour le prompt
    const historyText = conversationHistory.length > 0 
      ? "Historique récent de la conversation :\n" + conversationHistory.map(m => `- ${m.content}`).join('\n')
      : "Aucun historique précédent.";

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 3 : Construire le contexte pour le Moteur de Décision
    // ─────────────────────────────────────────────────────────────────────
    const context: DecisionContext = {
      userId: userId || 'unknown',
      workspaceId,
      organizationId,
      query: `${historyText}\n\nNouvelle question de l'utilisateur : ${query}`,
      nodes: recentNodes.map(n => ({ ...n, id: 'mock-id', metadata: {}, createdAt: new Date(), updatedAt: new Date() } as any)), // Adapt to your exact GraphNode type
      edges: [], // À implémenter si tu veux les relations spécifiques
      memories: recentMemories.map(m => ({ ...m, id: 'mock-id', metadata: {}, importance: 1, accessCount: 0, createdAt: new Date(), updatedAt: new Date() } as any)), // Adapt to Memory type
      currentTime: new Date().toISOString(),
    };

    const finalPrompt = buildDecisionPrompt(context);

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 4 : Appel à l'IA (Remplace par ton vrai appel AI ici)
    // ─────────────────────────────────────────────────────────────────────
    /* 
    const { object } = await generateObject({
      model: openai('gpt-4o'), // ou perplexity, anthropic, etc.
      system: DECISION_ENGINE_SYSTEM_PROMPT,
      prompt: finalPrompt,
      schema: z.object({
        recommendations: z.array(z.any()), // Remplace par ton schéma Zod strict de Recommendation
        summary: z.string(),
        confidenceInAnalysis: z.number(),
        missingInformation: z.array(z.string()),
      }),
    });
    const aiResponse = object;
    */
   
    // MOCK DE RÉPONSE pour tester la logique sans l'IA pour l'instant
    const aiResponse = {
      summary: `J'ai analysé tes outils connectés. Aujourd'hui, l'élément le plus important concerne ta sécurité numérique : tu as reçu 3 alertes de sécurité Google et 2 notifications Apple (validation d'email et connexion iCloud) entre 11h04 et 12h31 GMT. Je te recommande de vérifier ces activités immédiatement.`,
      recommendations: [{
        recommendation: "Vérifie les alertes de sécurité Google et Apple.",
        confidenceScore: 0.95,
        businessImpact: "HIGH",
        priority: "P1",
        urgency: "IMMEDIATE",
        evidence: [
          { description: "3 emails 'Alerte de sécurité' Google reçus aujourd'hui.", source: "gmail", strength: 0.9 },
          { description: "2 notifications Apple (validation et connexion iPhone).", source: "gmail", strength: 0.9 }
        ],
        reasoning: "Des alertes de sécurité multiples sur une courte période indiquent un risque potentiel de compromission de compte.",
        reasoningChain: [{ step: 1, observation: "Alertes Google et Apple détectées", inference: "Risque de sécurité actif" }],
        dependencies: [],
        risks: [{ description: "Accès non autorisé aux comptes", likelihood: "MEDIUM", mitigation: "Changer les mots de passe et activer la 2FA" }],
        expectedOutcome: "Sécurisation des comptes et paix d'esprit.",
        relatedNodes: []
      }],
      confidenceInAnalysis: 0.95,
      missingInformation: []
    };

    // ─────────────────────────────────────────────────────────────────────
    // ÉTAPE 5 : Sauvegarder la mémoire conversationnelle (Pour ne pas oublier)
    // ─────────────────────────────────────────────────────────────────────
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

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@kloyya/db';
import { memories, graphNodes } from '@kloyya/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import type { GraphNode, Memory } from '@kloyya/db';
import { 
  DECISION_ENGINE_SYSTEM_PROMPT, 
  buildDecisionPrompt, 
  type DecisionContext 
} from '@/server/ai/decision-engine';

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
    const recentMemoriesData = await db
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
    const recentNodesData = await db
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

    const historyText =
      conversationHistory.length > 0
        ? 'Historique récent de la conversation :\n' + conversationHistory.map((m) => `- ${m.content}`).join('\n')
        : 'Aucun historique précédent.';

    // 3. Mapper les données vers les types attendus par le Decision Engine
    const nodes: GraphNode[] = recentNodesData.map((n) => ({
      id: 'temp-id',
      workspaceId,
      organizationId,
      type: n.type as any,
      name: n.name || 'Unknown',
      content: n.content || '',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as GraphNode));

    const memoriesObj: Memory[] = recentMemoriesData.map((m) => ({
      id: 'temp-id',
      workspaceId,
      organizationId,
      layer: m.layer as any,
      title: m.title || 'Unknown',
      content: m.content || '',
      metadata: {},
      importance: 1,
      accessCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Memory));

    const context: DecisionContext = {
      userId: userId || 'unknown',
      workspaceId,
      organizationId,
      query: `${historyText}\n\nNouvelle question de l'utilisateur : ${query}`,
      nodes,
      edges: [],
      memories: memoriesObj,
      currentTime: new Date().toISOString(),
    };

    const finalPrompt = buildDecisionPrompt(context);

    // 4. Appel à l'API Perplexity (Sonar)
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLE_SONAR_API_KLOYYA2}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar', // Modèle Sonar de Perplexity
        messages: [
          { role: 'system', content: DECISION_ENGINE_SYSTEM_PROMPT },
          { role: 'user', content: finalPrompt }
        ],
        temperature: 0.2, // Bas pour un moteur de décision factuel
        max_tokens: 1500,
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('[Ask API] Perplexity Error:', perplexityResponse.status, errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.statusText}`);
    }

    const data = await perplexityResponse.json();
    const aiContent = data.choices[0].message.content;

    // 5. Parser la réponse JSON (en gérant les éventuels blocs markdown ```json ... ```)
    let parsedResponse;
    try {
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
      parsedResponse = JSON.parse(jsonString);
    } catch (e) {
      console.error('[Ask API] Failed to parse Perplexity JSON response. Raw content:', aiContent);
      // Fallback robuste en cas d'échec du parsing JSON
      parsedResponse = {
        summary: aiContent,
        recommendations: [],
        confidenceInAnalysis: 0.5,
        missingInformation: ['La réponse de l\'IA n\'a pas pu être formatée en JSON structuré.'],
      };
    }

    // 6. Sauvegarder la mémoire conversationnelle (Pour ne pas oublier)
    await db.insert(memories).values({
      workspaceId,
      organizationId,
      userId: userId || null,
      layer: 'conversational',
      title: `Query: ${query.substring(0, 50)}...`,
      content: `User: ${query}\nKloyya: ${parsedResponse.summary}`,
      metadata: { conversationId, timestamp: new Date().toISOString() },
      importance: 0.8,
    });

    return NextResponse.json(parsedResponse, { status: 200 });

  } catch (error) {
    console.error('[Ask API] Critical Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { db } from '@kloyya/db';
import { memories, graphNodes, users } from '@kloyya/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import type { GraphNode, Memory } from '@kloyya/db';
import { 
  DECISION_ENGINE_SYSTEM_PROMPT, 
  buildDecisionPrompt, 
  type DecisionContext 
} from '@/server/ai/decision-engine';

type GraphNodeType = 'person' | 'project' | 'document' | 'meeting' | 'decision' | 'task' | 'conversation' | 'tool' | 'knowledge';
type MemoryLayer = 'short_term' | 'working' | 'session' | 'long_term' | 'organizational' | 'knowledge' | 'decision' | 'conversational' | 'user';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { query, conversationId, userId, workspaceId, organizationId } = body;

    if (!query) {
      return NextResponse.json({ error: 'Missing query in request body' }, { status: 400 });
    }

    // 🛡️ ROBUSTESSE : Si le frontend n'envoie pas les IDs, on les récupère depuis la session Supabase
    if (!workspaceId || !organizationId) {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() { /* Ignoré car on ne modifie pas les cookies ici */ }
          }
        }
      );
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized: No active session found' }, { status: 401 });
      }

      // Récupérer l'organisation et le workspace actif de l'utilisateur depuis la BDD
      const [userRecord] = await db
        .select({ 
          organizationId: users.organizationId, 
          activeWorkspaceId: users.activeWorkspaceId 
        })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

      if (!userRecord || !userRecord.organizationId || !userRecord.activeWorkspaceId) {
        return NextResponse.json({ 
          error: 'User profile incomplete: missing organization or active workspace. Please complete onboarding.' 
        }, { status: 400 });
      }

      workspaceId = userRecord.activeWorkspaceId;
      organizationId = userRecord.organizationId;
      userId = session.user.id;
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

    // 1b. Récupérer les nœuds récents
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

    // 2. Récupérer l'historique de conversation
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
        ? 'Historique récent :\n' + conversationHistory.map((m) => `- ${m.content}`).join('\n')
        : 'Aucun historique précédent.';

    // 3. Mapper les données
    const nodes: GraphNode[] = recentNodesData.map((n) => ({
      id: 'temp-id',
      workspaceId,
      organizationId,
      type: n.type as GraphNodeType,
      name: n.name || 'Unknown',
      content: n.content || '',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as GraphNode));

    const memoriesObj: Memory[] = recentMemoriesData.map((m) => ({
      id: 'temp-id',
      workspaceId,
      organizationId,
      layer: m.layer as MemoryLayer,
      title: m.title || 'Unknown',
      content: m.content || '',
      metadata: {},
      importance: 1,
      accessCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Memory));

    const context: DecisionContext = {
      userId: userId || 'unknown',
      workspaceId,
      organizationId,
      query: `${historyText}\n\nNouvelle question : ${query}`,
      nodes,
      edges: [],
      memories: memoriesObj,
      currentTime: new Date().toISOString(),
    };

    const finalPrompt = buildDecisionPrompt(context);

    // 4. Appel à Perplexity (Sonar)
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLE_SONAR_API_KLOYYA2}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: DECISION_ENGINE_SYSTEM_PROMPT },
          { role: 'user', content: finalPrompt }
        ],
        temperature: 0.2,
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

    // 5. Parser la réponse JSON
    let parsedResponse;
    try {
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
      parsedResponse = JSON.parse(jsonString);
    } catch {
      console.error('[Ask API] Failed to parse JSON. Raw content:', aiContent);
      parsedResponse = {
        summary: aiContent,
        recommendations: [],
        confidenceInAnalysis: 0.5,
        missingInformation: ['La réponse n\'a pas pu être formatée en JSON structuré.'],
      };
    }

    // 6. Sauvegarder la mémoire conversationnelle
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

import { NextResponse } from 'next/server';

import { resolveAiProvider } from '@/server/ai/provider';
import { createPlan } from '@/server/agent/planner';
import {
  deduplicateEvidence,
  normalizeEvidence,
} from '@/server/agent/evidence';
import { detectContradictions } from '@/server/agent/contradictions';
import { TOOL_REGISTRY } from '@/server/agent/tool-registry';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const message =
      typeof body.message === 'string'
        ? body.message.trim()
        : '';

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required.' },
        { status: 400 },
      );
    }

    /*
     * IMPORTANT:
     * Replace these with your existing auth/tenant helpers.
     */
    const user = await getAuthenticatedUser();
    const workspace = await getActiveWorkspace(user.id);

    if (!workspace) {
      return NextResponse.json(
        { error: 'No active workspace.' },
        { status: 400 },
      );
    }

    const availableTools =
      await getAvailableToolsForWorkspace(
        workspace.id,
        TOOL_REGISTRY,
      );

    const plan = createPlan(
      message,
      availableTools,
    );

    const evidence = await executePlan({
      plan,
      message,
      workspaceId: workspace.id,
      organizationId: workspace.organizationId,
      userId: user.id,
    });

    const normalized = deduplicateEvidence(
      normalizeEvidence(evidence),
    );

    const contradictions =
      detectContradictions(normalized);

    const provider = resolveAiProvider({
      provider: process.env.AI_PROVIDER ?? 'perplexity',
      perplexityApiKey:
        process.env.PERPLEXITY_API_KEY,
      perplexityModel:
        process.env.PERPLEXITY_MODEL,
    });

    const analysis =
      await provider.generateStructured({
        system: buildChiefOfStaffPrompt(),
        user: buildDecisionContext({
          message,
          plan,
          evidence: normalized,
          contradictions,
        }),
        schema: decisionSchema,
      });

    return NextResponse.json({
      ok: true,
      mode: 'chief_of_staff',
      plan,
      evidence: normalized,
      contradictions,
      decision: analysis,
    });
  } catch (error) {
    console.error('[ASK_KLOYYA]', error);

    return NextResponse.json(
      {
        error: 'Kloyya could not complete the analysis.',
      },
      { status: 500 },
    );
  }
}

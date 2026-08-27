import { NextResponse } from 'next/server';
import { z } from 'zod';
import { entitlementsFor } from '@kloyya/core';
import { resolveAiProvider } from '@server/ai/provider';
import { ask } from '@server/ask/service';
import { getAskCountToday, releaseAskCount, reserveAskCount } from '@server/ask/usage';
import { resolveWebSearch } from '@server/ask/web-search';
import { config } from '@server/config';
import { ok } from '@server/http/envelope';
import { API_STATUS, ApiError, errors } from '@server/http/errors';
import { kasRoute } from '@server/http/handler';
import { checkRateLimit } from '@server/http/rate-limit';
import { readTier } from '@server/plan/tier';
import { resolveStartContext } from '@server/tenant';

export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().trim().min(1, 'Ask Kloyya something first.'),
  conversationId: z.string().optional(),
});

export const POST = kasRoute('verified', async (req, routeCtx) => {
  const { question } = bodySchema.parse(await req.json());

  const start = await resolveStartContext(routeCtx.db, routeCtx.identity.id);
  if (!start) throw errors.notFound('User profile');

  const burst = await checkRateLimit(
    routeCtx.db,
    `ai:${start.userId}`,
    config.AI_RATE_LIMIT_PER_MINUTE,
  );

  if (!burst.allowed) {
    throw new ApiError({
      httpStatus: API_STATUS.RateLimited,
      errorCode: 'ask_rate_limited',
      message: 'Slow down — that’s a lot of requests in one minute.',
      description: `Kloyya allows ${burst.limit} AI requests per minute per person.`,
      suggestedResolution: `Wait about ${burst.retryAfterSeconds} seconds and try again.`,
    });
  }

  const dailyLimit = entitlementsFor(await readTier(routeCtx.db, start)).askPerDay;
  const reservation = await reserveAskCount(routeCtx.db, start, dailyLimit);

  if (!reservation.allowed) {
    throw new ApiError({
      httpStatus: API_STATUS.RateLimited,
      errorCode: 'ask_limit_reached',
      message: 'You’ve reached today’s Ask Kloyya limit.',
      description: `Your plan allows ${reservation.limit} questions per day.`,
      suggestedResolution: 'Try again tomorrow, or upgrade for unlimited questions.',
    });
  }

  const provider = resolveAiProvider({
    provider: config.AI_PROVIDER,
    openaiApiKey: config.OPENAI_API_KEY,
    openaiModel: config.OPENAI_MODEL,
    anthropicApiKey: config.ANTHROPIC_API_KEY,
    anthropicModel: config.ANTHROPIC_MODEL,
    perplexityApiKey: config.PERPLEXITY_API_KEY,
    perplexityChatModel: config.PERPLEXITY_CHAT_MODEL,
    nvidiaApiKey: config.NVIDIA_API_KEY,
    nvidiaModel: config.NVIDIA_MODEL,
    huggingfaceApiKey: config.HUGGINGFACE_API_KEY,
    huggingfaceModel: config.HUGGINGFACE_MODEL,
  });

  const webSearch = resolveWebSearch({
    perplexityApiKey: config.PERPLEXITY_API_KEY,
    perplexityModel: config.PERPLEXITY_MODEL,
    tavilyApiKey: config.TAVILY_API_KEY,
  });

  let outcome;
  try {
    outcome = await ask(
      routeCtx.db,
      start,
      question,
      provider,
      undefined,
      webSearch,
    );
  } catch (error) {
    await releaseAskCount(routeCtx.db, start, reservation.day);
    throw error;
  }

  if (!outcome.ok) {
    await releaseAskCount(routeCtx.db, start, reservation.day);

    throw outcome.reason === 'not_configured'
      ? new ApiError({
          httpStatus: API_STATUS.ServiceUnavailable,
          errorCode: 'ai_unconfigured',
          message: 'Ask Kloyya isn’t set up yet.',
          description: 'No AI provider is configured for this deployment.',
          suggestedResolution: 'Contact support — this is a deployment issue, not something you can fix.',
        })
      : new ApiError({
          httpStatus: API_STATUS.ServiceUnavailable,
          errorCode: 'ai_unavailable',
          message: 'Ask Kloyya is temporarily unavailable.',
          description: 'The AI provider didn’t respond in time.',
          suggestedResolution: 'Try again in a moment.',
        });
  }

  const usedToday = await getAskCountToday(routeCtx.db, start);

  return NextResponse.json(
    ok(
      {
        ...outcome.result,
        usage: {
          used: usedToday,
          limit: dailyLimit,
          remaining: dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday),
        },
      },
      routeCtx.correlationId,
    ),
  );
});


/**
 * Provider-neutral AI seam used by Ask Kloyya.
 *
 * Perplexity uses the Agent API. Kloyya controls whether the Agent receives
 * web_search; internal company data is gathered by the Ask service first.
 */

export type AiRole = 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface CompleteParams {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  allowWebSearch?: boolean;
  fetchImpl?: typeof fetch;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(params: CompleteParams): Promise<{ text: string }>;
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiError';
  }
}

export interface ProviderConfig {
  provider: 'openai' | 'anthropic' | 'perplexity' | 'nvidia' | 'huggingface';
  openaiApiKey?: string;
  openaiModel: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  perplexityApiKey?: string;
  perplexityChatModel: string;
  nvidiaApiKey?: string;
  nvidiaModel: string;
  huggingfaceApiKey?: string;
  huggingfaceModel: string;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const PERPLEXITY_AGENT_URL = 'https://api.perplexity.ai/v1/agent';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const HUGGINGFACE_URL = 'https://router.huggingface.co/v1/chat/completions';
const PROVIDER_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 1400;

async function timedFetch(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  providerName: string,
): Promise<Response> {
  try {
    return await doFetch(url, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new AiError(`${providerName} did not respond within ${PROVIDER_TIMEOUT_MS / 1000}s.`);
    }
    throw new AiError(`${providerName} request failed.`);
  }
}

function openaiProvider(apiKey: string, model: string): AiProvider {
  return {
    name: 'openai',
    model,
    async complete(params) {
      const response = await timedFetch(params.fetchImpl ?? fetch, OPENAI_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [{ role: 'system', content: params.system }, ...params.messages],
        }),
      }, 'OpenAI');

      if (!response.ok) throw new AiError(`OpenAI request failed (HTTP ${response.status}).`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new AiError('OpenAI returned no message.');
      return { text };
    },
  };
}

function anthropicProvider(apiKey: string, model: string): AiProvider {
  return {
    name: 'anthropic',
    model,
    async complete(params) {
      const response = await timedFetch(params.fetchImpl ?? fetch, ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: params.system,
          messages: params.messages,
        }),
      }, 'Anthropic');

      if (!response.ok) throw new AiError(`Anthropic request failed (HTTP ${response.status}).`);
      const body = (await response.json()) as { content?: { type?: string; text?: string }[] };
      const text = body.content?.find((block) => block.type === 'text')?.text;
      if (typeof text !== 'string') throw new AiError('Anthropic returned no text.');
      return { text };
    },
  };
}

function extractPerplexityText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;

  const value = body as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof value.output_text === 'string') return value.output_text;

  for (const item of value.output ?? []) {
    for (const part of item.content ?? []) {
      if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
        return part.text;
      }
    }
  }

  return null;
}

function perplexityAgentProvider(apiKey: string, model: string): AiProvider {
  return {
    name: 'perplexity',
    model,
    async complete(params) {
      const input = [
        `SYSTEM INSTRUCTIONS:\n${params.system}`,
        ...params.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`),
      ].join('\n\n');

      const body: Record<string, unknown> = {
        model,
        input,
      };

      if (params.allowWebSearch) {
        body.tools = [{ type: 'web_search' }];
      }

      const response = await timedFetch(params.fetchImpl ?? fetch, PERPLEXITY_AGENT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }, 'Perplexity Agent');

      if (!response.ok) {
        throw new AiError(`Perplexity Agent request failed (HTTP ${response.status}).`);
      }

      const text = extractPerplexityText(await response.json());
      if (!text) throw new AiError('Perplexity Agent returned no text.');
      return { text };
    },
  };
}

function nvidiaProvider(apiKey: string, model: string): AiProvider {
  return {
    name: 'nvidia',
    model,
    async complete(params) {
      const response = await timedFetch(params.fetchImpl ?? fetch, NVIDIA_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: (params.maxTokens ?? DEFAULT_MAX_TOKENS) + 400,
          messages: [{ role: 'system', content: params.system }, ...params.messages],
        }),
      }, 'NVIDIA');

      if (!response.ok) throw new AiError(`NVIDIA request failed (HTTP ${response.status}).`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new AiError('NVIDIA returned no message.');
      return { text };
    },
  };
}

function huggingfaceProvider(apiKey: string, model: string): AiProvider {
  return {
    name: 'huggingface',
    model,
    async complete(params) {
      const response = await timedFetch(params.fetchImpl ?? fetch, HUGGINGFACE_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [{ role: 'system', content: params.system }, ...params.messages],
        }),
      }, 'Hugging Face');

      if (!response.ok) throw new AiError(`Hugging Face request failed (HTTP ${response.status}).`);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new AiError('Hugging Face returned no message.');
      return { text };
    },
  };
}

function makeProvider(config: ProviderConfig, name: ProviderConfig['provider']): AiProvider | null {
  switch (name) {
    case 'openai':
      return config.openaiApiKey ? openaiProvider(config.openaiApiKey, config.openaiModel) : null;
    case 'anthropic':
      return config.anthropicApiKey ? anthropicProvider(config.anthropicApiKey, config.anthropicModel) : null;
    case 'perplexity':
      return config.perplexityApiKey
        ? perplexityAgentProvider(config.perplexityApiKey, config.perplexityChatModel)
        : null;
    case 'nvidia':
      return config.nvidiaApiKey ? nvidiaProvider(config.nvidiaApiKey, config.nvidiaModel) : null;
    case 'huggingface':
      return config.huggingfaceApiKey ? huggingfaceProvider(config.huggingfaceApiKey, config.huggingfaceModel) : null;
  }
}

export function resolveAiProvider(config: ProviderConfig): AiProvider | null {
  const order: ProviderConfig['provider'][] = [
    config.provider,
    ...(['openai', 'anthropic', 'perplexity', 'nvidia', 'huggingface'] as const).filter(
      (name) => name !== config.provider,
    ),
  ];

  const candidates = order
    .map((name) => makeProvider(config, name))
    .filter((provider): provider is AiProvider => provider !== null);

  if (candidates.length === 0) return null;

  let active = candidates[0];

  return {
    get name() {
      return active.name;
    },
    get model() {
      return active.model;
    },
    async complete(params) {
      let lastError: unknown;

      for (const candidate of candidates) {
        try {
          const result = await candidate.complete(params);
          active = candidate;
          return result;
        } catch (error) {
          lastError = error;
        }
      }

      if (lastError instanceof AiError) throw lastError;
      throw new AiError('All configured AI providers failed.');
    },
  };
}

export function stripFootnoteMarkers(text: string): string {
  return text
    .replace(/\[\d{1,2}\]/g, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}


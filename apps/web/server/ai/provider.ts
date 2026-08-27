export type AiProviderConfig = {
  provider: string;
  perplexityApiKey?: string;
  perplexityModel?: string;
};

export interface AiProvider {
  generate(input: {
    system: string;
    user: string;
  }): Promise<string>;

  generateStructured<T>(input: {
    system: string;
    user: string;
    schema: unknown;
  }): Promise<T>;
}

export function resolveAiProvider(
  config: AiProviderConfig,
): AiProvider {
  switch (config.provider) {
    case 'perplexity':
      return createPerplexityProvider({
        apiKey: config.perplexityApiKey,
        model: config.perplexityModel,
      });

    default:
      throw new Error(
        `Unsupported AI provider: ${config.provider}`,
      );
  }
}

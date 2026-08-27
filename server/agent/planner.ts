import type { AgentIntent, AgentTool } from './types';

export type AgentPlan = {
  intent: AgentIntent;
  reason: string;
  requiredCapabilities: string[];
  preferredTools: string[];
  useWeb: boolean;
  needsDecision: boolean;
};

export function createPlan(
  message: string,
  tools: AgentTool[],
): AgentPlan {
  const text = message.toLowerCase();

  const decisionWords = [
    'should',
    'do we',
    'should we',
    'recommend',
    'decision',
    'decide',
    'devons-nous',
    'doit-on',
    'recommande',
    'décision',
  ];

  const needsDecision = decisionWords.some((word) =>
    text.includes(word),
  );

  const internalSignals = [
    'email',
    'gmail',
    'client',
    'customer',
    'contract',
    'contrat',
    'team',
    'équipe',
    'project',
    'projet',
    'company',
    'entreprise',
    'sales',
    'vente',
  ];

  const requiresInternalData = internalSignals.some((word) =>
    text.includes(word),
  );

  const useWeb =
    text.includes('latest') ||
    text.includes('actualité') ||
    text.includes('news') ||
    text.includes('competitor') ||
    text.includes('concurrent') ||
    text.includes('market') ||
    text.includes('marché');

  const requiredCapabilities: string[] = [];

  if (requiresInternalData) {
    for (const tool of tools) {
      for (const capability of tool.capabilities) {
        if (capability.readOnly) {
          requiredCapabilities.push(capability.id);
        }
      }
    }
  }

  if (useWeb) {
    requiredCapabilities.push('web.search');
  }

  return {
    intent: needsDecision ? 'decision' : 'question',
    reason: needsDecision
      ? 'The user is asking for a recommendation or decision.'
      : 'The user is asking for information.',
    requiredCapabilities,
    preferredTools: requiresInternalData
      ? ['gmail', 'drive', 'slack', 'notion']
      : [],
    useWeb,
    needsDecision,
  };
}

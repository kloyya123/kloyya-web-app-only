import type { Evidence } from './types';

export type ToolExecutionContext = {
  organizationId: string;
  workspaceId: string;
  userId: string;
};

export interface ToolExecutor {
  execute(
    capability: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<Evidence[]>;
}

import type { AgentTool } from './types';

export const TOOL_REGISTRY: AgentTool[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read and search the workspace Gmail account.',
    available: true,
    capabilities: [
      {
        id: 'gmail.search',
        description: 'Search emails',
        readOnly: true,
        requiresApproval: false,
      },
      {
        id: 'gmail.read',
        description: 'Read an email',
        readOnly: true,
        requiresApproval: false,
      },
      {
        id: 'gmail.draft',
        description: 'Create an email draft',
        readOnly: false,
        requiresApproval: false,
      },
      {
        id: 'gmail.send',
        description: 'Send an email',
        readOnly: false,
        requiresApproval: true,
      },
    ],
  },

  {
    id: 'drive',
    name: 'Google Drive',
    description: 'Search and read workspace documents.',
    available: true,
    capabilities: [
      {
        id: 'drive.search',
        description: 'Search files',
        readOnly: true,
        requiresApproval: false,
      },
      {
        id: 'drive.read',
        description: 'Read file content',
        readOnly: true,
        requiresApproval: false,
      },
    ],
  },

  {
    id: 'slack',
    name: 'Slack',
    description: 'Search internal conversations.',
    available: true,
    capabilities: [
      {
        id: 'slack.search',
        description: 'Search messages',
        readOnly: true,
        requiresApproval: false,
      },
      {
        id: 'slack.thread',
        description: 'Read a conversation thread',
        readOnly: true,
        requiresApproval: false,
      },
    ],
  },

  {
    id: 'notion',
    name: 'Notion',
    description: 'Search internal knowledge.',
    available: true,
    capabilities: [
      {
        id: 'notion.search',
        description: 'Search workspace knowledge',
        readOnly: true,
        requiresApproval: false,
      },
      {
        id: 'notion.read',
        description: 'Read a page',
        readOnly: true,
        requiresApproval: false,
      },
    ],
  },

  {
    id: 'web',
    name: 'Web',
    description: 'Research external information.',
    available: true,
    capabilities: [
      {
        id: 'web.search',
        description: 'Search public information',
        readOnly: true,
        requiresApproval: false,
      },
    ],
  },
];

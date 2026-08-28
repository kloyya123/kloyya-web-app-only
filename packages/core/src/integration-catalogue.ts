import type {
  IntegrationCategory,
  IntegrationDefinition,
  IntegrationPermissions,
} from './integrations.js';

/**
 * The integration catalogue — PRIVATE BETA.
 *
 * A small set, not fifty. Kloyya Core Integrations (Private Beta) picks the
 * tools that carry the most context per connection — email, calendar, the two
 * places documents live, and team chat.
 *
 * WhatsApp Business is deliberately ABSENT despite being a headline beta
 * integration: the WhatsApp Cloud API cannot read message history at all.
 * Messages arrive only by webhook, forward-only, from the moment you connect.
 *
 * The rest of the long tail is documented as a post-beta expansion.
 *
 * This is product configuration, not mock data, which is why it lives in
 * @kloyya/core rather than the web app's mock folder.
 */

const PERMISSIONS: Record<IntegrationCategory, IntegrationPermissions> = {
  communication: {
    granted: ['Read messages', 'Read threads', 'Read attachments'],
    notGranted: ['Send messages', 'Delete messages', 'Share data externally'],
  },

  calendar: {
    granted: [
      'Read calendars',
      'Read events',
      'Read attendees',
      'Read reminders',
    ],
    notGranted: [
      'Edit events',
      'Delete events',
      'Share data externally',
    ],
  },

  documents: {
    granted: [
      'Read files',
      'Read folder structure',
      'Read sharing metadata',
    ],
    notGranted: [
      'Edit files',
      'Delete files',
      'Share data externally',
    ],
  },

  project_management: {
    granted: ['Read projects', 'Read tasks', 'Read comments'],
    notGranted: [
      'Edit tasks',
      'Delete items',
      'Share data externally',
    ],
  },

  crm: {
    granted: [
      'Read contacts',
      'Read deals',
      'Read activity history',
    ],
    notGranted: [
      'Edit records',
      'Delete records',
      'Share data externally',
    ],
  },

  engineering: {
    granted: [
      'Read repositories',
      'Read issues',
      'Read pull requests',
    ],
    notGranted: [
      'Write code',
      'Merge changes',
      'Share data externally',
    ],
  },

  design: {
    granted: ['Read files', 'Read comments'],
    notGranted: [
      'Edit designs',
      'Share data externally',
    ],
  },

  meetings: {
    granted: [
      'Read meetings',
      'Read recordings',
      'Read transcripts',
    ],
    notGranted: [
      'Schedule meetings',
      'Delete recordings',
      'Share data externally',
    ],
  },

  finance: {
    granted: ['Read invoices', 'Read transactions'],
    notGranted: [
      'Create payments',
      'Edit records',
      'Share data externally',
    ],
  },

  cloud_storage: {
    granted: ['Read objects', 'Read metadata'],
    notGranted: [
      'Write objects',
      'Delete objects',
      'Share data externally',
    ],
  },

  ai_productivity: {
    granted: ['Read conversations you choose to share'],
    notGranted: [
      'Send prompts on your behalf',
      'Share data externally',
    ],
  },

  hr: {
    granted: ['Read directory', 'Read org structure'],
    notGranted: [
      'Edit employee data',
      'Share data externally',
    ],
  },

  marketing: {
    granted: ['Read campaigns', 'Read performance metrics'],
    notGranted: [
      'Send campaigns',
      'Edit audiences',
      'Share data externally',
    ],
  },

  custom: {
    granted: ['Read the endpoints you approve'],
    notGranted: [
      'Write operations unless explicitly granted',
      'Share data externally',
    ],
  },
};

/**
 * Create one catalogue definition.
 *
 * The icon is part of the integration definition so the Connections Manager
 * has one source of truth for the integration identity and presentation.
 */
function define(
  id: string,
  name: string,
  category: IntegrationCategory,
  description: string,
  estimatedSyncMinutes: number,
  icon: string,
): IntegrationDefinition {
  return {
    id,
    name,
    category,
    description,
    permissions: PERMISSIONS[category],
    estimatedSyncMinutes,
    icon,
  };
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  // Email.
  define(
    'gmail',
    'Gmail',
    'communication',
    'Understands your email threads, priorities, and follow-ups.',
    12,
    '/icons/gmail.svg',
  ),

  // Calendar.
  define(
    'google_calendar',
    'Google Calendar',
    'calendar',
    'Knows your schedule, attendees, and preparation windows.',
    3,
    '/icons/google-calendar.svg',
  ),

  // Documents & knowledge.
  define(
    'google_drive',
    'Google Drive',
    'documents',
    'Indexes the documents your decisions depend on.',
    25,
    '/icons/google-drive.svg',
  ),

  define(
    'notion',
    'Notion',
    'documents',
    'Turns your workspace pages into organizational memory.',
    15,
    '/icons/notion.svg',
  ),

  // Team chat.
  define(
    'slack',
    'Slack',
    'communication',
    'Reads the channels it is invited into, so decisions made in chat are not lost to it.',
    10,
    '/icons/slack.svg',
  ),
];

/**
 * Which integrations Northwind already has connected.
 *
 * This constant is intentionally kept compatible with the existing beta
 * service and tests. It can be expanded when the real connection catalogue
 * grows.
 */

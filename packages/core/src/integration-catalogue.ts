
import type {
  IntegrationCategory,
  IntegrationDefinition,
  IntegrationPermissions,
} from './integrations.js';

/**
 * Kloyya integration catalogue.
 *
 * This catalogue is the product-level source of truth for the Connections
 * Manager. Authentication/provider configuration is deliberately kept outside
 * Core and handled by the web integration layer (Composio).
 */

const PERMISSIONS: Record<IntegrationCategory, IntegrationPermissions> = {
  communication: {
    granted: [
      'Read messages',
      'Read threads',
      'Read attachments',
    ],
    notGranted: [
      'Send messages',
      'Delete messages',
      'Share data externally',
    ],
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
    granted: [
      'Read projects',
      'Read tasks',
      'Read comments',
    ],
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
    granted: [
      'Read files',
      'Read comments',
    ],
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
    granted: [
      'Read invoices',
      'Read transactions',
    ],
    notGranted: [
      'Create payments',
      'Edit records',
      'Share data externally',
    ],
  },

  cloud_storage: {
    granted: [
      'Read objects',
      'Read metadata',
    ],
    notGranted: [
      'Write objects',
      'Delete objects',
      'Share data externally',
    ],
  },

  ai_productivity: {
    granted: [
      'Read conversations you choose to share',
    ],
    notGranted: [
      'Send prompts on your behalf',
      'Share data externally',
    ],
  },

  hr: {
    granted: [
      'Read directory',
      'Read org structure',
    ],
    notGranted: [
      'Edit employee data',
      'Share data externally',
    ],
  },

  marketing: {
    granted: [
      'Read campaigns',
      'Read performance metrics',
    ],
    notGranted: [
      'Send campaigns',
      'Edit audiences',
      'Share data externally',
    ],
  },

  custom: {
    granted: [
      'Read the endpoints you approve',
    ],
    notGranted: [
      'Write operations unless explicitly granted',
      'Share data externally',
    ],
  },
};

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
  // ---------------------------------------------------------------------------
  // COMMUNICATION
  // ---------------------------------------------------------------------------

  define(
    'gmail',
    'Gmail',
    'communication',
    'Understands your email threads, priorities, follow-ups, and communication history.',
    12,
    '/icons/gmail.svg',
  ),

  define(
    'slack',
    'Slack',
    'communication',
    'Reads the conversations and threads Kloyya is invited to so important decisions are not lost.',
    10,
    '/icons/slack.svg',
  ),

  define(
    'whatsapp',
    'WhatsApp',
    'communication',
    'Connects approved WhatsApp business conversations and customer communication.',
    15,
    '/icons/whatsapp.svg',
  ),

  define(
    'outlook',
    'Outlook',
    'communication',
    'Understands your Outlook email, threads, and communication history.',
    12,
    '/icons/outlook.svg',
  ),

  define(
    'microsoft_teams',
    'Microsoft Teams',
    'communication',
    'Reads approved Teams conversations and threads so decisions remain available to Kloyya.',
    10,
    '/icons/microsoft-teams.svg',
  ),

  // ---------------------------------------------------------------------------
  // CALENDAR
  // ---------------------------------------------------------------------------

  define(
    'google_calendar',
    'Google Calendar',
    'calendar',
    'Knows your schedule, attendees, preparation windows, and upcoming commitments.',
    3,
    '/icons/google-calendar.svg',
  ),

  // ---------------------------------------------------------------------------
  // DOCUMENTS & KNOWLEDGE
  // ---------------------------------------------------------------------------

  define(
    'google_drive',
    'Google Drive',
    'documents',
    'Indexes the documents and folders your decisions depend on.',
    25,
    '/icons/google-drive.svg',
  ),

  define(
    'google_sheets',
    'Google Sheets',
    'documents',
    'Understands approved spreadsheets, tables, and operational data.',
    20,
    '/icons/google-sheets.svg',
  ),

  define(
    'google_docs',
    'Google Docs',
    'documents',
    'Reads approved documents and turns organizational knowledge into usable context.',
    15,
    '/icons/google-docs.svg',
  ),

  define(
    'notion',
    'Notion',
    'documents',
    'Turns your workspace pages and knowledge base into organizational memory.',
    15,
    '/icons/notion.svg',
  ),

  define(
    'airtable',
    'Airtable',
    'documents',
    'Understands structured workspace data stored in approved Airtable bases.',
    20,
    '/icons/airtable.svg',
  ),

  define(
    'onedrive',
    'OneDrive',
    'cloud_storage',
    'Indexes approved files and folders stored in Microsoft OneDrive.',
    25,
    '/icons/onedrive.svg',
  ),

  // ---------------------------------------------------------------------------
  // PRODUCTIVITY
  // ---------------------------------------------------------------------------

  define(
    'google_tasks',
    'Google Tasks',
    'project_management',
    'Understands personal and operational tasks managed through Google Tasks.',
    5,
    '/icons/google-tasks.svg',
  ),

  define(
    'todoist',
    'Todoist',
    'project_management',
    'Understands tasks, priorities, projects, and follow-ups managed in Todoist.',
    8,
    '/icons/todoist.svg',
  ),

  define(
    'clickup',
    'ClickUp',
    'project_management',
    'Reads approved projects, tasks, comments, and operational planning.',
    15,
    '/icons/clickup.svg',
  ),

  // ---------------------------------------------------------------------------
  // CRM
  // ---------------------------------------------------------------------------

  define(
    'hubspot',
    'HubSpot',
    'crm',
    'Understands approved contacts, deals, activities, and customer history.',
    20,
    '/icons/hubspot.svg',
  ),

  define(
    'salesforce',
    'Salesforce',
    'crm',
    'Understands approved customer records, opportunities, and activity history.',
    25,
    '/icons/salesforce.svg',
  ),

  define(
    'pipedrive',
    'Pipedrive',
    'crm',
    'Understands sales pipelines, deals, contacts, and commercial activity.',
    15,
    '/icons/pipedrive.svg',
  ),

  define(
    'zoho',
    'Zoho',
    'crm',
    'Understands approved customer records, deals, and business activity in Zoho.',
    20,
    '/icons/zoho.svg',
  ),

  define(
    'odoo',
    'Odoo',
    'crm',
    'Connects approved business records and operational information from Odoo.',
    25,
    '/icons/odoo.svg',
  ),

  // ---------------------------------------------------------------------------
  // SOCIAL & MARKETING
  // ---------------------------------------------------------------------------

  define(
    'instagram',
    'Instagram',
    'marketing',
    'Understands approved Instagram content, account activity, and performance signals.',
    15,
    '/icons/instagram.svg',
  ),

  define(
    'facebook',
    'Facebook',
    'marketing',
    'Understands approved Facebook pages, content activity, and performance signals.',
    15,
    '/icons/facebook.svg',
  ),

  define(
    'linkedin',
    'LinkedIn',
    'marketing',
    'Understands approved LinkedIn activity, content, and professional audience signals.',
    15,
    '/icons/linkedin.svg',
  ),

  define(
    'meta_ads',
    'Meta Ads',
    'marketing',
    'Understands approved advertising campaigns, performance, and marketing metrics.',
    15,
    '/icons/meta-ads.svg',
  ),

  define(
    'mailchimp',
    'Mailchimp',
    'marketing',
    'Understands approved email campaigns, performance metrics, and audience activity.',
    15,
    '/icons/mailchimp.svg',
  ),

  // ---------------------------------------------------------------------------
  // COMMERCE & DESIGN
  // ---------------------------------------------------------------------------

  define(
    'shopify',
    'Shopify',
    'finance',
    'Understands approved store activity, orders, and commercial performance data.',
    20,
    '/icons/shopify.svg',
  ),

  define(
    'canva',
    'Canva',
    'design',
    'Reads approved designs and comments so Kloyya can understand the visual work behind decisions.',
    15,
    '/icons/canva.svg',
  ),

  // ---------------------------------------------------------------------------
  // MEETINGS
  // ---------------------------------------------------------------------------

  define(
    'zoom',
    'Zoom',
    'meetings',
    'Understands approved meetings, recordings, and transcripts.',
    15,
    '/icons/zoom.svg',
  ),

  define(
    'google_meet',
    'Google Meet',
    'meetings',
    'Understands approved meeting recordings, transcripts, and meeting context.',
    15,
    '/icons/google-meets.svg',
  ),
];


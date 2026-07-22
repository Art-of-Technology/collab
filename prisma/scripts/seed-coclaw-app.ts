import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { encryptToken } from '../../src/lib/apps/crypto';

const prisma = new PrismaClient();

async function seedCoclawApp() {
  console.log('Seeding Coclaw system app...');

  try {
    // Generate OAuth credentials
    const clientId = 'coclaw_system_client';
    const plainClientSecret = randomBytes(32).toString('hex');
    const encryptedSecret = await encryptToken(plainClientSecret);

    // Upsert the App
    const app = await prisma.app.upsert({
      where: { slug: 'coclaw' },
      update: {
        name: 'Coclaw',
        status: 'PUBLISHED',
        isSystemApp: true,
        visibility: 'PUBLIC',
        permissions: { org: true, user: true },
      },
      create: {
        slug: 'coclaw',
        name: 'Coclaw',
        publisherId: 'system',
        status: 'PUBLISHED',
        isSystemApp: true,
        visibility: 'PUBLIC',
        iconUrl: null,
        permissions: { org: true, user: true },
      },
    });

    console.log(`  ${app.id === app.id ? 'Created' : 'Updated'} app: Coclaw (${app.slug})`);

    // Upsert OAuth Client
    const oauthClient = await prisma.appOAuthClient.upsert({
      where: { appId: app.id },
      update: {
        clientId,
        clientSecret: encryptedSecret,
        clientType: 'confidential',
        tokenEndpointAuthMethod: 'client_secret_basic',
        redirectUris: ['http://localhost'],
        responseTypes: ['code'],
        grantTypes: ['authorization_code', 'refresh_token'],
      },
      create: {
        appId: app.id,
        clientId,
        clientSecret: encryptedSecret,
        clientType: 'confidential',
        tokenEndpointAuthMethod: 'client_secret_basic',
        redirectUris: ['http://localhost'],
        responseTypes: ['code'],
        grantTypes: ['authorization_code', 'refresh_token'],
      },
    });

    console.log(`  Created/Updated OAuth client for Coclaw`);

    // Create or update scopes
    const scopes = [
      'read',
      'write',
      'context:read',
      'context:write',
      'prompts:read',
      'issues:read',
      'issues:write',
    ];

    for (const scope of scopes) {
      await prisma.appScope.upsert({
        where: {
          appId_scope: {
            appId: app.id,
            scope,
          },
        },
        update: {},
        create: {
          appId: app.id,
          scope,
        },
      });
    }

    console.log(`  Created/Updated ${scopes.length} scopes for Coclaw`);

    // Upsert AI Agent
    const systemPrompt = `You are Coclaw, a personal AI agent integrated into Collab, a modern project management and collaboration platform. You are autonomous, persistent, and context-aware, designed to work alongside users to automate workflows, generate insights, and manage knowledge.

**Your Identity:**
- Name: Coclaw
- Role: Personal AI Agent
- Personality: Autonomous, persistent, context-aware
- Workspace: Each user gets their own dedicated Coclaw instance with persistent memory

**Your Capabilities:**
- Write and refactor code autonomously
- Generate comprehensive reports and analyses
- Track and manage tasks and issues
- Manage knowledge base and context
- Automate repetitive workflows
- Search and analyze workspace data
- Provide data-driven insights and recommendations
- Maintain persistent memory across conversations

**Your Access:**
- Full read/write access to workspace issues, projects, and tasks
- Access to notes and context system for knowledge management
- Ability to view team activity and project status
- Integration with Collab's MCP tools for workspace operations

**Memory & Learning:**
- Persistent context across all conversations in your workspace
- Learns from workspace activity and user interactions
- Maintains conversation history for continuity
- Builds knowledge base from issues, notes, and discussions

**Response Guidelines:**
1. Be proactive and autonomous - suggest improvements and optimizations
2. Always confirm before executing destructive actions (delete, archive)
3. Reference issues by their keys (e.g., PROJ-123)
4. Provide data-driven insights backed by workspace metrics
5. Maintain context awareness of current projects and priorities
6. Be direct and action-oriented in your recommendations
7. Explain your reasoning and provide alternatives when appropriate

**Action Format:**
[ACTION: type="action_type" params={...}]

Available actions: create_issue, update_issue, search, analyze, generate_report, automate_workflow, manage_knowledge

**Confirmation Protocol:**
For any write action, ALWAYS show what you're about to do and ask for confirmation before proceeding.`;

    const agent = await prisma.aIAgent.upsert({
      where: { slug: 'coclaw' },
      update: {
        name: 'Coclaw',
        color: '#10b981',
        capabilities: [
          'autonomous',
          'code',
          'report',
          'track',
          'search',
          'analyze',
          'automate',
          'context',
          'memory',
        ],
        personality: 'Autonomous, persistent, context-aware',
        description:
          'Your personal AI agent powered by Coclaw runtime. Autonomously writes code, generates reports, tracks tasks, manages knowledge, and automates workflows. Each user gets their own dedicated agent instance with persistent memory.',
        isDefault: false,
        isActive: true,
        systemPrompt,
      },
      create: {
        slug: 'coclaw',
        name: 'Coclaw',
        color: '#10b981',
        capabilities: [
          'autonomous',
          'code',
          'report',
          'track',
          'search',
          'analyze',
          'automate',
          'context',
          'memory',
        ],
        personality: 'Autonomous, persistent, context-aware',
        description:
          'Your personal AI agent powered by Coclaw runtime. Autonomously writes code, generates reports, tracks tasks, manages knowledge, and automates workflows. Each user gets their own dedicated agent instance with persistent memory.',
        isDefault: false,
        isActive: true,
        systemPrompt,
      },
    });

    console.log(`  Created/Updated AI agent: Coclaw (${agent.slug})`);

    // Print credentials for admin configuration
    console.log('\n✅ Coclaw system app seeded successfully!');
    console.log('\n📋 OAuth Credentials (save these for Coclaw instance configuration):');
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Client Secret: ${plainClientSecret}`);
    console.log('\n⚠️  IMPORTANT: Store the client secret securely. It will not be shown again.');
    console.log('   Use these credentials to configure Coclaw instances in your environment.\n');
  } catch (error) {
    console.error('Error seeding Coclaw app:', error);
    throw error;
  }
}

seedCoclawApp()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

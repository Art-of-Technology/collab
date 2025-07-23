#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { CollabAPIClient } from './database/index.js';
import { setupTools } from './tools/index.js';
import { setupResources } from './resources/index.js';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

// Validation schema for environment variables
const envSchema = z.object({
  COLLAB_API_URL: z.string().default('http://localhost:3000'),
  MCP_SERVER_NAME: z.string().default('collab-mcp-server'),
  MCP_SERVER_VERSION: z.string().default('1.0.0'),
});

const env = envSchema.parse(process.env);

class CollabMCPServer {
  private server: Server;
  private apiClient: CollabAPIClient;

  constructor() {
    this.server = new Server(
      {
        name: env.MCP_SERVER_NAME,
        version: env.MCP_SERVER_VERSION,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.apiClient = new CollabAPIClient(env.COLLAB_API_URL);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await setupTools(this.apiClient);
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const tools = await setupTools(this.apiClient);
        const tool = tools.find(t => t.name === name);
        
        if (!tool) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool '${name}' not found`
          );
        }

        const result = await tool.handler(args || {});
        return result;
      } catch (error) {
        logger.error(`Tool execution error for ${name}:`, error);
        
        if (error instanceof McpError) {
          throw error;
        }

        // Handle authentication errors specially
        if (error instanceof Error && error.message.includes('Not authenticated')) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Not authenticated. Please use the "login" tool to authenticate with your Collab account.'
          );
        }

        if (error instanceof Error && error.message.includes('Session expired')) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Session expired. Please use the "login" tool to authenticate again.'
          );
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const resources = await setupResources(this.apiClient);
        return {
          resources: resources.map(resource => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
          })),
        };
      } catch (error) {
        // If not authenticated, return empty resources
        if (error instanceof Error && error.message.includes('Not authenticated')) {
          return {
            resources: [],
          };
        }
        throw error;
      }
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      try {
        const resources = await setupResources(this.apiClient);
        const resource = resources.find(r => r.uri === uri);
        
        if (!resource) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Resource '${uri}' not found`
          );
        }

        const content = await resource.handler();
        return {
          contents: [
            {
              uri,
              mimeType: resource.mimeType,
              text: content,
            },
          ],
        };
      } catch (error) {
        logger.error(`Resource read error for ${uri}:`, error);
        
        if (error instanceof McpError) {
          throw error;
        }

        // Handle authentication errors specially
        if (error instanceof Error && error.message.includes('Not authenticated')) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Not authenticated. Please use the "login" tool to authenticate with your Collab account.'
          );
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Resource read failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  async start(): Promise<void> {
    // Initialize API client connection
    await this.apiClient.connect();
    logger.info('API client connected successfully');

    // Start the server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`Collab MCP Server v${env.MCP_SERVER_VERSION} started`);
    logger.info('To get started, use the "login" tool to authenticate with your Collab account.');
  }

  async stop(): Promise<void> {
    await this.apiClient.disconnect();
    logger.info('Collab MCP Server stopped');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the server
const server = new CollabMCPServer();
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
}); 
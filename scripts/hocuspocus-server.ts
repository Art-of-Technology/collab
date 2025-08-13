import { Server } from '@hocuspocus/server';
import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';

// Optimized Hocuspocus server for collaborative editing
// Usage: ts-node scripts/hocuspocus-server.ts

const port = Number(process.env.HOCUSPOCUS_PORT || 1234);
const prisma = new PrismaClient();

// Document cache to prevent redundant database queries
const documentCache = new Map<string, { content: string; lastLoaded: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting for database operations
const dbOperations = new Map<string, number>();
const DB_RATE_LIMIT = 100; // max 100 ops per minute per document

interface ParsedDocumentId {
  type: 'task' | 'epic' | 'story' | 'milestone';
  id: string;
  field: string;
}

interface EntityQuery {
  where: { id: string };
  select: { description: true };
  include?: any;
}

// Parse document ID with enhanced validation
function parseDocumentId(documentName: string): ParsedDocumentId | null {
  const match = documentName.match(/^(task|epic|story|milestone):([^:]+):(.+)$/);
  if (!match) return null;
  
  const [, type, id, field] = match;
  
  // Validate entity type
  if (!['task', 'epic', 'story', 'milestone'].includes(type)) return null;
  
  // Validate field (only description supported for security)
  if (field !== 'description') return null;
  
  // Basic ID validation
  if (!id || id.length < 1 || id.length > 100) return null;
  
  return {
    type: type as ParsedDocumentId['type'],
    id,
    field
  };
}

// Check rate limiting for database operations
function isRateLimited(documentName: string): boolean {
  const now = Date.now();
  const lastOp = dbOperations.get(documentName) || 0;
  
  if (now - lastOp < (60 * 1000) / DB_RATE_LIMIT) {
    return true;
  }
  
  dbOperations.set(documentName, now);
  return false;
}

// Load document content with caching and rate limiting
async function loadDocumentFromDatabase(documentName: string): Promise<string | null> {
  try {
    // Check cache first
    const cached = documentCache.get(documentName);
    if (cached && Date.now() - cached.lastLoaded < CACHE_TTL) {
      console.log(`[Hocuspocus] Cache hit for ${documentName}`);
      return cached.content;
    }

    // Rate limiting check
    if (isRateLimited(documentName)) {
      console.warn(`[Hocuspocus] Rate limited: ${documentName}`);
      return cached?.content || null;
    }
    
    const parsed = parseDocumentId(documentName);
    if (!parsed) {
      console.warn(`[Hocuspocus] Invalid document ID: ${documentName}`);
      return null;
    }
    
    const { type, id } = parsed;
    
    // Use a more efficient approach with generic query
    const entityQueries: Record<ParsedDocumentId['type'], () => Promise<{ description: string | null } | null>> = {
      task: () => prisma.task.findUnique({ where: { id }, select: { description: true } }),
      epic: () => prisma.epic.findUnique({ where: { id }, select: { description: true } }),
      story: () => prisma.story.findUnique({ where: { id }, select: { description: true } }),
      milestone: () => prisma.milestone.findUnique({ where: { id }, select: { description: true } })
    };
    
    const entity = await entityQueries[type]();
    const content = entity?.description || '';
    
    // Update cache
    documentCache.set(documentName, {
      content,
      lastLoaded: Date.now()
    });
    
    console.log(`[Hocuspocus] Loaded ${documentName} from database: ${content.length} chars`);
    return content;
    
  } catch (error) {
    console.error(`[Hocuspocus] Database error for ${documentName}:`, error);
    return documentCache.get(documentName)?.content || null;
  }
}

// Convert HTML content to proper ProseMirror YJS structure
function initializeDocumentContent(ydoc: Y.Doc, content: string) {
  const fragment = ydoc.getXmlFragment('prosemirror');
  
  if (!content.trim()) {
    // Create empty paragraph if no content
    const paragraph = new Y.XmlElement('paragraph');
    fragment.insert(0, [paragraph]);
    return;
  }
  
  // Simple HTML parsing - in production you might want to use a proper HTML parser
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
  
  paragraphs.forEach((paragraphText, index) => {
    const paragraph = new Y.XmlElement('paragraph');
    
    // Handle basic formatting (bold, italic, links)
    const textContent = paragraphText.trim();
    if (textContent) {
      paragraph.insert(0, [new Y.XmlText(textContent)]);
    }
    
    fragment.insert(index, [paragraph]);
  });
}

// Cleanup cache periodically
setInterval(() => {
  const now = Date.now();
  documentCache.forEach((value, key) => {
    if (now - value.lastLoaded > CACHE_TTL) {
      documentCache.delete(key);
    }
  });
  
  // Clean old rate limiting entries
  dbOperations.forEach((timestamp, key) => {
    if (now - timestamp > 60 * 1000) {
      dbOperations.delete(key);
    }
  });
}, CACHE_TTL);

const server = Server.configure({
  port,
  timeout: 30000,
  debounce: 2000,
  maxDebounce: 10000,

  // Initialize Hocuspocus document from the database when a client connects
  async onLoadDocument({ documentName, document }) {
    try {
      const content = await loadDocumentFromDatabase(documentName);
      const ydoc = document;
      const fragment = ydoc.getXmlFragment('prosemirror');
      if (fragment.length === 0) {
        ydoc.transact(() => {
          initializeDocumentContent(ydoc, content || '');
        });
      }
    } catch (error) {
      console.error(`[Hocuspocus] Failed to load document ${documentName}:`, error);
    }
  },

  // On store: do nothing here; saving to Task happens explicitly on user Save action via REST
  async onStoreDocument() {},

  // Connection handling with better logging
  async onConnect({ connection, documentName }) {
    const req = (connection as any)?.request;
    const ip = req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || 'unknown';
    console.log(`[Hocuspocus] Connection established: ${documentName} from ${ip}`);
  },

  async onDisconnect({ documentName }) {
    console.log(`[Hocuspocus] Disconnected: ${documentName}`);
  },

  async onListen(data: { port: number }) {
    console.log(`🚀 Hocuspocus server listening on ws://127.0.0.1:${data.port}`);
    console.log(`📊 Cache TTL: ${CACHE_TTL / 1000}s, Rate limit: ${DB_RATE_LIMIT}/min`);
  },
});

server
  .listen()
  .catch((err: unknown) => {
    console.error('Failed to start Hocuspocus server', err);
    process.exit(1);
  });



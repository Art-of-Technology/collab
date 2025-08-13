import { Server } from '@hocuspocus/server';
import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { Node as TiptapNode } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import Heading from '@tiptap/extension-heading';
import Image from '@tiptap/extension-image';
import ListItem from '@tiptap/extension-list-item';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

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

// Load document content directly from database (no cache)
async function loadDocumentFromDatabase(documentName: string): Promise<string | null> {
  try {
    const parsed = parseDocumentId(documentName);
    if (!parsed) {
      console.warn(`[Hocuspocus] Invalid document ID: ${documentName}`);
      return null;
    }

    const { type, id } = parsed;
    const entityQueries: Record<ParsedDocumentId['type'], () => Promise<{ description: string | null } | null>> = {
      task: () => prisma.task.findUnique({ where: { id }, select: { description: true } }),
      epic: () => prisma.epic.findUnique({ where: { id }, select: { description: true } }),
      story: () => prisma.story.findUnique({ where: { id }, select: { description: true } }),
      milestone: () => prisma.milestone.findUnique({ where: { id }, select: { description: true } })
    };

    const entity = await entityQueries[type]();
    const content = entity?.description || '';
    console.log(`[Hocuspocus] Loaded ${documentName} from database: ${content.length} chars`);
    return content;
  } catch (error) {
    console.error(`[Hocuspocus] Database error for ${documentName}:`, error);
    return null;
  }
}

// Convert HTML content to proper ProseMirror YJS structure
const ServerMention = TiptapNode.create({
  name: 'mention',
  inline: true,
  group: 'inline',
  atom: true,
  addAttributes() {
    return {
      id: { default: null },
      name: { default: null },
    };
  },
  parseHTML() {
    return [
      { tag: 'span.mention[data-mention]' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { class: 'mention', 'data-mention': 'true', 'data-id': HTMLAttributes.id, 'data-name': HTMLAttributes.name }, 0];
  },
});

const tiptapExtensions = [
  Document,
  Paragraph,
  Text,
  Heading,
  Bold,
  Italic,
  Underline,
  TextStyle,
  Color,
  Link,
  Code,
  CodeBlock,
  Image.configure({ allowBase64: true }),
  ListItem,
  BulletList,
  OrderedList,
  Blockquote,
  HorizontalRule,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  ServerMention,
];

function initializeDocumentContent(ydoc: Y.Doc, content: string) {
  if (!content || !content.trim()) {
    const fragment = ydoc.getXmlFragment('prosemirror');
    const paragraph = new Y.XmlElement('paragraph');
    fragment.insert(0, [paragraph]);
    return;
  }

  try {
    // Wrap top-level <img> tags into paragraphs to fit schema
    const normalizedHtml = content.replace(/(^|\n|>)(\s*<img\b[^>]*>)/gi, '$1<p>$2</p>');
    const json = generateJSON(normalizedHtml, tiptapExtensions);
    const parsed = TiptapTransformer.toYdoc(json as any, 'prosemirror', tiptapExtensions);
    const update = Y.encodeStateAsUpdate(parsed);
    Y.applyUpdate(ydoc, update);
  } catch (e) {
    // Fallback: insert plain text if parsing fails
    const stripTags = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const plain = stripTags(content);
    const fragment = ydoc.getXmlFragment('prosemirror');
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(plain)]);
    fragment.insert(0, [paragraph]);
  }
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

  // Initialize/refresh Hocuspocus document from the database on every connection
  async onLoadDocument({ documentName, document }) {
    try {
      const content = await loadDocumentFromDatabase(documentName);
      console.log(`[HP] onLoadDocument db html for ${documentName}:`, (content || '').slice(0, 200));
      const ydoc = document;
      const fragment = ydoc.getXmlFragment('prosemirror');
      // Always reset to DB state to avoid stale or previously malformed content
      ydoc.transact(() => {
        if (fragment.length > 0) {
          fragment.delete(0, fragment.length);
        }
        initializeDocumentContent(ydoc, content || '');
      });
      try {
        const json = TiptapTransformer.fromYdoc(ydoc, 'prosemirror');
        console.log(`[HP] onLoadDocument ydoc->json for ${documentName}:`, JSON.stringify(json).slice(0, 200));
      } catch (e) {
        console.log(`[HP] onLoadDocument could not serialize ydoc for ${documentName}:`, e);
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



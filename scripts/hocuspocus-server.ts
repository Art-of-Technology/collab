import { Server } from '@hocuspocus/server';
import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
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
import { Extension } from '@tiptap/react';
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';

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
// Custom Mention nodes to ensure mentions in stored HTML are preserved when initializing Yjs
// Minimal ResizableImage to preserve width/height set by the client editor
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attributes: any) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      height: {
        default: null,
        renderHTML: (attributes: any) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
    } as any;
  },
});
const Mention = TiptapNode.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: false,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { 'data-id': attributes.id };
        },
      },
      name: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-name'),
        renderHTML: attributes => {
          if (!attributes.name) return {};
          return { 'data-name': attributes.name };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-user-id') || el.getAttribute('data-id');
          const name = el.getAttribute('data-user-name') || el.getAttribute('data-name') || el.textContent?.replace('@', '');
          if (!id || !name) return false;
          return { id, name };
        },
      },
      // Backward compatibility: handle <span class="mention" data-user-id=...>
      {
        tag: 'span.mention',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-user-id') || el.getAttribute('data-id');
          const name = el.getAttribute('data-user-name') || el.getAttribute('data-name') || el.textContent?.replace('@', '');
          if (!id || !name) return false;
          return { id, name };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes({ 'data-mention': true, class: 'mention' }, HTMLAttributes),
      ['span', { class: 'mention-symbol' }, '@'],
      node.attrs.name,
    ];
  },
});

const TaskMention = TiptapNode.create({
  name: 'taskMention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { 'data-id': attributes.id };
        },
      },
      title: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) return {};
          return { 'data-title': attributes.title };
        },
      },
      issueKey: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) return {};
          return { 'data-issue-key': attributes.issueKey };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-task-mention]',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-task-id') || el.getAttribute('data-id');
          const title = el.getAttribute('data-task-title') || el.getAttribute('data-title') || el.textContent?.replace('#', '');
          const issueKey = el.getAttribute('data-task-issue-key') || el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
      {
        tag: 'span.task-mention',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-id');
          const title = el.getAttribute('data-title') || el.textContent?.replace('#', '');
          const issueKey = el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes({ 'data-task-mention': true, class: 'task-mention' }, HTMLAttributes),
      ['span', { class: 'mention-symbol' }, '#'],
      displayText,
    ];
  },
});

const EpicMention = TiptapNode.create({
  name: 'epicMention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { 'data-id': attributes.id };
        },
      },
      title: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) return {};
          return { 'data-title': attributes.title };
        },
      },
      issueKey: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) return {};
          return { 'data-issue-key': attributes.issueKey };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-epic-mention]',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-epic-id') || el.getAttribute('data-id');
          const title = el.getAttribute('data-epic-title') || el.getAttribute('data-title') || el.textContent?.replace('~', '');
          const issueKey = el.getAttribute('data-epic-issue-key') || el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
      {
        tag: 'span.epic-mention',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-id');
          const title = el.getAttribute('data-title') || el.textContent?.replace('~', '');
          const issueKey = el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes({ 'data-epic-mention': true, class: 'epic-mention' }, HTMLAttributes),
      ['span', { class: 'mention-symbol' }, '~'],
      displayText,
    ];
  },
});

const StoryMention = TiptapNode.create({
  name: 'storyMention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { 'data-id': attributes.id };
        },
      },
      title: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) return {};
          return { 'data-title': attributes.title };
        },
      },
      issueKey: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) return {};
          return { 'data-issue-key': attributes.issueKey };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-story-mention]',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-story-id') || el.getAttribute('data-id');
          const title = el.getAttribute('data-story-title') || el.getAttribute('data-title') || el.textContent?.replace('^', '');
          const issueKey = el.getAttribute('data-story-issue-key') || el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
      {
        tag: 'span.story-mention',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-id');
          const title = el.getAttribute('data-title') || el.textContent?.replace('^', '');
          const issueKey = el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes({ 'data-story-mention': true, class: 'story-mention' }, HTMLAttributes),
      ['span', { class: 'mention-symbol' }, '^'],
      displayText,
    ];
  },
});

const MilestoneMention = TiptapNode.create({
  name: 'milestoneMention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { 'data-id': attributes.id };
        },
      },
      title: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) return {};
          return { 'data-title': attributes.title };
        },
      },
      issueKey: {
        default: null,
        parseHTML: element => (element as HTMLElement).getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) return {};
          return { 'data-issue-key': attributes.issueKey };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-milestone-mention]',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-milestone-id') || el.getAttribute('data-id');
          const title = el.getAttribute('data-milestone-title') || el.getAttribute('data-title') || el.textContent?.replace('!', '');
          const issueKey = el.getAttribute('data-milestone-issue-key') || el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
      {
        tag: 'span.milestone-mention',
        getAttrs: element => {
          const el = element as HTMLElement;
          const id = el.getAttribute('data-id');
          const title = el.getAttribute('data-title') || el.textContent?.replace('!', '');
          const issueKey = el.getAttribute('data-issue-key') || '';
          if (!id || !title) return false;
          return { id, title, issueKey };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes({ 'data-milestone-mention': true, class: 'milestone-mention' }, HTMLAttributes),
      ['span', { class: 'mention-symbol' }, '!'],
      displayText,
    ];
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
  ResizableImage,
  ListItem,
  BulletList,
  OrderedList,
  Blockquote,
  HorizontalRule,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  // Custom mentions
  Mention,
  TaskMention,
  EpicMention,
  StoryMention,
  MilestoneMention,
];

function initializeDocumentContent(ydoc: Y.Doc, content: string) {
  if (!content || !content.trim()) {
    const fragment = ydoc.getXmlFragment('prosemirror');
    const paragraph = new Y.XmlElement('paragraph');
    fragment.insert(0, [paragraph]);
    return;
  }

  console.log('[HP] initializeDocumentContent content:', content);

  try {
    const json = generateJSON(content, tiptapExtensions);
    const parsed = TiptapTransformer.toYdoc(json as any, 'prosemirror', tiptapExtensions);
    const update = Y.encodeStateAsUpdate(parsed);
    Y.applyUpdate(ydoc, update);
  } catch (e) {
    // Fallback: insert plain text if parsing fails
    const stripTags = (html: string) => html.replace(/<|>/g, '').replace(/\s+/g, ' ').trim();
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



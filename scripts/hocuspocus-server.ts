import { Server } from '@hocuspocus/server';
import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';

// Minimal Hocuspocus server for local development
// Usage: ts-node scripts/hocuspocus-server.ts

const port = Number(process.env.HOCUSPOCUS_PORT || 1234);
const prisma = new PrismaClient();

// Parse document ID to get entity type and ID
function parseDocumentId(documentName: string): { type: string; id: string; field: string } | null {
  const match = documentName.match(/^(task|epic|story|milestone):([^:]+):(.+)$/);
  if (!match) return null;
  
  return {
    type: match[1],
    id: match[2],
    field: match[3]
  };
}

// Load document content from database
async function loadDocumentFromDatabase(documentName: string): Promise<string | null> {
  try {
    const parsed = parseDocumentId(documentName);
    if (!parsed) return null;
    
    const { type, id, field } = parsed;
    
    let content = '';
    
    switch (type) {
      case 'task':
        if (field === 'description') {
          const task = await prisma.task.findUnique({
            where: { id },
            select: { description: true }
          });
          content = task?.description || '';
        }
        break;
      case 'epic':
        if (field === 'description') {
          const epic = await prisma.epic.findUnique({
            where: { id },
            select: { description: true }
          });
          content = epic?.description || '';
        }
        break;
      case 'story':
        if (field === 'description') {
          const story = await prisma.story.findUnique({
            where: { id },
            select: { description: true }
          });
          content = story?.description || '';
        }
        break;
      case 'milestone':
        if (field === 'description') {
          const milestone = await prisma.milestone.findUnique({
            where: { id },
            select: { description: true }
          });
          content = milestone?.description || '';
        }
        break;
      default:
        return null;
    }
    
    console.log(`[Hocuspocus] Loaded ${type}:${id}:${field} from database:`, content.length, 'chars');
    return content;
    
  } catch (error) {
    console.error('[Hocuspocus] Error loading document from database:', error);
    return null;
  }
}

const server = Server.configure({
  port,
  
  // Load document from database when first accessed
  async onLoadDocument({ documentName, document }) {
    const content = await loadDocumentFromDatabase(documentName);
    console.log(`[Hocuspocus] Loading document ${documentName}, content length: ${content?.length || 0}`);
    
    const ydoc = document;
    const fragment = ydoc.getXmlFragment('prosemirror');
    
    console.log(`[Hocuspocus] Document ${documentName} fragment length: ${fragment.length}`);
    
    // Only load content from database if the collaborative document is empty
    // This ensures Hocuspocus becomes the single source of truth once initialized
    if (fragment.length === 0 && content && content.trim()) {
      ydoc.transact(() => {
        // For now, we'll store as plain text in a paragraph
        // In a real implementation, you'd parse HTML to ProseMirror nodes
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.insert(0, [new Y.XmlText(content)]);
        fragment.insert(0, [paragraph]);
      });
      
      console.log(`[Hocuspocus] Document ${documentName} initialized with database content`);
    } else if (fragment.length > 0) {
      console.log(`[Hocuspocus] Document ${documentName} already has collaborative content, skipping database load`);
    } else {
      console.log(`[Hocuspocus] Document ${documentName} has no database content to load`);
    }
  },
  
  async onConnect({ connection }) {
    const req = (connection as any)?.request;
    const url = req?.url || '';
    const ua = req?.headers?.['user-agent'] || '';
    console.log('[Hocuspocus] connect', { url, ua });
  },
  
  async onDisconnect() {
    console.log('[Hocuspocus] disconnect');
  },
  
  async onListen(data: { port: number }) {
    console.log(`Hocuspocus listening on ws://127.0.0.1:${data.port}`);
  },
});

server
  .listen()
  .catch((err: unknown) => {
    console.error('Failed to start Hocuspocus server', err);
    process.exit(1);
  });



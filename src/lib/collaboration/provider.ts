import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { CollaborationUser, HocuspocusConfig } from './types';
import { computeHocuspocusUrl } from './utils';

/**
 * HocuspocusManager handles collaborative editing with Hocuspocus/Yjs
 * 
 * Key Features:
 * - Creates Yjs document and Hocuspocus provider
 * - Provides collaborative extensions for TipTap editor
 * - All document manipulation happens through the editor itself
 * - No server-side document manipulation
 */
export class HocuspocusManager {
  private ydoc: Y.Doc | null = null;
  private provider: HocuspocusProvider | null = null;
  private config: HocuspocusConfig;
  private isInitializing: boolean = false;
  private isDestroyed: boolean = false;

  constructor(config: HocuspocusConfig) {
    this.config = config;
  }

  async initialize(): Promise<{ ydoc: Y.Doc; provider: HocuspocusProvider }> {
    this.isInitializing = true;
    
    if (!this.ydoc) {
      this.ydoc = new Y.Doc();
    }

    const url = computeHocuspocusUrl(process.env.NEXT_PUBLIC_HOCUSPOCUS_URL);
    this.provider = new HocuspocusProvider({
      url,
      name: this.config.documentId,
      document: this.ydoc,
    });

    this.setupProviderListeners();

    // Wait for initial sync
    await new Promise<void>((resolve) => {
      if ((this.provider as any).synced) {
        resolve();
      } else {
        const handleSync = () => {
          resolve();
        };
        
        (this.provider as any).on?.('synced', handleSync);
        
        // Timeout after 3 seconds
        setTimeout(() => {
          resolve();
        }, 3000);
      }
    });

    if (!this.ydoc || !this.provider) {
      throw new Error('Failed to initialize ydoc or provider');
    }

    this.isInitializing = false;
    return { ydoc: this.ydoc, provider: this.provider };
  }

  private setupProviderListeners(): void {
    // Provider listeners can be added here if needed for debugging
  }

  getCollaborationExtensions(user: CollaborationUser): any[] {
    if (!this.ydoc || !this.provider) {
      throw new Error('HocuspocusManager not initialized');
    }

    return [
      Collaboration.configure({ 
        document: this.ydoc,
        field: 'prosemirror',
      }),
      CollaborationCursor.configure({
        provider: this.provider,
        user,
        render: (user: any) => {
          const cursor = document.createElement('span');
          cursor.classList.add('collaboration-cursor__caret');
          cursor.style.borderColor = user.color;
          
          const label = document.createElement('div');
          label.classList.add('collaboration-cursor__label');
          label.style.backgroundColor = user.color;
          
          // Helper function to create initials fallback
          const createFallback = () => {
            const fallback = document.createElement('div');
            fallback.classList.add('collaboration-cursor__avatar-fallback');
            fallback.style.backgroundColor = user.color;
            fallback.textContent = user.initials || user.name?.slice(0, 2).toUpperCase() || 'U';
            return fallback;
          };
          
          // Create avatar element if user has an image
          if (user.avatar && user.avatar.trim() !== '') {
            const avatarWrapper = document.createElement('div');
            avatarWrapper.classList.add('collaboration-cursor__avatar-wrapper');
            avatarWrapper.style.border = `2px solid ${user.color}`;
            
            const avatar = document.createElement('img');
            avatar.src = user.avatar;
            avatar.classList.add('collaboration-cursor__avatar');
            avatar.crossOrigin = 'anonymous';
            
            // Handle avatar loading errors with fallback to initials
            avatar.onerror = () => {
              avatarWrapper.innerHTML = '';
              avatarWrapper.appendChild(createFallback());
            };
            
            avatarWrapper.appendChild(avatar);
            label.appendChild(avatarWrapper);
          } else {
            // Show initials in a circle if no avatar
            const fallbackWrapper = document.createElement('div');
            fallbackWrapper.classList.add('collaboration-cursor__avatar-wrapper');
            fallbackWrapper.style.border = `2px solid ${user.color}`;
            fallbackWrapper.appendChild(createFallback());
            label.appendChild(fallbackWrapper);
          }
          
          cursor.appendChild(label);
          return cursor;
        },
      })
    ];
  }

  destroy(): void {
    if (this.isInitializing) {
      return; // Don't destroy while initializing
    }
    
    this.isDestroyed = true;
    this.provider?.destroy();
    this.provider = null;
    this.ydoc?.destroy();
    this.ydoc = null;
  }

  getYDoc(): Y.Doc | null {
    return this.ydoc;
  }

  getProvider(): HocuspocusProvider | null {
    return this.provider;
  }
}
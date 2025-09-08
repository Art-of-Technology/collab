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
          // Build a Figma-like cursor with pointer and name label
          const getReadableTextColor = (bg: string): string => {
            try {
              let r = 0, g = 0, b = 0;
              if (bg.startsWith('#')) {
                const hex = bg.replace('#', '');
                const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
                r = parseInt(full.substring(0, 2), 16);
                g = parseInt(full.substring(2, 4), 16);
                b = parseInt(full.substring(4, 6), 16);
              } else if (bg.startsWith('rgb')) {
                const nums = bg.match(/\d+\.?\d*/g) || [];
                r = Number(nums[0] || 0);
                g = Number(nums[1] || 0);
                b = Number(nums[2] || 0);
              }
              const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
              return l > 0.6 ? '#000' : '#fff';
            } catch {
              return '#fff';
            }
          };

          const cursor = document.createElement('span');
          cursor.classList.add('collaboration-cursor__caret', 'collab-cursor');
          cursor.style.setProperty('--cursor-color', user.color);
          cursor.style.color = user.color;

          const pointer = document.createElement('div');
          pointer.classList.add('collab-cursor__pointer');
          pointer.innerHTML = `
            <svg class="collab-cursor__pointer-svg" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 2l7 18 2-7 7-2z" fill="currentColor"/>
            </svg>
          `;

          const label = document.createElement('div');
          label.classList.add('collab-cursor__label');
          label.textContent = user.name || user.initials || 'User';
          label.style.backgroundColor = user.color;
          label.style.color = getReadableTextColor(user.color);

          cursor.appendChild(pointer);
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

  /**
   * Check if there are other active collaborators on this document
   */
  hasActiveCollaborators(): boolean {
    if (!this.provider) return false;

    try {
      const awareness = (this.provider as any).awareness;
      if (!awareness) return false;

      const states = awareness.getStates();
      return states.size > 1; // More than just the current user
    } catch (error) {
      console.error('Error checking for active collaborators:', error);
      return false;
    }
  }

  /**
   * Get the current collaborative document content as HTML
   * This method should be called when you have access to the TipTap editor
   */
  getCollaborativeContent(editor?: any): string {
    if (!this.ydoc) return '';

    try {
      // If we have an editor instance, use it to get the current content
      // This ensures we get the content from the collaborative state
      if (editor && typeof editor.getHTML === 'function') {
        return editor.getHTML();
      }

      // Fallback: try to reconstruct content from Yjs document
      // This is more complex and may not work perfectly
      const prosemirrorType = this.ydoc.getXmlFragment('prosemirror');
      if (!prosemirrorType) return '';

      // For now, return empty and let the caller handle getting content from editor
      // A proper implementation would require deserializing the Yjs XML fragment
      return '';
    } catch (error) {
      console.error('Error getting collaborative content:', error);
      return '';
    }
  }
}
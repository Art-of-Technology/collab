// Collab App SDK - Client library for apps to communicate with the host
// This would be published as @collab/app-sdk

export type AppScope = 
  | 'workspace:read'
  | 'issues:read'
  | 'user:read'
  | 'issues:write'
  | 'comments:read'
  | 'comments:write';

export interface AppContext {
  app: {
    id: string;
    name: string;
    slug: string;
  };
  installation: {
    id: string;
    scopes: AppScope[];
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
  theme: 'light' | 'dark';
  locale: string;
  apiBase: string;
}

interface BridgeMessage {
  type: string;
  requestId?: string;
  payload?: any;
  timestamp: number;
}

class CollabAppSDK {
  private isInitialized = false;
  private context: AppContext | null = null;
  private pendingRequests = new Map<string, (response: any) => void>();
  private eventListeners = new Map<string, Set<(payload: any) => void>>();

  constructor() {
    this.setupMessageListener();
    this.sendReady();
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      // In a real implementation, you'd validate the origin
      const message: BridgeMessage = event.data;
      
      if (!message?.type) return;

      switch (message.type) {
        case 'host_ready':
          this.handleHostReady(message.payload?.context);
          break;
          
        case 'context_response':
          if (message.requestId === 'initial') {
            this.handleHostReady(message.payload);
          } else if (message.requestId) {
            this.resolveRequest(message.requestId, message.payload);
          }
          break;
          
        case 'response':
          if (message.requestId) {
            this.resolveRequest(message.requestId, message.payload);
          }
          break;
          
        default:
          // Handle other message types
          this.emitEvent(message.type, message.payload);
          break;
      }
    });
  }

  private handleHostReady(context: AppContext) {
    this.context = context;
    this.isInitialized = true;
    this.emitEvent('ready', context);
  }

  private sendReady() {
    this.sendMessage({
      type: 'app_ready',
      timestamp: Date.now()
    });
  }

  private sendMessage(message: BridgeMessage) {
    // Add timestamp for security validation
    message.timestamp = Date.now();
    
    // In production, we should validate the target origin
    const targetOrigin = process.env.NODE_ENV === 'development' ? '*' : window.location.ancestorOrigins?.[0] || '*';
    
    window.parent.postMessage(message, targetOrigin);
  }

  private generateRequestId(): string {
    return `sdk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private resolveRequest(requestId: string, response: any) {
    const resolver = this.pendingRequests.get(requestId);
    if (resolver) {
      resolver(response);
      this.pendingRequests.delete(requestId);
    }
  }

  private emitEvent(eventName: string, data?: any) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  // Public API

  /**
   * Get the current app context
   */
  async getContext(): Promise<AppContext> {
    if (this.context) {
      return this.context;
    }

    return new Promise((resolve) => {
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, resolve);
      
      this.sendMessage({
        type: 'get_context',
        requestId,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Show a toast notification
   */
  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.sendMessage({
      type: 'show_toast',
      payload: { message, type },
      timestamp: Date.now()
    });
  }

  /**
   * Open an issue (requires issues:read scope)
   */
  openIssue(issueId: string): void {
    this.sendMessage({
      type: 'open_issue',
      payload: { issueId },
      timestamp: Date.now()
    });
  }

  /**
   * Navigate to a path within the workspace
   */
  navigate(path: string): void {
    this.sendMessage({
      type: 'navigate',
      payload: { path },
      timestamp: Date.now()
    });
  }

  /**
   * Check if the app has a specific scope
   */
  hasScope(scope: AppScope): boolean {
    return this.context?.installation.scopes.includes(scope) || false;
  }

  /**
   * Listen for events from the host
   */
  on(eventName: string, listener: (payload: any) => void): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    
    this.eventListeners.get(eventName)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.eventListeners.get(eventName)?.delete(listener);
    };
  }

  /**
   * Remove event listener
   */
  off(eventName: string, listener: (payload: any) => void): void {
    this.eventListeners.get(eventName)?.delete(listener);
  }

  /**
   * Check if SDK is initialized
   */
  get ready(): boolean {
    return this.isInitialized;
  }
}

// Create and export singleton instance
export const collab = new CollabAppSDK();

// Export class for advanced usage
export { CollabAppSDK };

// Export types
export type { BridgeMessage };

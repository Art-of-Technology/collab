import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

export interface CollaborationUser {
  name: string;
  color: string;
  avatar?: string;
  initials: string;
  id?: string;
}

export interface HocuspocusConfig {
  documentId: string;
}

export interface CollaborationState {
  ydoc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  isReady: boolean;
  user: CollaborationUser;
}
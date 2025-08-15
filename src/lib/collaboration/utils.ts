import { CollaborationUser } from './types';

// Generate a consistent color based on user ID
export function getUserColor(userId: string): string {
  const colors = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#14b8a6', // teal
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#f43f5e', // rose
    '#06b6d4', // cyan
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

// Create collaboration user from session data
export function createCollaborationUser(session: any, currentUser?: any): CollaborationUser {
  if (!session?.user) {
    return {
      name: 'Anonymous',
      color: '#94a3b8',
      avatar: undefined,
      initials: 'AN',
    };
  }
  
  // Generate initials from name
  const name = session.user.name || 'User';
  const initials = name
    .split(' ')
    .map(word => word[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || 'U';
  
  // Ensure avatar URL is absolute
  let avatarUrl = currentUser?.image || undefined;
  if (avatarUrl && !avatarUrl.startsWith('http')) {
    // If it's a relative URL, make it absolute
    avatarUrl = `${window.location.origin}${avatarUrl}`;
  }
  
  return {
    name,
    color: getUserColor(session.user.id || 'default'),
    avatar: avatarUrl,
    initials,
    id: session.user.id,
  };
}

// Compute Hocuspocus WebSocket URL
export function computeHocuspocusUrl(overriddenUrl?: string): string {
  if (overriddenUrl && overriddenUrl.trim().length > 0) return overriddenUrl;
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_HOCUSPOCUS_URL || 'ws://127.0.0.1:3042';

  const envUrl = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl;

  const isSecure = window.location.protocol === 'https:';
  const scheme = isSecure ? 'wss' : 'ws';
  const host = window.location.hostname || '127.0.0.1';
  const port = process.env.NEXT_PUBLIC_HOCUSPOCUS_PORT || '5020';
  const url = `${scheme}://${host}:${port}`;
  return url;
}


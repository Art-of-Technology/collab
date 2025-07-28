export async function getWorkspaceSlug(idOrSlug: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/resolve-slug?value=${encodeURIComponent(idOrSlug)}&type=workspace-slug`);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Failed to get workspace slug:', error);
    return null;
  }
}

export async function getBoardSlug(boardIdOrSlug: string, workspaceSlugOrId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/resolve-slug?value=${encodeURIComponent(boardIdOrSlug)}&type=board-slug&workspaceSlugOrId=${encodeURIComponent(workspaceSlugOrId)}`);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Failed to get board slug:', error);
    return null;
  }
} 
import { authorizationServerMetadata, discovery } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';

export const GET = async () => discovery(authorizationServerMetadata);

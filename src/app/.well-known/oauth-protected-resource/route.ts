import { discovery, protectedResourceMetadata } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';

export const GET = async () => discovery(protectedResourceMetadata);

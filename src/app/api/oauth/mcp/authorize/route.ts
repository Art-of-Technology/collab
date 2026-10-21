import { NextRequest } from 'next/server';
import { authorize } from '@/lib/oauth-authorization';

export async function GET(request: NextRequest) { return authorize(request, true); }
export async function POST(request: NextRequest) { return authorize(request, true); }

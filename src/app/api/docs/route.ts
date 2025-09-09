// app/api/docs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ApiScanner } from 'api-scanner';
import * as fs from 'fs-extra';
import * as path from 'path';

// Cache configuration
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour
const CACHE_FILE = path.join(process.cwd(), '.next/cache/api-docs.json');

interface CachedDocs {
    data: any;
    timestamp: number;
}

async function generateDocumentation() {
    const scanner = new ApiScanner({
        path: 'src/app/api', // Adjust path to match your API structure
        format: 'json',
        verbose: false,
        ignore: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.next/**',
            '**/docs/**' // Ignore the docs route itself to avoid circular dependency
        ]
    });

    return await scanner.scan();
}

async function getCachedDocumentation(): Promise<any | null> {
    try {
        if (await fs.pathExists(CACHE_FILE)) {
            const cached: CachedDocs = await fs.readJson(CACHE_FILE);
            const isExpired = Date.now() - cached.timestamp > CACHE_DURATION;

            if (!isExpired) {
                return cached.data;
            }
        }
    } catch (error) {
        console.warn('Failed to read cached documentation:', error);
    }

    return null;
}

async function setCachedDocumentation(data: any): Promise<void> {
    try {
        await fs.ensureDir(path.dirname(CACHE_FILE));
        const cached: CachedDocs = {
            data,
            timestamp: Date.now()
        };
        await fs.writeJson(CACHE_FILE, cached);
    } catch (error) {
        console.warn('Failed to cache documentation:', error);
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get('refresh') === 'true';

        let documentation;

        // Try to use cached version first (unless force refresh)
        if (!forceRefresh) {
            documentation = await getCachedDocumentation();
        }

        // Generate fresh documentation if no cache or force refresh
        if (!documentation) {
            console.log('Generating fresh API documentation...');
            documentation = await generateDocumentation();
            await setCachedDocumentation(documentation);
        }

        return NextResponse.json(documentation, {
            headers: {
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        console.error('Failed to generate API documentation:', error);

        return NextResponse.json(
            {
                error: 'Failed to generate API documentation',
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

// Optional: Handle POST for manual refresh
export async function POST(request: NextRequest) {
    try {
        console.log('Manual refresh of API documentation requested');
        const documentation = await generateDocumentation();
        await setCachedDocumentation(documentation);

        return NextResponse.json({
            success: true,
            message: 'Documentation refreshed successfully',
            timestamp: new Date().toISOString(),
            totalEndpoints: documentation.totalEndpoints
        });
    } catch (error) {
        console.error('Failed to refresh API documentation:', error);

        return NextResponse.json(
            {
                error: 'Failed to refresh API documentation',
                message: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
  handler?: (req: NextRequest) => NextResponse; // Custom response handler
  message?: string; // Custom error message
  cacheMaxSize?: number; // Maximum cache size
  enableCleanup?: boolean; // Enable periodic cleanup
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

interface CacheStore {
  cache: LRUCache<string, RateLimitInfo>;
  lastCleanup: number;
  cleanupInterval: number;
}

// Create a more memory-efficient cache with cleanup
function createRateLimitCache(maxSize: number = 5000): CacheStore {
  return {
    cache: new LRUCache<string, RateLimitInfo>({
      max: maxSize,
      ttl: 1000 * 60 * 15, // 15 minutes TTL
      updateAgeOnGet: false, // Don't update age on get to allow natural expiration
      allowStale: false, // Don't return stale values
    }),
    lastCleanup: Date.now(),
    cleanupInterval: 1000 * 60 * 5, // Cleanup every 5 minutes
  };
}

// Shared cache instance with cleanup capability
let globalCacheStore: CacheStore | null = null;

function getCacheStore(maxSize?: number): CacheStore {
  if (!globalCacheStore) {
    globalCacheStore = createRateLimitCache(maxSize);
  }
  return globalCacheStore;
}

// Cleanup expired entries and manage memory
function performCacheCleanup(store: CacheStore): void {
  const now = Date.now();
  
  // Only cleanup if enough time has passed
  if (now - store.lastCleanup < store.cleanupInterval) {
    return;
  }

  // Force garbage collection of expired items
  store.cache.purgeStale();
  
  // If cache is still too large, clear oldest 25% of entries
  const currentSize = store.cache.size;
  const maxSize = store.cache.max;
  
  if (currentSize > maxSize * 0.8) {
    const keysToDelete = Math.floor(currentSize * 0.25);
    const keys = Array.from(store.cache.keys());
    
    for (let i = 0; i < keysToDelete && i < keys.length; i++) {
      store.cache.delete(keys[i]);
    }
  }
  
  store.lastCleanup = now;
}

/**
 * Default key generator - uses IP address and pathname
 */
const defaultKeyGenerator = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'anonymous';
  const pathname = new URL(req.url).pathname;
  return `${ip}:${pathname}`;
};

/**
 * Creates a rate limiting middleware
 * @param options - Rate limiting options
 * @returns Middleware function
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    maxRequests = 10, // 10 requests per minute default
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = defaultKeyGenerator,
    handler,
    message = 'Too many requests, please try again later.',
    cacheMaxSize = 5000, // Default cache size
    enableCleanup = true, // Enable cleanup by default
  } = options;

  // Get or create cache store
  const cacheStore = getCacheStore(cacheMaxSize);

  return async function rateLimit(
    req: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const key = keyGenerator(req);
    const now = Date.now();

    // Perform cleanup if enabled
    if (enableCleanup) {
      performCacheCleanup(cacheStore);
    }

    // Get current rate limit info
    let info = cacheStore.cache.get(key);

    // Initialize or reset if window expired
    if (!info || now > info.resetTime) {
      info = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    // Check if limit exceeded
    if (info.count >= maxRequests) {
      const retryAfter = Math.ceil((info.resetTime - now) / 1000);
      
      if (handler) {
        return handler(req);
      }

      return NextResponse.json(
        {
          error: message,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(info.resetTime).toISOString(),
          },
        }
      );
    }

    // Increment counter
    info.count++;
    cacheStore.cache.set(key, info);

    // Execute the actual handler
    const response = await next();

    // Optionally skip counting based on response
    if (
      (skipSuccessfulRequests && response.status < 400) ||
      (skipFailedRequests && response.status >= 400)
    ) {
      info.count--;
      cacheStore.cache.set(key, info);
    }

    // Add rate limit headers to response
    const headers = new Headers(response.headers);
    headers.set('X-RateLimit-Limit', maxRequests.toString());
    headers.set('X-RateLimit-Remaining', Math.max(0, maxRequests - info.count).toString());
    headers.set('X-RateLimit-Reset', new Date(info.resetTime).toISOString());

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/**
 * Rate limiter for notification endpoints
 */
export const notificationRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute
  message: 'Too many notification requests, please try again later.',
});

/**
 * Rate limiter for follow/unfollow actions
 */
export const followActionRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 follow/unfollow actions per minute
  message: 'Too many follow/unfollow requests, please try again later.',
});

/**
 * Rate limiter for push subscription endpoints
 */
export const pushSubscriptionRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // 10 subscription changes per hour
  message: 'Too many subscription changes, please try again later.',
});

/**
 * Stricter rate limiter for sensitive operations
 */
export const strictRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 requests per 15 minutes
  message: 'Rate limit exceeded for this operation.',
});

/**
 * Cache management utilities for serverless environments
 */
export const cacheUtils = {
  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hitRatio?: number } | null {
    if (!globalCacheStore) return null;
    
    const cache = globalCacheStore.cache;
    return {
      size: cache.size,
      maxSize: cache.max,
      // LRU cache doesn't track hit ratio by default
    };
  },

  /**
   * Force cleanup of expired entries
   */
  forceCleanup(): void {
    if (globalCacheStore) {
      performCacheCleanup(globalCacheStore);
    }
  },

  /**
   * Clear all cache entries (use with caution)
   */
  clearAll(): void {
    if (globalCacheStore) {
      globalCacheStore.cache.clear();
    }
  },

  /**
   * Reset cache instance (useful for testing)
   */
  reset(): void {
    globalCacheStore = null;
  },
};

/**
 * Distributed cache interface for external cache systems
 */
export interface DistributedCache {
  get(key: string): Promise<RateLimitInfo | null>;
  set(key: string, value: RateLimitInfo, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Create rate limiter with optional distributed cache backend
 */
export function createDistributedRateLimiter(
  options: RateLimitOptions & { 
    distributedCache?: DistributedCache;
    fallbackToMemory?: boolean;
  } = {}
) {
  const {
    distributedCache,
    fallbackToMemory = true,
    ...rateLimitOptions
  } = options;

  if (!distributedCache) {
    return createRateLimiter(rateLimitOptions);
  }

  const {
    windowMs = 60 * 1000,
    maxRequests = 10,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = defaultKeyGenerator,
    handler,
    message = 'Too many requests, please try again later.',
  } = rateLimitOptions;

  // Fallback rate limiter for when distributed cache fails
  const fallbackLimiter = fallbackToMemory ? createRateLimiter(rateLimitOptions) : null;

  return async function distributedRateLimit(
    req: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const key = keyGenerator(req);
    const now = Date.now();

    try {
      // Try distributed cache first
      let info = await distributedCache.get(key);

      // Initialize or reset if window expired
      if (!info || now > info.resetTime) {
        info = {
          count: 0,
          resetTime: now + windowMs,
        };
      }

      // Check if limit exceeded
      if (info.count >= maxRequests) {
        const retryAfter = Math.ceil((info.resetTime - now) / 1000);
        
        if (handler) {
          return handler(req);
        }

        return NextResponse.json(
          {
            error: message,
            retryAfter,
          },
          {
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(info.resetTime).toISOString(),
            },
          }
        );
      }

      // Increment counter
      info.count++;
      await distributedCache.set(key, info, windowMs);

      // Execute the actual handler
      const response = await next();

      // Optionally skip counting based on response
      if (
        (skipSuccessfulRequests && response.status < 400) ||
        (skipFailedRequests && response.status >= 400)
      ) {
        info.count--;
        await distributedCache.set(key, info, windowMs);
      }

      // Add rate limit headers to response
      const headers = new Headers(response.headers);
      headers.set('X-RateLimit-Limit', maxRequests.toString());
      headers.set('X-RateLimit-Remaining', Math.max(0, maxRequests - info.count).toString());
      headers.set('X-RateLimit-Reset', new Date(info.resetTime).toISOString());

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

    } catch (error) {
      // If distributed cache fails, fallback to memory cache or allow request
      console.warn('Distributed cache error, falling back:', error);
      
      if (fallbackLimiter) {
        return fallbackLimiter(req, next);
      }
      
      // If no fallback, allow the request but log the error
      return next();
    }
  };
}

/**
 * Helper to wrap API route handlers with rate limiting
 */
export function withRateLimit(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  rateLimiter = notificationRateLimit
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    return rateLimiter(req, () => handler(req, context));
  };
}
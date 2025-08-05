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
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

// Create a shared cache for rate limiting
const rateLimitCache = new LRUCache<string, RateLimitInfo>({
  max: 10000, // Maximum number of items in cache
  ttl: 1000 * 60 * 15, // 15 minutes TTL
});

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
  } = options;

  return async function rateLimit(
    req: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const key = keyGenerator(req);
    const now = Date.now();

    // Get current rate limit info
    let info = rateLimitCache.get(key);

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
    rateLimitCache.set(key, info);

    // Execute the actual handler
    const response = await next();

    // Optionally skip counting based on response
    if (
      (skipSuccessfulRequests && response.status < 400) ||
      (skipFailedRequests && response.status >= 400)
    ) {
      info.count--;
      rateLimitCache.set(key, info);
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
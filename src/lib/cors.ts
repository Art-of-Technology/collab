import { NextRequest, NextResponse } from 'next/server';

export interface CorsOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const defaultOptions: CorsOptions = {
  origin: true, // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * CORS middleware for API routes
 * @param options - CORS configuration options
 * @returns CORS middleware function
 */
export function withCors(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  options: CorsOptions = {}
) {
  const corsOptions = { ...defaultOptions, ...options };

  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const origin = req.headers.get('origin');
    const requestMethod = req.method;

    // Handle preflight requests
    if (requestMethod === 'OPTIONS') {
      return handlePreflight(req, corsOptions);
    }

    // Execute the actual handler
    const response = await handler(req, context);

    // Add CORS headers to the response
    return addCorsHeaders(response, req, corsOptions);
  };
}

/**
 * Handle preflight OPTIONS requests
 */
function handlePreflight(req: NextRequest, options: CorsOptions): NextResponse {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response, req, options);
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(
  response: NextResponse,
  req: NextRequest,
  options: CorsOptions
): NextResponse {
  const origin = req.headers.get('origin');
  const requestMethod = req.method;
  const requestHeaders = req.headers.get('access-control-request-headers');

  // Set Access-Control-Allow-Origin
  if (options.origin === true) {
    response.headers.set('Access-Control-Allow-Origin', origin || '*');
  } else if (typeof options.origin === 'string') {
    response.headers.set('Access-Control-Allow-Origin', options.origin);
  } else if (Array.isArray(options.origin)) {
    if (origin && options.origin.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
  } else if (options.origin === false) {
    // Don't set the header
  }

  // Set other CORS headers
  if (options.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  if (options.methods && options.methods.length > 0) {
    response.headers.set('Access-Control-Allow-Methods', options.methods.join(', '));
  }

  if (options.allowedHeaders && options.allowedHeaders.length > 0) {
    response.headers.set('Access-Control-Allow-Headers', options.allowedHeaders.join(', '));
  }

  if (options.maxAge) {
    response.headers.set('Access-Control-Max-Age', options.maxAge.toString());
  }

  // Handle preflight request headers
  if (requestMethod === 'OPTIONS' && requestHeaders) {
    response.headers.set('Access-Control-Allow-Headers', requestHeaders);
  }

  return response;
}

/**
 * Get CORS configuration based on environment
 */
export function getCorsConfig(): CorsOptions {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

  if (isDevelopment) {
    return {
      origin: true, // Allow all origins in development
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
      ],
      credentials: true,
    };
  }

  return {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    credentials: true,
  };
}

/**
 * CORS configuration for push notification endpoints
 */
export const pushNotificationCors = withCors(
  async (req: NextRequest, context?: any) => {
    // This is a placeholder - the actual handler will be provided
    return new NextResponse();
  },
  {
    origin: getCorsConfig().origin,
    methods: ['POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    credentials: true,
  }
);

/**
 * CORS configuration for follow/unfollow endpoints
 */
export const followActionCors = withCors(
  async (req: NextRequest, context?: any) => {
    return new NextResponse();
  },
  {
    origin: getCorsConfig().origin,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    credentials: true,
  }
);
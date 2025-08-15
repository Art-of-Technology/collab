import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Zod schemas for API validation
 */

// Push subscription schema
export const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url('Invalid endpoint URL'),
    keys: z.object({
      p256dh: z.string().min(1, 'p256dh key is required'),
      auth: z.string().min(1, 'auth key is required'),
    }),
    expirationTime: z.number().nullable().optional(),
  }),
});

// Follow/unfollow action schema
export const followActionSchema = z.object({
  followerId: z.string().optional(),
  reason: z.string().optional(),
});

// Notification preferences schema
export const notificationPreferencesSchema = z.object({
  taskCreated: z.boolean().optional(),
  taskStatusChanged: z.boolean().optional(),
  taskAssigned: z.boolean().optional(),
  taskCommentAdded: z.boolean().optional(),
  taskPriorityChanged: z.boolean().optional(),
  taskDueDateChanged: z.boolean().optional(),
  taskColumnMoved: z.boolean().optional(),
  taskUpdated: z.boolean().optional(),
  taskDeleted: z.boolean().optional(),
  taskMentioned: z.boolean().optional(),
  boardTaskCreated: z.boolean().optional(),
  boardTaskStatusChanged: z.boolean().optional(),
  boardTaskAssigned: z.boolean().optional(),
  boardTaskCompleted: z.boolean().optional(),
  boardTaskDeleted: z.boolean().optional(),
  postCommentAdded: z.boolean().optional(),
  postBlockerCreated: z.boolean().optional(),
  postResolved: z.boolean().optional(),
  emailNotificationsEnabled: z.boolean().optional(),
  pushNotificationsEnabled: z.boolean().optional(),
});

// Push notification test schema
export const pushNotificationTestSchema = z.object({
  message: z.string().optional().default('Test notification from Collab'),
  title: z.string().optional().default('Test Notification'),
});

// Common ID validation
export const idSchema = z.string().min(1, 'ID is required');

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/**
 * Middleware to validate request body with Zod schema
 * @param schema - Zod schema to validate against
 * @returns Validation middleware function
 */
export function validateRequestBody<T>(schema: z.ZodSchema<T>) {
  return async (req: NextRequest, body?: any): Promise<{ data: T } | { error: NextResponse }> => {
    try {
      const requestBody = body || await req.json();
      const validatedData = schema.parse(requestBody);
      return { data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          error: NextResponse.json(
            {
              error: 'Validation failed',
              details: error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
              })),
            },
            { status: 400 }
          ),
        };
      }
      return {
        error: NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        ),
      };
    }
  };
}

/**
 * Middleware to validate query parameters with Zod schema
 * @param schema - Zod schema to validate against
 * @returns Validation middleware function
 */
export function validateQueryParams<T>(schema: z.ZodSchema<T>) {
  return (req: NextRequest): { data: T } | { error: NextResponse } => {
    try {
      const url = new URL(req.url);
      const params = Object.fromEntries(url.searchParams.entries());
      const validatedData = schema.parse(params);
      return { data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          error: NextResponse.json(
            {
              error: 'Invalid query parameters',
              details: error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
              })),
            },
            { status: 400 }
          ),
        };
      }
      return {
        error: NextResponse.json(
          { error: 'Invalid query parameters' },
          { status: 400 }
        ),
      };
    }
  };
}

/**
 * Middleware to validate URL parameters
 * @param schema - Zod schema to validate against
 * @returns Validation function
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (params: any): { data: T } | { error: NextResponse } => {
    try {
      const validatedData = schema.parse(params);
      return { data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          error: NextResponse.json(
            {
              error: 'Invalid URL parameters',
              details: error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
              })),
            },
            { status: 400 }
          ),
        };
      }
      return {
        error: NextResponse.json(
          { error: 'Invalid URL parameters' },
          { status: 400 }
        ),
      };
    }
  };
}

/**
 * Helper to combine multiple validation results
 * @param validations - Array of validation results
 * @returns Combined validation result
 */
export function combineValidations(...validations: Array<{ data?: any; error?: NextResponse }>) {
  const errors = validations.filter(v => v.error);
  if (errors.length > 0) {
    return { error: errors[0].error };
  }
  
  const data = validations.reduce((acc, v) => ({ ...acc, ...v.data }), {});
  return { data };
}

/**
 * Type-safe wrapper for API route handlers with validation
 * @param handler - The API route handler
 * @param validations - Object containing validation schemas
 * @returns Wrapped handler with validation
 */
export function withValidation<TBody = any, TQuery = any, TParams = any>(
  handler: (req: NextRequest, context: { 
    body?: TBody; 
    query?: TQuery; 
    params?: TParams;
    [key: string]: any; 
  }) => Promise<NextResponse>,
  validations: {
    body?: z.ZodSchema<TBody>;
    query?: z.ZodSchema<TQuery>;
    params?: z.ZodSchema<TParams>;
  } = {}
) {
  return async (req: NextRequest, context: any = {}): Promise<NextResponse> => {
    const validationResults: any = {};

    // Validate body if schema provided
    if (validations.body) {
      const bodyValidation = await validateRequestBody(validations.body)(req);
      if (bodyValidation.error) return bodyValidation.error;
      validationResults.body = bodyValidation.data;
    }

    // Validate query if schema provided
    if (validations.query) {
      const queryValidation = validateQueryParams(validations.query)(req);
      if (queryValidation.error) return queryValidation.error;
      validationResults.query = queryValidation.data;
    }

    // Validate params if schema provided and context has params
    if (validations.params && context.params) {
      const resolvedParams = (typeof context.params.then === 'function')
        ? await context.params
        : context.params;
      const paramsValidation = validateParams(validations.params)(resolvedParams);
      if (paramsValidation.error) return paramsValidation.error;
      validationResults.params = paramsValidation.data;
    }

    // Call the handler with validated data
    return handler(req, { ...context, ...validationResults });
  };
}
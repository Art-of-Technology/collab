/**
 * Simple logger utility for structured logging
 * In production, this should be replaced with a proper logging library like winston or pino
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  correlationId?: string;
  userId?: string;
  [key: string]: any;
}

class Logger {
  private context: LogContext = {};

  setContext(context: LogContext) {
    this.context = { ...this.context, ...context };
  }

  private log(level: LogLevel, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...this.context,
      ...(data && { data }),
    };

    // In development, use console methods
    if (process.env.NODE_ENV === 'development') {
      switch (level) {
        case 'debug':
          console.debug(`[${timestamp}] ${message}`, data || '');
          break;
        case 'info':
          console.info(`[${timestamp}] ${message}`, data || '');
          break;
        case 'warn':
          console.warn(`[${timestamp}] ${message}`, data || '');
          break;
        case 'error':
          console.error(`[${timestamp}] ${message}`, data || '');
          break;
      }
    } else {
      // In production, send to logging service
      // This is where you'd integrate with services like Datadog, LogRocket, etc.
      console.log(JSON.stringify(logEntry));
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | any, additionalData?: any) {
    const errorData = {
      ...(error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error),
      ...additionalData,
    };
    this.log('error', message, errorData);
  }

  // Create a child logger with additional context
  child(context: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }
}

// Export a singleton instance
export const logger = new Logger();

// Helper to generate correlation IDs
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
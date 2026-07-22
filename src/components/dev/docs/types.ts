export interface ApiDocumentation {
  info: {
    title: string;
    version: string;
    description: string;
    baseUrl: string;
    authentication: {
      type: string;
      required: boolean;
      endpoint: string;
      headerName: string;
      description: string;
    };
  };
  endpoints: Endpoint[];
}

export interface Endpoint {
  method: string;
  url: string;
  file: string;
  title: string;
  description: string;
  parameters?: any[];
  requestBody?: {
    type?: string;
    schema?: any;
    description?: string;
    example?: any;
    required?: string[];
  };
  responses?: Record<string, any>;
  requestHeaders?: Array<{
    name: string;
    required: boolean;
    description: string;
  }>;
  tags?: string[];
  summary?: string;
  authentication?: any;
  requiresAuth?: boolean;
  codeExamples?: {
    language: string;
    example: string;
  };
  errorHandling?: {
    commonErrors?: Array<{
      statusCode: string;
      description: string;
      handling: string;
    }>;
  };
  rateLimiting?: {
    enabled: boolean;
    limits: {
      requests: number;
      window: string;
      burst: number;
    };
  };
  pagination?: {
    supported: boolean;
    parameters?: any;
  };
}


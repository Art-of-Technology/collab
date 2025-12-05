import { Endpoint } from './types';

export function buildUrl(
  endpointUrl: string,
  baseUrl: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>
): string {
  let url = endpointUrl;
  
  // Replace path parameters
  Object.entries(pathParams).forEach(([key, value]) => {
    url = url.replace(`{${key}}`, value);
  });

  // Add query parameters
  const queryString = Object.entries(queryParams)
    .filter(([_, value]) => value.trim() !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return `${baseUrl}${url}${queryString ? `?${queryString}` : ''}`;
}

export function generateCurlCommand(
  endpoint: Endpoint,
  baseUrl: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
  requestBody: string,
  authHeader: string,
  bodyMode: 'form' | 'json'
): string {
  const url = buildUrl(endpoint.url, baseUrl, pathParams, queryParams);
  const headers: Record<string, string> = {};
  
  if (authHeader && authHeader.trim() !== '') {
    headers['Authorization'] = authHeader;
  }
  
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && requestBody && requestBody.trim() !== '') {
    headers['Content-Type'] = 'application/json';
  }

  let curl = `curl -X '${endpoint.method}' \\\n  '${url}'`;
  
  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    curl += ` \\\n  -H '${key}: ${value}'`;
  });

  // Add body
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && requestBody && requestBody.trim() !== '') {
    try {
      let body;
      if (bodyMode === 'json') {
        body = JSON.parse(requestBody);
      } else {
        // Form mode: build JSON from form fields
        const formJson: Record<string, any> = {};
        getFormFields(endpoint).forEach(field => {
          const input = document.getElementById(`body-${field.key}`) as HTMLInputElement;
          if (input && input.value) {
            formJson[field.key] = field.type === 'number' ? Number(input.value) : input.value;
          }
        });
        body = formJson;
      }
      curl += ` \\\n  -d '${JSON.stringify(body)}'`;
    } catch (e) {
      curl += ` \\\n  -d '${requestBody}'`;
    }
  }

  return curl;
}

export function getFormFields(endpoint: Endpoint) {
  const reqBody = (endpoint as any).requestBody;
  if (!reqBody?.schema) return [];
  
  const schema = reqBody.schema;
  if (schema.type === 'object' && schema.properties) {
    return Object.entries(schema.properties).map(([key, value]: [string, any]) => ({
      key,
      type: value.type || 'string',
      description: value.description || '',
      required: reqBody?.required?.includes(key) || false,
    }));
  }
  return [];
}

export function getParameterHelp(paramName: string, paramType: 'path' | 'query' | 'body') {
  const lowerName = paramName.toLowerCase();
  
  // Path parameters
  if (paramType === 'path') {
    if (lowerName.includes('workspace')) {
      return {
        title: 'How to get workspace ID:',
        items: [
          `Call GET /api/workspaces to list your workspaces`,
          `The workspace ID is returned in the response`
        ]
      };
    }
    if (lowerName.includes('user') || lowerName.includes('userId')) {
      return {
        title: 'How to get user ID:',
        items: [
          `Call GET /api/users/me to get your user ID`,
          `Or use the user ID from your profile`
        ]
      };
    }
    if (lowerName.includes('task') || lowerName.includes('issue')) {
      return {
        title: `How to get ${paramName}:`,
        items: [
          `Call the list endpoint to get available ${paramName}s`,
          `The ID is returned in the response`
        ]
      };
    }
    return {
      title: `How to get ${paramName}:`,
      items: [
        `Check the related list endpoint to get available ${paramName}s`,
        `The ID is returned in the response`
      ]
    };
  }
  
  // Query parameters - description is usually sufficient
  if (paramType === 'query') {
    return null;
  }
  
  return null;
}


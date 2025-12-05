'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Info } from 'lucide-react';
import { Endpoint } from './types';
import { getParameterHelp, getFormFields } from './tryItUtils';

interface TryItFormFieldsProps {
  endpoint: Endpoint;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  requestBody: string;
  bodyMode: 'form' | 'json';
  authHeader: string;
  onPathParamChange: (key: string, value: string) => void;
  onQueryParamChange: (key: string, value: string) => void;
  onRequestBodyChange: (value: string) => void;
  onBodyModeChange: (mode: 'form' | 'json') => void;
  onAuthHeaderChange: (value: string) => void;
  onFormFieldChange: (key: string, value: any) => void;
}

export function TryItFormFields({
  endpoint,
  pathParams,
  queryParams,
  requestBody,
  bodyMode,
  authHeader,
  onPathParamChange,
  onQueryParamChange,
  onRequestBodyChange,
  onBodyModeChange,
  onAuthHeaderChange,
  onFormFieldChange,
}: TryItFormFieldsProps) {
  const pathParamsList = Object.entries(pathParams);
  const queryParamsList = endpoint.parameters?.filter((p) => {
    const paramLocation = p.in || p.location;
    return paramLocation === 'query';
  }) || [];
  const formFields = getFormFields(endpoint);

  return (
    <div className="space-y-6">
      {/* Path Parameters */}
      {pathParamsList.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3">Path Parameters</h4>
          <div className="space-y-3">
            {pathParamsList.map(([key, value]) => {
              const param = endpoint.parameters?.find((p) => {
                const paramLocation = p.in || p.location;
                return p.name === key && (paramLocation === 'path' || paramLocation === undefined);
              });
              const helpInfo = getParameterHelp(key, 'path');
              
              return (
                <div key={key}>
                  <Label htmlFor={`path-${key}`} className="text-xs">
                    {key}
                    {param?.required && <span className="text-red-400 ml-1">*</span>}
                  </Label>
                  <Input
                    id={`path-${key}`}
                    value={value}
                    onChange={(e) => onPathParamChange(key, e.target.value)}
                    placeholder={param?.description || `Enter ${key}`}
                    className="mt-1 bg-[#090909] border-[#1f1f1f] text-sm"
                  />
                  {helpInfo && (
                    <div className="mt-1.5 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs">
                      <div className="flex items-start gap-1.5">
                        <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-blue-300/80">
                          <p className="font-medium mb-0.5">{helpInfo.title}</p>
                          <ul className="list-disc list-inside space-y-0.5 text-blue-300/70">
                            {helpInfo.items.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Query Parameters */}
      {queryParamsList.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3">Query Parameters</h4>
          <div className="space-y-4">
            {/* Required Parameters */}
            {queryParamsList.filter((p) => p.required).length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-foreground mb-2">Required</h5>
                <div className="space-y-3">
                  {queryParamsList.filter((p) => p.required).map((param) => {
                    const defaultValue = param.default !== undefined ? String(param.default) : '';
                    const currentValue = queryParams[param.name] || defaultValue;
                    return (
                      <div key={param.name}>
                        <Label htmlFor={`query-${param.name}`} className="text-xs">
                          {param.name}
                          <span className="text-red-400 ml-1">*</span>
                        </Label>
                        <Input
                          id={`query-${param.name}`}
                          value={currentValue}
                          onChange={(e) => onQueryParamChange(param.name, e.target.value)}
                          placeholder={param.description || `Enter ${param.name}`}
                          className="mt-1 bg-[#090909] border-[#1f1f1f] text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Optional Parameters */}
            {queryParamsList.filter((p) => !p.required).length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-foreground mb-2">Optional</h5>
                <div className="space-y-3">
                  {queryParamsList.filter((p) => !p.required).map((param) => {
                    const defaultValue = param.default !== undefined ? String(param.default) : '';
                    const currentValue = queryParams[param.name] || defaultValue;
                    return (
                      <div key={param.name}>
                        <Label htmlFor={`query-${param.name}`} className="text-xs">
                          {param.name}
                        </Label>
                        <Input
                          id={`query-${param.name}`}
                          value={currentValue}
                          onChange={(e) => onQueryParamChange(param.name, e.target.value)}
                          placeholder={param.description || `Enter ${param.name}`}
                          className="mt-1 bg-[#090909] border-[#1f1f1f] text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Request Body */}
      {(endpoint as any).requestBody && (
        <div>
          <h4 className="text-sm font-semibold mb-3">Request Body</h4>
          <Tabs value={bodyMode} onValueChange={(v) => onBodyModeChange(v as 'form' | 'json')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="mt-3">
              <div className="space-y-4">
                {/* Required Fields */}
                {formFields.filter((f) => f.required).length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-foreground mb-2">Required</h5>
                    <div className="space-y-3">
                      {formFields.filter((f) => f.required).map((field) => (
                        <div key={field.key}>
                          <Label htmlFor={`body-${field.key}`} className="text-xs">
                            {field.key}
                            <span className="text-red-400 ml-1">*</span>
                          </Label>
                          <Input
                            id={`body-${field.key}`}
                            type={field.type === 'number' ? 'number' : 'text'}
                            onChange={(e) => {
                              const value = field.type === 'number' ? Number(e.target.value) : e.target.value;
                              onFormFieldChange(field.key, value);
                            }}
                            placeholder={field.description || `Enter ${field.key}`}
                            className="mt-1 bg-[#090909] border-[#1f1f1f] text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Optional Fields */}
                {formFields.filter((f) => !f.required).length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-foreground mb-2">Optional</h5>
                    <div className="space-y-3">
                      {formFields.filter((f) => !f.required).map((field) => (
                        <div key={field.key}>
                          <Label htmlFor={`body-${field.key}`} className="text-xs">
                            {field.key}
                          </Label>
                          <Input
                            id={`body-${field.key}`}
                            type={field.type === 'number' ? 'number' : 'text'}
                            onChange={(e) => {
                              const value = field.type === 'number' ? Number(e.target.value) : e.target.value;
                              onFormFieldChange(field.key, value);
                            }}
                            placeholder={field.description || `Enter ${field.key}`}
                            className="mt-1 bg-[#090909] border-[#1f1f1f] text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="json" className="mt-3">
              <Textarea
                value={requestBody}
                onChange={(e) => onRequestBodyChange(e.target.value)}
                className="min-h-[200px] sm:min-h-[250px] bg-[#090909] border-[#1f1f1f] font-mono text-xs"
                placeholder="Enter JSON body..."
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Headers */}
      {endpoint.requiresAuth && (
        <div>
          <h4 className="text-sm font-semibold mb-3">Headers</h4>
          <div>
            <Label htmlFor="auth-header" className="text-xs">
              Authorization
            </Label>
            <Input
              id="auth-header"
              value={authHeader}
              onChange={(e) => onAuthHeaderChange(e.target.value)}
              placeholder="Bearer YOUR_TOKEN"
              className="mt-1 bg-[#090909] border-[#1f1f1f] text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {endpoint.authentication?.description || 'Bearer token authentication required'}
            </p>
            <div className="mt-1.5 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs">
              <div className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-blue-300/80">
                  <p className="font-medium mb-0.5">How to get your token:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-blue-300/70">
                    {endpoint.authentication?.loginEndpoint ? (
                      <li>Authenticate via <code className="bg-blue-500/20 px-1 py-0.5 rounded">{endpoint.authentication.loginEndpoint}</code></li>
                    ) : (
                      <li>Sign in to get your session token</li>
                    )}
                    <li>Token format: <code className="bg-blue-500/20 px-1 py-0.5 rounded">{endpoint.authentication?.headerFormat || 'Bearer YOUR_TOKEN'}</code></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


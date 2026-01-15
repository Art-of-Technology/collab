'use client';

import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Endpoint } from './types';

type DocSection = 'endpoints' | 'oauth' | 'third-party';

interface ApiDocsSidebarProps {
  endpoints: Endpoint[];
  selectedEndpoint: string | null;
  selectedMethod: string | null;
  selectedSection: DocSection;
  onSelectEndpoint: (url: string, method: string) => void;
  onSelectSection: (section: DocSection) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults?: {
    endpoints: boolean;
    oauth: boolean;
    thirdParty: boolean;
  };
}

export function ApiDocsSidebar({
  endpoints,
  selectedEndpoint,
  selectedMethod,
  selectedSection,
  onSelectEndpoint,
  onSelectSection,
  searchQuery,
  onSearchChange,
  searchResults,
}: ApiDocsSidebarProps) {
  const filteredEndpoints = useMemo(() => {
    if (!searchQuery.trim()) return endpoints;
    const query = searchQuery.toLowerCase();
    return endpoints.filter(
      (endpoint) =>
        endpoint.title.toLowerCase().includes(query) ||
        endpoint.url.toLowerCase().includes(query) ||
        endpoint.description.toLowerCase().includes(query) ||
        endpoint.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [endpoints, searchQuery]);

  const groupedEndpoints = useMemo(() => {
    const groups: Record<string, Endpoint[]> = {};
    filteredEndpoints.forEach((endpoint) => {
      const tag = endpoint.tags?.[0] || 'Other';
      if (!groups[tag]) {
        groups[tag] = [];
      }
      groups[tag].push(endpoint);
    });
    return groups;
  }, [filteredEndpoints]);

  return (
    <div className="w-full md:w-64 border-r border-[#1f1f1f] bg-[#101011] flex flex-col h-full">
      <div className="p-3 sm:p-4 border-b border-[#1f1f1f]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400" />
          <Input
            placeholder="Search documentation..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-7 sm:pl-8 h-8 text-xs sm:text-sm bg-[#101011] border-[#1f1f1f]"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {/* Documentation Sections */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
              Documentation
            </h3>
            <div className="space-y-1">
              <Button
                variant="ghost"
                onClick={() => onSelectSection('endpoints')}
                className={cn(
                  'w-full justify-start px-2 py-1.5 h-auto text-sm transition-colors',
                  selectedSection === 'endpoints'
                    ? 'bg-[#1f1f1f] text-white'
                    : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white'
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="truncate">API Endpoints</span>
                  {searchQuery && searchResults?.endpoints && (
                    <Badge variant="outline" className="ml-auto text-xs h-4 px-1">Match</Badge>
                  )}
                </div>
              </Button>
              <Button
                variant="ghost"
                onClick={() => onSelectSection('oauth')}
                className={cn(
                  'w-full justify-start px-2 py-1.5 h-auto text-sm transition-colors',
                  selectedSection === 'oauth'
                    ? 'bg-[#1f1f1f] text-white'
                    : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white'
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="truncate">OAuth 2.0</span>
                  {searchQuery && searchResults?.oauth && (
                    <Badge variant="outline" className="ml-auto text-xs h-4 px-1">Match</Badge>
                  )}
                </div>
              </Button>
              <Button
                variant="ghost"
                onClick={() => onSelectSection('third-party')}
                className={cn(
                  'w-full justify-start px-2 py-1.5 h-auto text-sm transition-colors',
                  selectedSection === 'third-party'
                    ? 'bg-[#1f1f1f] text-white'
                    : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white'
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="truncate">Third-Party API</span>
                  {searchQuery && searchResults?.thirdParty && (
                    <Badge variant="outline" className="ml-auto text-xs h-4 px-1">Match</Badge>
                  )}
                </div>
              </Button>
            </div>
          </div>

          {/* Endpoints - only show when endpoints section is selected */}
          {selectedSection === 'endpoints' && Object.entries(groupedEndpoints).map(([tag, tagEndpoints]) => (
            <div key={tag}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                {tag}
              </h3>
              <div className="space-y-1">
                {tagEndpoints.map((endpoint) => {
                  const methodColors: Record<string, string> = {
                    GET: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                    POST: 'bg-green-500/20 text-green-400 border-green-500/30',
                    PUT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                    PATCH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                    DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
                  };
                  const methodColor = methodColors[endpoint.method] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                  const endpointKey = `${endpoint.method}:${endpoint.url}:${endpoint.file}`;
                  const isSelected = selectedEndpoint === endpoint.url && selectedMethod === endpoint.method;

                  return (
                    <TooltipProvider key={endpointKey}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            onClick={() => onSelectEndpoint(endpoint.url, endpoint.method)}
                            className={cn(
                              'w-full justify-start px-2 py-2 h-auto text-sm transition-colors',
                              isSelected
                                ? 'bg-[#1f1f1f] text-white'
                                : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white'
                            )}
                          >
                            <div className="flex flex-col gap-1 min-w-0 w-full">
                              <div className="flex items-center gap-2">
                                <Badge className={cn('font-mono text-xs h-4 px-1.5 flex-shrink-0', methodColor)}>
                                  {endpoint.method}
                                </Badge>
                                <span className="text-xs text-muted-foreground truncate font-mono">
                                  {endpoint.url.replace(/^\/api\//, '').split('/')[0]}
                                </span>
                              </div>
                              <span className={cn(
                                'text-xs leading-tight line-clamp-2',
                                isSelected ? 'text-white' : 'text-gray-300'
                              )}>
                                {endpoint.title}
                              </span>
                            </div>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs bg-[#1f1f1f] border border-[#2a2a2a] text-white">
                          <div className="space-y-1">
                            <p className="font-semibold">{endpoint.title}</p>
                            <p className="text-xs text-white font-mono">{endpoint.url}</p>
                            {endpoint.description && (
                              <p className="text-xs text-white">{endpoint.description}</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}


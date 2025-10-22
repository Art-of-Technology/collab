'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, 
  GitBranch, 
  Zap, 
  Info, 
  Save,
  RotateCcw,
  Plus,
  X
} from 'lucide-react';
import { toast } from 'sonner';

interface Repository {
  id: string;
  fullName: string;
  defaultBranch: string;
  developmentBranch?: string;
  versioningStrategy: 'SINGLE_BRANCH' | 'MULTI_BRANCH';
  branchEnvironmentMap?: Record<string, string>;
  issueTypeMapping?: Record<string, 'MAJOR' | 'MINOR' | 'PATCH'>;
}

interface BranchConfigurationProps {
  repository: Repository;
  onUpdate?: () => void;
}

export function BranchConfiguration({ repository, onUpdate }: BranchConfigurationProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [versioningStrategy, setVersioningStrategy] = useState<'SINGLE_BRANCH' | 'MULTI_BRANCH'>(
    repository.versioningStrategy || 'SINGLE_BRANCH'
  );
  const [developmentBranch, setDevelopmentBranch] = useState(
    repository.developmentBranch || 'dev'
  );
  const [branchEnvironmentMap, setBranchEnvironmentMap] = useState<Record<string, string>>(
    repository.branchEnvironmentMap || {
      'main': 'production',
      'master': 'production',
      'dev': 'development',
      'develop': 'development',
      'staging': 'staging',
    }
  );
  const [issueTypeMapping, setIssueTypeMapping] = useState<Record<string, 'MAJOR' | 'MINOR' | 'PATCH'>>(
    repository.issueTypeMapping || {
      'BUG': 'PATCH',
      'HOTFIX': 'PATCH',
      'TASK': 'MINOR',
      'STORY': 'MINOR',
      'FEATURE': 'MINOR',
      'ENHANCEMENT': 'MINOR',
      'EPIC': 'MAJOR',
    }
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/github/repositories/${repository.id}/configuration`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          versioningStrategy,
          developmentBranch: versioningStrategy === 'MULTI_BRANCH' ? developmentBranch : null,
          branchEnvironmentMap,
          issueTypeMapping,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update configuration');
      }

      toast.success('Branch configuration updated successfully');
      setIsEditing(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error updating branch configuration:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form state
    setVersioningStrategy(repository.versioningStrategy || 'SINGLE_BRANCH');
    setDevelopmentBranch(repository.developmentBranch || 'dev');
    setBranchEnvironmentMap(repository.branchEnvironmentMap || {});
    setIssueTypeMapping(repository.issueTypeMapping || {});
    setIsEditing(false);
  };

  const addBranchMapping = () => {
    setBranchEnvironmentMap(prev => ({ ...prev, '': '' }));
  };

  const updateBranchMapping = (oldBranch: string, newBranch: string, environment: string) => {
    setBranchEnvironmentMap(prev => {
      const updated = { ...prev };
      if (oldBranch !== newBranch) {
        delete updated[oldBranch];
      }
      updated[newBranch] = environment;
      return updated;
    });
  };

  const removeBranchMapping = (branch: string) => {
    setBranchEnvironmentMap(prev => {
      const updated = { ...prev };
      delete updated[branch];
      return updated;
    });
  };

  const updateIssueTypeMapping = (issueType: string, versionBump: 'MAJOR' | 'MINOR' | 'PATCH') => {
    setIssueTypeMapping(prev => ({ ...prev, [issueType]: versionBump }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Branch & Versioning Configuration
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Configure how branches map to environments and how issue types affect versioning
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isEditing ? (
          // Display current configuration
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium">Versioning Strategy</Label>
                <div className="mt-2">
                  <Badge variant={versioningStrategy === 'MULTI_BRANCH' ? 'default' : 'secondary'}>
                    {versioningStrategy === 'MULTI_BRANCH' ? 'Multi-Branch (GitFlow)' : 'Single Branch'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {versioningStrategy === 'MULTI_BRANCH' 
                    ? 'Development versions accumulate, then promote to production'
                    : 'Direct versioning to main/master branch'
                  }
                </p>
              </div>

              {versioningStrategy === 'MULTI_BRANCH' && (
                <div>
                  <Label className="text-sm font-medium">Development Branch</Label>
                  <div className="mt-2">
                    <Badge variant="outline">
                      <GitBranch className="h-3 w-3 mr-1" />
                      {developmentBranch}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base branch for development versioning
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-medium">Branch → Environment Mapping</Label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(branchEnvironmentMap).map(([branch, environment]) => (
                  <div key={branch} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <Badge variant="outline" className="text-xs">
                      <GitBranch className="h-3 w-3 mr-1" />
                      {branch}
                    </Badge>
                    <span className="text-xs text-muted-foreground">→</span>
                    <Badge variant="secondary" className="text-xs">
                      {environment}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-medium">Issue Type → Version Bump Mapping</Label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(issueTypeMapping).map(([issueType, versionBump]) => (
                  <div key={issueType} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <Badge variant="outline" className="text-xs">
                      {issueType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">→</span>
                    <Badge 
                      variant={versionBump === 'MAJOR' ? 'destructive' : versionBump === 'MINOR' ? 'default' : 'secondary'} 
                      className="text-xs"
                    >
                      {versionBump}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          // Edit form
          <>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Changes to versioning configuration will affect how future versions are calculated. 
                Existing versions will not be modified.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <Label htmlFor="versioningStrategy">Versioning Strategy</Label>
                <Select 
                  value={versioningStrategy} 
                  onValueChange={(value: 'SINGLE_BRANCH' | 'MULTI_BRANCH') => setVersioningStrategy(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE_BRANCH">
                      <div className="flex flex-col">
                        <span>Single Branch</span>
                        <span className="text-xs text-muted-foreground">Direct to main/master</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="MULTI_BRANCH">
                      <div className="flex flex-col">
                        <span>Multi-Branch (GitFlow)</span>
                        <span className="text-xs text-muted-foreground">Development → Production</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {versioningStrategy === 'MULTI_BRANCH' && (
                <div>
                  <Label htmlFor="developmentBranch">Development Branch</Label>
                  <Input
                    id="developmentBranch"
                    value={developmentBranch}
                    onChange={(e) => setDevelopmentBranch(e.target.value)}
                    placeholder="dev"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Branch where development versions are created before promoting to production
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between">
                <Label>Branch → Environment Mapping</Label>
                <Button variant="outline" size="sm" onClick={addBranchMapping}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Mapping
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {Object.entries(branchEnvironmentMap).map(([branch, environment]) => (
                  <div key={branch} className="flex items-center gap-2">
                    <Input
                      value={branch}
                      onChange={(e) => updateBranchMapping(branch, e.target.value, environment)}
                      placeholder="Branch name"
                      className="flex-1"
                    />
                    <span className="text-muted-foreground">→</span>
                    <Input
                      value={environment}
                      onChange={(e) => updateBranchMapping(branch, branch, e.target.value)}
                      placeholder="Environment"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBranchMapping(branch)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label>Issue Type → Version Bump Mapping</Label>
              <div className="mt-2 space-y-2">
                {Object.entries(issueTypeMapping).map(([issueType, versionBump]) => (
                  <div key={issueType} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Badge variant="outline">{issueType}</Badge>
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <Select
                      value={versionBump}
                      onValueChange={(value: 'MAJOR' | 'MINOR' | 'PATCH') => 
                        updateIssueTypeMapping(issueType, value)
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                        <SelectItem value="MINOR">MINOR</SelectItem>
                        <SelectItem value="MAJOR">MAJOR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Zap className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

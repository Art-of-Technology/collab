"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BoardImportData, SAMPLE_IMPORT_JSON } from "@/types/board-import";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BoardImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (boardId: string) => void;
  workspaceId: string;
}

export default function BoardImportDialog({
  isOpen,
  onClose,
  onSuccess,
  workspaceId,
}: BoardImportDialogProps) {
  const [importData, setImportData] = useState<BoardImportData | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("ai");
  
  // AI Generation states
  const [aiDescription, setAiDescription] = useState("");
  const [projectType, setProjectType] = useState("");
  const [teamSize, setTeamSize] = useState("");
  
  // Background job states
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [, setJobStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Background job monitoring
  useEffect(() => {
    if (!currentJobId || !isPolling) return;

    const pollJobStatus = async () => {
      try {
        const response = await fetch(`/api/ai/board-generation/status?jobId=${currentJobId}`);
        const result = await response.json();

        if (result.success) {
          setJobStatus(result.job);

          if (result.job.status === 'COMPLETED') {
            setIsPolling(false);
            // No alert or toast
          } else if (result.job.status === 'FAILED') {
            setIsPolling(false);
            // No alert or toast
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    };

    const interval = setInterval(pollJobStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [currentJobId, isPolling]);

  const validateImportData = (data: any): string[] => {
    const errors: string[] = [];

    if (!data.board?.name) {
      errors.push("Board name is required");
    }

    if (!data.milestones || !Array.isArray(data.milestones) || data.milestones.length === 0) {
      errors.push("At least one milestone is required");
    } else {
      data.milestones.forEach((milestone: any, milestoneIndex: number) => {
        if (!milestone.title) {
          errors.push(`Milestone ${milestoneIndex + 1}: Title is required`);
        }
        
        if (milestone.epics && Array.isArray(milestone.epics)) {
          milestone.epics.forEach((epic: any, epicIndex: number) => {
            if (!epic.title) {
              errors.push(`Milestone ${milestoneIndex + 1}, Epic ${epicIndex + 1}: Title is required`);
            }
          });
        }
      });
    }

    return errors;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/json") {
      setError("Please select a valid JSON file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        const errors = validateImportData(data);
        if (errors.length > 0) {
          setValidationErrors(errors);
          setImportData(null);
          return;
        }

        setImportData(data);
        setJsonInput(JSON.stringify(data, null, 2));
                setError("");
        setValidationErrors([]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_err) {
        setError("Invalid JSON file format");
        setImportData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleJsonChange = (value: string) => {
    setJsonInput(value);
    
    if (!value.trim()) {
      setImportData(null);
      setValidationErrors([]);
      setError("");
      return;
    }

    try {
      const data = JSON.parse(value);
      
      const errors = validateImportData(data);
      if (errors.length > 0) {
        setValidationErrors(errors);
        setImportData(null);
        return;
      }

      setImportData(data);
      setError("");
      setValidationErrors([]);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      setError("Invalid JSON format");
      setImportData(null);
      setValidationErrors([]);
    }
  };

  const generateWithAI = async () => {
    if (!aiDescription.trim()) {
      setError("Please enter a project description");
      return;
    }

    setIsGenerating(true);
    setError("");
    setJobStatus(null);

    try {
      // Start background generation job
      const response = await fetch("/api/ai/board-generation/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: aiDescription,
          projectType,
          teamSize,
          workspaceId,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to start generation");
      }

      // Set job ID and start polling
      setCurrentJobId(result.jobId);
      setIsPolling(true);
      setIsGenerating(false); // Stop loading state before closing
      
      // Close modal and let user see progress in the widget
      onClose();
      
    } catch (err) {
      console.error("AI generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setIsGenerating(false);
    }
  };

  const handleImport = async () => {
    if (!importData) {
      setError("No valid data to import");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/boards/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          importData,
          workspaceId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Import failed");
      }

      if (result.success && result.boardId) {
        onSuccess(result.boardId);
        onClose();
        // Reset form
        setImportData(null);
        setJsonInput("");
        setAiDescription("");
        setProjectType("");
        setTeamSize("");
        setActiveTab("ai");
      } else {
        throw new Error("Import completed but board ID not received");
      }
    } catch (err) {
      console.error("Import error:", err);
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadSampleFile = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_IMPORT_JSON, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "board-import-sample.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getPreviewStats = () => {
    if (!importData) return null;

    const milestones = importData.milestones?.length || 0;
    const epics = importData.milestones?.reduce((total, m) => total + (m.epics?.length || 0), 0) || 0;
    const stories = importData.milestones?.reduce((total, m) => 
      total + (m.epics?.reduce((epicTotal, e) => epicTotal + (e.stories?.length || 0), 0) || 0), 0) || 0;
    const tasks = importData.milestones?.reduce((total, m) =>
      total + (m.epics?.reduce((epicTotal, e) =>
        epicTotal + (e.stories?.reduce((storyTotal, s) => storyTotal + (s.tasks?.length || 0), 0) || 0), 0) || 0), 0) || 0;

    return { milestones, epics, stories, tasks };
  };

  const stats = getPreviewStats();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Board from JSON</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai">
              <Sparkles className="w-4 h-4 mr-2" />
              Generate with AI
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="json">JSON Editor</TabsTrigger>
          </TabsList>

          {/* AI Generation Tab */}
          <TabsContent value="ai" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Generate Board with AI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="ai-description">Project Description *</Label>
                  <Textarea
                    id="ai-description"
                    placeholder="Describe your project in detail. For example: 'I want to create a mobile e-commerce app with user authentication, product catalog, shopping cart, payment integration, and admin dashboard. The app should support multiple languages and have push notifications.'"
                    value={aiDescription}
                    onChange={(e) => setAiDescription(e.target.value)}
                    rows={4}
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="project-type">Project Type (Optional)</Label>
                    <Select value={projectType} onValueChange={setProjectType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web-application">Web Application</SelectItem>
                        <SelectItem value="mobile-app">Mobile App</SelectItem>
                        <SelectItem value="api-backend">API/Backend</SelectItem>
                        <SelectItem value="desktop-app">Desktop Application</SelectItem>
                        <SelectItem value="game-development">Game Development</SelectItem>
                        <SelectItem value="data-analytics">Data Analytics</SelectItem>
                        <SelectItem value="machine-learning">Machine Learning</SelectItem>
                        <SelectItem value="infrastructure">Infrastructure</SelectItem>
                        <SelectItem value="marketing-campaign">Marketing Campaign</SelectItem>
                        <SelectItem value="research-project">Research Project</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="team-size">Team Size (Optional)</Label>
                    <Select value={teamSize} onValueChange={setTeamSize}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solo">Solo (1 person)</SelectItem>
                        <SelectItem value="small">Small (2-5 people)</SelectItem>
                        <SelectItem value="medium">Medium (6-15 people)</SelectItem>
                        <SelectItem value="large">Large (16-50 people)</SelectItem>
                        <SelectItem value="enterprise">Enterprise (50+ people)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={generateWithAI}
                  disabled={isGenerating || !aiDescription.trim()}
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting Generation...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Board Structure
                    </>
                  )}
                </Button>
                
                {/* Generation Progress */}
                {isGenerating && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span className="text-sm font-medium">Starting background generation...</span>
                    </div>
                    <div className="text-xs text-gray-600">
                      The board will be generated in the background. You can navigate to other pages and will be notified when complete.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* File Upload Tab */}
          <TabsContent value="upload" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload JSON File</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="file-upload">Select JSON File</Label>
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="mt-1"
                    />
                  </div>

                  <div className="flex justify-center">
                    <Button variant="outline" onClick={downloadSampleFile}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Sample File
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* JSON Editor Tab */}
          <TabsContent value="json" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>JSON Editor</CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="json-input">JSON Content</Label>
                  <Textarea
                    id="json-input"
                    value={jsonInput}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    placeholder="Paste your JSON content here..."
                    rows={20}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">Validation Errors:</div>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index} className="text-sm">{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Preview */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Import Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Board Information</h4>
                  <div className="text-lg font-semibold">{importData?.board?.name}</div>
                  {importData?.board?.description && (
                    <div className="text-sm text-muted-foreground">{importData.board.description}</div>
                  )}
                  {importData?.board?.issuePrefix && (
                    <Badge variant="outline" className="mt-1">
                      Prefix: {importData.board.issuePrefix}
                    </Badge>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Structure Overview</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{stats.milestones}</div>
                      <div className="text-sm text-muted-foreground">Milestones</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{stats.epics}</div>
                      <div className="text-sm text-muted-foreground">Epics</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{stats.stories}</div>
                      <div className="text-sm text-muted-foreground">Stories</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{stats.tasks}</div>
                      <div className="text-sm text-muted-foreground">Tasks</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!importData || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Board"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 
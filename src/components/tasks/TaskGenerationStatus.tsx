"use client";
 
import { JobStatus } from '@/lib/job-storage';
import { useTaskGeneration } from '@/context/TaskGenerationContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/issue/sections/activity/components/LoadingState';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Clock, CheckCircle, AlertCircle, Eye, X, Zap } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import React, { useState } from 'react';

export default function TaskGenerationStatus() {
  const { jobs } = useTaskGeneration();
  const params = useParams();
  const workspaceId = params?.workspaceId as string;
  const router = useRouter();

  // Local state for widget visibility
  const [visible, setVisible] = useState(true);

  // Widget visibility logic
  const now = Date.now();
  const hasVisibleJob = jobs.some((job: JobStatus) =>
    ['PENDING', 'GENERATING_TASKS'].includes(job.status) ||
    (
      ['COMPLETED', 'FAILED'].includes(job.status) &&
      new Date(job.updatedAt).getTime() > now - 5 * 60 * 1000 // Show completed/failed for 5 minutes
    )
  );

  // For debugging: always show widget if we have jobs
  const shouldShow = hasVisibleJob || jobs.length > 0;

  if (!shouldShow || !visible) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'GENERATING_TASKS':
        return <LoadingState size="sm" className="w-4 h-4 text-blue-500" noPadding={true} />;
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'FAILED':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'GENERATING_TASKS':
        return 'bg-blue-100 text-blue-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'GENERATING_TASKS':
        return 'Creating Tasks';
      case 'COMPLETED':
        return 'Completed';
      case 'FAILED':
        return 'Failed';
      default:
        return status;
    }
  };

  return (
    <div className="fixed bottom-4 right-[26rem] z-50 w-96 max-h-96 overflow-y-auto">
      <Card className="shadow-lg border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-500" />
              Task Generation
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setVisible(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.slice(0, 3).map((job) => (
            <div 
              key={job.id} 
              className={`space-y-2 p-3 rounded-lg border ${
                job.status === 'COMPLETED' ? 'bg-green-50 border-green-200' :
                job.status === 'FAILED' ? 'bg-red-50 border-red-200' :
                'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(job.status)}
                  <Badge className={getStatusColor(job.status)}>
                    {getStatusText(job.status)}
                  </Badge>
                  {job.status === 'COMPLETED' && job.boardData?.createdTasks && (
                    <Badge variant="outline" className="text-xs">
                      {job.boardData.createdTasks.length} tasks
                    </Badge>
                  )}
                </div>
                {job.boardId && workspaceId && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      router.push(`/${workspaceId}/tasks?board=${job.boardId}&view=kanban`);
                    }}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                )}
              </div>
              <div className="text-sm text-gray-600 line-clamp-2">
                {job.description}
              </div>
              {job.status !== 'COMPLETED' && job.status !== 'FAILED' && (
                <div className="space-y-1">
                  <Progress value={job.progress} className="h-2" />
                  <div className="text-xs text-gray-500">
                    {job.currentStep}
                  </div>
                </div>
              )}
              {job.status === 'COMPLETED' && (
                <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                  ✅ Tasks created successfully!
                </div>
              )}
              {job.error && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                  {job.error}
                </div>
              )}
              <div className="text-xs text-gray-400">
                {new Date(job.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {jobs.length === 0 && (
            <div className="text-center text-gray-500 py-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-4 h-4" />
                <span>No active task generations</span>
              </div>
              <div className="text-xs text-gray-400">
                Generate tasks from story details
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 
"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UserReport = {
  user: { id: string; name: string | null; email: string | null; image: string | null; useCustomAvatar?: boolean };
  metrics: {
    completedTotal: number;
    reporterTotal: number;
    completedByType: Record<string, number>;
  };
};

type ProjectLite = { id: string; name: string; slug: string; color?: string | null };

type ProjectReport = {
  project: { id: string; name: string; slug: string };
  totals: { created: number; completed: number };
  countsByType: Record<string, number>;
  userCompletions: {
    user: { id: string; name: string | null; email: string | null; image: string | null; useCustomAvatar?: boolean } | null;
    completed: number;
  }[];
};

interface ReportsPageClientProps {
  workspaceId: string;
  initialUserReport: { users: UserReport[] };
  projects: ProjectLite[];
}

export default function ReportsPageClient({ workspaceId, initialUserReport, projects }: ReportsPageClientProps) {
  const [userReport, setUserReport] = React.useState<{ users: UserReport[] }>(initialUserReport);
  const [selectedProjectSlug, setSelectedProjectSlug] = React.useState<string | undefined>(projects[0]?.slug);
  const [projectReport, setProjectReport] = React.useState<ProjectReport | null>(null);
  const [loadingProject, setLoadingProject] = React.useState(false);

  React.useEffect(() => {
    const loadProject = async () => {
      if (!selectedProjectSlug) {
        setProjectReport(null);
        return;
      }
      setLoadingProject(true);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/projects/${selectedProjectSlug}/reports`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load project report");
        }
        const data: ProjectReport = await res.json();
        setProjectReport(data);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        setProjectReport(null);
      } finally {
        setLoadingProject(false);
      }
    };
    loadProject();
  }, [workspaceId, selectedProjectSlug]);

  const allIssueTypes = React.useMemo(() => {
    const set = new Set<string>();
    userReport.users.forEach(u => {
      Object.keys(u.metrics.completedByType || {}).forEach(t => set.add(t));
    });
    return Array.from(set.values()).sort();
  }, [userReport]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="user" className="w-full">
        <TabsList>
          <TabsTrigger value="user">User Task Report</TabsTrigger>
          <TabsTrigger value="project">Project Report</TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Reporter Of</TableHead>
                  {allIssueTypes.map((t) => (
                    <TableHead key={t}>{t}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {userReport.users.map((row) => (
                  <TableRow key={row.user.id}>
                    <TableCell className="font-medium">{row.user.name || row.user.email || row.user.id}</TableCell>
                    <TableCell>{row.metrics.completedTotal}</TableCell>
                    <TableCell>{row.metrics.reporterTotal}</TableCell>
                    {allIssueTypes.map((t) => (
                      <TableCell key={t}>{row.metrics.completedByType?.[t] || 0}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="project" className="mt-4">
          <div className="flex items-center gap-3">
            <div className="w-72">
              <Select value={selectedProjectSlug} onValueChange={setSelectedProjectSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadingProject ? (
            <div className="text-sm text-muted-foreground mt-4">Loading project report...</div>
          ) : projectReport ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-md border p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="text-xl font-semibold">{projectReport.totals.created}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                  <div className="text-xl font-semibold">{projectReport.totals.completed}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">By Type</div>
                  <div className="text-sm">
                    {Object.entries(projectReport.countsByType)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([type, count]) => (
                        <span key={type} className="inline-block mr-3">{type}: <span className="font-medium">{count}</span></span>
                      ))
                    }
                  </div>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectReport.userCompletions.map((row) => (
                      <TableRow key={row.user?.id || 'unknown'}>
                        <TableCell className="font-medium">{row.user?.name || row.user?.email || row.user?.id || '—'}</TableCell>
                        <TableCell>{row.completed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground mt-4">No data</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}




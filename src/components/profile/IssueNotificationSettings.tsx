"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  useIssueNotificationSettings,
  useUpdateIssueNotificationSettings,
  useSaveSlackAddress,
  useRemoveSlackAddress,
  useSendSlackTest,
} from "@/hooks/queries/useNotificationPreferences";
import {
  CHOICE_KEYS,
  summaryLine,
  type CommentsChoice,
  type IssueNotificationChoices,
  type IssueNotificationView,
} from "./issueNotificationSummary";

type Notice = { text: string; tone: "ok" | "warn" };
type BooleanChoice = Exclude<keyof IssueNotificationChoices, "comments">;

const ADDRESS_PLACEHOLDER = "https://hooks.slack.com/services/…";

function failure(error: unknown): { status?: number; code?: string } {
  if (error && typeof error === "object") {
    const { status, code } = error as { status?: unknown; code?: unknown };
    return { status: typeof status === "number" ? status : undefined, code: typeof code === "string" ? code : undefined };
  }
  return {};
}

function slackState(slack: IssueNotificationView["slack"]): string {
  if (slack.on) return "On";
  if (slack.offAt) return "Switched off by Collab";
  if (!slack.address) return "Not set up";
  return "Saved, switched off";
}

function sameChoices(a: IssueNotificationChoices, b: IssueNotificationChoices) {
  return CHOICE_KEYS.every((key) => a[key] === b[key]);
}

function ChoiceBox({ id, label, note, checked, onChange }: {
  id: string; label: string; note?: string; checked: boolean; onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-normal leading-none cursor-pointer">{label}</Label>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

function LaterRow({ letter, name, note, id }: { letter: string; name: string; note: string; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/50 pt-3 opacity-60">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{letter}</span>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{name}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Later</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
      </div>
      <Switch id={id} checked={false} disabled aria-label={`Send to ${name}`} className="mt-1" />
    </div>
  );
}

export function IssueNotificationSettings() {
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const { data, isLoading } = useIssueNotificationSettings(workspaceId);
  const update = useUpdateIssueNotificationSettings(workspaceId);
  const saveAddress = useSaveSlackAddress(workspaceId);
  const removeAddress = useRemoveSlackAddress(workspaceId);
  const sendTest = useSendSlackTest(workspaceId);

  const [view, setView] = useState<IssueNotificationView | null>(data ?? null);
  const [address, setAddress] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // A fresh answer from the server (first load, or a cache update) replaces what the page shows.
  const [seen, setSeen] = useState(data);
  if (data !== seen) {
    setSeen(data);
    if (data) setView(data);
  }

  const failed = () => toast({
    title: "Error",
    description: "Failed to update notification preferences. Please try again.",
    variant: "destructive",
  });

  if (!view) {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-6 text-sm text-muted-foreground">Issue notification settings could not be loaded. Please refresh the page to try again.</CardContent>
      </Card>
    );
  }

  const current = view;
  const { slack } = current;
  const summary = summaryLine(current);
  const showAddressInput = !slack.address || replacing;

  const saveChoice = async (patch: Partial<IssueNotificationChoices>) => {
    setView({ ...current, ...patch });
    try {
      setView(await update.mutateAsync(patch));
    } catch {
      setView(current);
      failed();
    }
  };

  const switchSlack = async (on: boolean) => {
    setView({ ...current, slack: { ...current.slack, on } });
    try {
      const answer = await update.mutateAsync({ slackOn: on });
      setView(answer);
      setNotice(on && !sameChoices(current, answer)
        ? { text: "First time on: a starting set was ticked for you. Change anything.", tone: "ok" }
        : null);
    } catch {
      setView(current);
      failed();
    }
  };

  const save = async () => {
    const url = address.trim();
    if (!url) {
      setAddressError("Paste the address Slack gave you.");
      return;
    }
    try {
      const answer = await saveAddress.mutateAsync({ url });
      setView(answer);
      setAddress("");
      setReplacing(false);
      setAddressError(null);
      setNotice({ text: answer.slack.on ? "New address saved." : "Address saved. Slack stays off until you switch it on.", tone: "ok" });
    } catch (error) {
      const { status, code } = failure(error);
      if (code === "not_slack" || status === 400) setAddressError("Only a Slack webhook address is accepted. It starts with https://hooks.slack.com/services/");
      else if (code === "not_configured" || status === 503) setAddressError("Slack addresses cannot be stored on this server yet.");
      else failed();
    }
  };

  const remove = async () => {
    try {
      setView(await removeAddress.mutateAsync());
      setReplacing(false);
      setAddress("");
      setAddressError(null);
      setNotice({ text: "Address removed. Slack is off; your ticks are kept.", tone: "ok" });
    } catch {
      failed();
    }
  };

  const test = async () => {
    try {
      const answer = await sendTest.mutateAsync();
      setView(answer.settings);
      if (answer.result === "ok") setNotice({ text: "Test message sent. Look in your Slack channel.", tone: "ok" });
      else if (answer.result === "failed") setNotice({ text: "Slack did not accept the test message. Try again in a moment.", tone: "warn" });
      else setNotice(null);
    } catch {
      failed();
    }
  };

  const box = (key: BooleanChoice, id: string, label: string, note?: string) => (
    <ChoiceBox id={id} label={label} note={note} checked={current[key]}
      onChange={(checked) => saveChoice({ [key]: checked } as Partial<IssueNotificationChoices>)} />
  );

  return (
    <div className="space-y-3">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Where to send</CardTitle>
          <CardDescription className="text-sm">Only Slack can be switched on in the first version.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-medium text-purple-600 dark:text-purple-300">S</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Slack</span>
                  <span className={`text-xs ${slack.on ? "text-green-600 dark:text-green-400" : slack.offAt ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {slackState(slack)}
                  </span>
                </div>

                {showAddressInput ? (
                  <div className="space-y-2">
                    <Label htmlFor="issue-notifications-slack-address" className="text-xs text-muted-foreground">Slack webhook address</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="issue-notifications-slack-address"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={ADDRESS_PLACEHOLDER}
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        className="font-mono text-xs"
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={save} disabled={saveAddress.isPending}>Save</Button>
                        {replacing && (
                          <Button type="button" size="sm" variant="outline" onClick={() => { setReplacing(false); setAddress(""); setAddressError(null); }}>Cancel</Button>
                        )}
                      </div>
                    </div>
                    {addressError && <p className="text-xs text-destructive">{addressError}</p>}
                    <p className="text-xs text-muted-foreground">
                      In Slack: create an “Incoming webhook” for the channel you want, and paste its address here. Collab stores it encrypted and never shows it in full again.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <code className="block truncate rounded-md border border-border/50 bg-muted/50 px-3 py-1.5 font-mono text-xs">{slack.address}</code>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={test} disabled={sendTest.isPending}>Send test message</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setReplacing(true); setNotice(null); }}>Replace</Button>
                      <Button type="button" size="sm" variant="outline" className="text-destructive border-destructive/50" onClick={remove} disabled={removeAddress.isPending}>Remove</Button>
                    </div>
                  </div>
                )}

                {slack.offAt && !slack.on && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {`Switched off on ${new Date(slack.offAt).toLocaleDateString()}: Slack says this address no longer exists. Paste a new address to switch Slack on again. Your ticks are kept.`}
                  </p>
                )}
                {slack.failedAt && slack.on && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {`The last message could not be delivered (${new Date(slack.failedAt).toLocaleString()}). Slack stays on; the next message is tried as usual.`}
                  </p>
                )}
              </div>
            </div>
            <Switch
              id="issue-notifications-slack"
              aria-label="Send to Slack"
              checked={slack.on}
              disabled={!slack.address || update.isPending}
              onCheckedChange={switchSlack}
              className="mt-1"
            />
          </div>

          <LaterRow id="issue-notifications-in-app" letter="B" name="In-app" note="The bell keeps working as it does today. These choices will drive it later." />
          <LaterRow id="issue-notifications-email" letter="@" name="Email" note="Not sent yet." />

          {notice && (
            <div role="status" className={`rounded-md px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-green-500/10 text-green-800 dark:text-green-200" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
              {notice.text}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Which issues</CardTitle>
          <CardDescription className="text-sm">Status changes and “all comments” are sent for these issues.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {box("mineAssigned", "issue-notifications-mine-assigned", "Issues assigned to me")}
          {box("mineReported", "issue-notifications-mine-reported", "Issues I reported")}
          {box("mineFollowed", "issue-notifications-mine-followed", "Issues I follow")}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tell me when</CardTitle>
          <CardDescription className="text-sm">You are never told about something you did yourself.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {box("onStatus", "issue-notifications-on-status", "The status changes", "For example: moved from In Progress to In Review.")}
          {box("onAssigned", "issue-notifications-on-assigned", "An issue is assigned to me")}
          <div className="space-y-2">
            <p className="text-sm">Comments</p>
            <RadioGroup
              value={current.comments}
              onValueChange={(value) => saveChoice({ comments: value as CommentsChoice })}
              className="gap-2 pl-6"
            >
              {([
                ["off", "Off", undefined],
                ["mentions", "Only comments that mention me", "A mention reaches you on any issue, also one that is not yours."],
                ["all", "All comments", "On the issues ticked above. Mentions are included."],
              ] as const).map(([value, label, note]) => (
                <div key={value} className="flex items-start gap-3">
                  <RadioGroupItem id={`issue-notifications-comments-${value}`} value={value} className="mt-0.5" />
                  <div className="space-y-1">
                    <Label htmlFor={`issue-notifications-comments-${value}`} className="text-sm font-normal leading-none cursor-pointer">{label}</Label>
                    {note && <p className="text-xs text-muted-foreground">{note}</p>}
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
          {box("onReactions", "issue-notifications-on-reactions", "Acks and likes on my comments", "Comments you wrote, on any issue. An ack means a seat took your comment in.")}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border/50 px-4 py-3 text-sm space-y-1">
        <p>{summary.text}</p>
        {summary.warn && <p className="text-xs text-amber-700 dark:text-amber-300">{summary.warn}</p>}
      </div>
    </div>
  );
}

export default IssueNotificationSettings;

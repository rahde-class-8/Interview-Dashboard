"use client";

import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Field, fieldAria } from "@/components/shared/field";
import { FormError } from "@/components/shared/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCEPTED_EXTENSIONS, MAX_RECORDING_SIZE_MB } from "@/features/recordings/config";
import { api } from "@/lib/api/client";
import { useSubmit } from "@/lib/hooks/use-submit";
import { useAppStore } from "@/lib/store/app-store";
import { ROLE_LABELS, usePermissions } from "@/lib/store/permissions";
import { useActions } from "@/lib/store/use-actions";
import type { Workspace as ApiWorkspace } from "@/shared/contracts/workspaces";
import type { Workspace } from "@/types";

const RETENTION_OPTIONS = [
  { value: "keep", label: "Keep until deleted" },
  { value: "30", label: "Delete after 30 days" },
  { value: "90", label: "Delete after 90 days" },
  { value: "180", label: "Delete after 180 days" },
  { value: "365", label: "Delete after 365 days" },
] as const;

export function SettingsPage() {
  const { data } = useAppStore();
  const { isOwner } = usePermissions();

  return (
    <>
      <PageHeader title="Settings" description="Your profile and workspace preferences." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProfileCard />
        <WorkspaceCard key={`${data.workspace.id}-${data.workspace.name}-${data.workspace.recordingRetentionDays}`} />
        <Card>
          <CardHeader>
            <CardTitle>Recordings</CardTitle>
            <CardDescription>Recordings made with other apps, stored privately.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Accepted formats" value={ACCEPTED_EXTENSIONS.map((e) => e.slice(1).toUpperCase()).join(", ")} />
              <Row label="Maximum file size" value={`${MAX_RECORDING_SIZE_MB} MB`} />
              <Row label="Storage" value={<Badge variant="success">Private, owner and editor playback only</Badge>} />
              <Row label="In-app call recording" value="Not supported (by design)" />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Keep separate job searches apart, or share one with others.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <CreateWorkspaceDialog />
            {isOwner && <DeleteWorkspaceDialog workspace={data.workspace} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ProfileCard() {
  const { data } = useAppStore();
  const { updateProfile } = useActions();
  const submit = useSubmit();
  const [name, setName] = useState(data.currentUser.name);
  const [headline, setHeadline] = useState(data.currentUser.title);
  const dirty = name !== data.currentUser.name || headline !== data.currentUser.title;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await submit.run(() => updateProfile({ displayName: name.trim(), headline: headline.trim() || null }), { success: "Profile saved" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Shown to people you share a workspace with.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <Field id="profile-name" label="Display name" required error={!name.trim() ? "Enter your name." : submit.fieldErrors.displayName}>
            <Input {...fieldAria("profile-name", !name.trim() ? "Enter your name." : undefined)} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="profile-headline" label="Headline" hint="For example: Senior DevOps Engineer">
            <Input {...fieldAria("profile-headline", undefined, "hint")} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <p className="text-sm text-muted-foreground">Email: {data.currentUser.email}</p>
          <FormError message={submit.error} />
          <Button type="submit" disabled={!dirty || !name.trim() || submit.pending}>
            {submit.pending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function WorkspaceCard() {
  const { data } = useAppStore();
  const { isOwner } = usePermissions();
  const { updateWorkspace } = useActions();
  const submit = useSubmit();
  const workspace = data.workspace;
  const [name, setName] = useState(workspace.name);
  const [retention, setRetention] = useState(workspace.recordingRetentionDays ? String(workspace.recordingRetentionDays) : "keep");
  const retentionDays = retention === "keep" ? null : (Number(retention) as 30 | 90 | 180 | 365);
  const shortened = retentionDays !== null && (workspace.recordingRetentionDays === null || retentionDays < workspace.recordingRetentionDays);
  const dirty = name.trim() !== workspace.name || retentionDays !== workspace.recordingRetentionDays;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await submit.run(() => updateWorkspace({ name: name.trim(), recordingRetentionDays: retentionDays }), { success: "Workspace saved" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>
          {workspace.name} · your role: {ROLE_LABELS[workspace.role]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isOwner ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-3">
            <Field id="workspace-name" label="Name" required error={!name.trim() ? "Enter a name." : undefined}>
              <Input {...fieldAria("workspace-name", !name.trim() ? "Enter a name." : undefined)} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="workspace-retention" label="Recording retention" hint="Applies to existing recordings too.">
              <Select value={retention} onValueChange={setRetention}>
                <SelectTrigger id="workspace-retention" className="w-full" aria-describedby="workspace-retention-hint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {shortened && dirty && (
              <p role="alert" className="rounded-md border border-warning/50 bg-warning/5 px-3 py-2 text-sm">
                Recordings uploaded more than {retentionDays} days ago will be permanently deleted at the next cleanup run.
              </p>
            )}
            <FormError message={submit.error} />
            <Button type="submit" disabled={!dirty || !name.trim() || submit.pending}>
              {submit.pending ? "Saving…" : "Save workspace"}
            </Button>
          </form>
        ) : (
          <dl className="space-y-3 text-sm">
            <Row label="Name" value={workspace.name} />
            <Row
              label="Recording retention"
              value={workspace.recordingRetentionDays ? `${workspace.recordingRetentionDays} days` : "Keep until deleted"}
            />
            <p className="text-muted-foreground">Only the workspace owner can change these settings.</p>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function CreateWorkspaceDialog() {
  const { switchWorkspace } = useAppStore();
  const submit = useSubmit();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await submit.run(() => api<ApiWorkspace>("/workspaces", { method: "POST", body: { name: name.trim() } }), {
      success: "Workspace created",
    });
    if (created) {
      setOpen(false);
      switchWorkspace(created.id);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName("");
          submit.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">New workspace</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>You will be its owner. You can invite others from the Shared page.</DialogDescription>
        </DialogHeader>
        <form id="create-workspace-form" onSubmit={handleSubmit} noValidate className="space-y-3">
          <Field id="new-workspace-name" label="Name" required>
            <Input id="new-workspace-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <FormError message={submit.error} />
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-workspace-form" disabled={!name.trim() || submit.pending}>
            {submit.pending ? "Creating…" : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkspaceDialog({ workspace }: { workspace: Workspace }) {
  const { refreshWorkspaces } = useAppStore();
  const submit = useSubmit();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const done = await submit.run(
      async () => {
        await api(`/workspaces/${workspace.id}`, { method: "DELETE", body: { confirmName } });
        return true;
      },
      { success: "Workspace deleted" },
    );
    if (done) {
      setOpen(false);
      await refreshWorkspaces();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setConfirmName("");
          submit.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Delete this workspace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{workspace.name}”?</DialogTitle>
          <DialogDescription>
            Everything in it — opportunities, calls, recordings, notes and comments — is permanently deleted for all members. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form id="delete-workspace-form" onSubmit={handleSubmit} noValidate className="space-y-3">
          <Field id="delete-workspace-confirm" label="Type the workspace name to confirm">
            <Input id="delete-workspace-confirm" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          </Field>
          <FormError message={submit.error} />
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="delete-workspace-form" variant="destructive" disabled={confirmName !== workspace.name || submit.pending}>
            {submit.pending ? "Deleting…" : "Delete workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

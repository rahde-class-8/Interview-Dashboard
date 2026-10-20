"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FICTIONAL_DATA_NOTICE } from "@/data/mock-data";
import { ACCEPTED_EXTENSIONS, MAX_RECORDING_SIZE_MB } from "@/features/recordings/config";
import { useAppStore } from "@/lib/store/app-store";

export function SettingsPage() {
  const { data, resetData } = useAppStore();
  const user = data.currentUser;

  return (
    <>
      <PageHeader title="Settings" description="Prototype configuration and account placeholders." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Sample user — authentication is not implemented yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Name" value={user.name} />
              <Row label="Email" value={user.email} />
              <Row label="Headline" value={user.title} />
              <Row label="Workspace" value={data.workspace.name} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recording attachments</CardTitle>
            <CardDescription>
              Change the limit with <code className="text-xs">NEXT_PUBLIC_MAX_RECORDING_SIZE_MB</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Accepted formats" value={ACCEPTED_EXTENSIONS.map((e) => e.slice(1).toUpperCase()).join(", ")} />
              <Row label="Maximum file size" value={`${MAX_RECORDING_SIZE_MB} MB`} />
              <Row label="Storage" value={<Badge variant="warning">Local preview only</Badge>} />
              <Row label="In-app call recording" value="Not supported (by design)" />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Theme tokens are dark-mode ready; a toggle will come later.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" aria-pressed="true" className="border-primary">
              Light
            </Button>
            <Button variant="outline" disabled>
              Dark (coming soon)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prototype data</CardTitle>
            <CardDescription>{FICTIONAL_DATA_NOTICE}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Data is held in memory only. Nothing is saved to a server or to browser storage; reloading the page
              restores the sample dataset.
            </p>
            <ConfirmDeleteDialog
              title="Reset prototype data?"
              description="All changes made in this session will be discarded and the sample dataset restored."
              confirmLabel="Reset data"
              onConfirm={resetData}
              trigger={<Button variant="outline">Reset sample data</Button>}
            />
          </CardContent>
        </Card>
      </div>
    </>
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

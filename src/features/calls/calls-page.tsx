"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, MoreHorizontal, Paperclip, Pencil, PhoneCall, Plus, Search, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StageBadge } from "@/components/shared/stage-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNow } from "@/hooks/use-now";
import { formatDate, formatDateTime, formatDuration, STAGE_LABELS } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { getCallRows, isOverdue, type CallRow } from "@/lib/store/selectors";
import { useMutation } from "@/lib/hooks/use-submit";
import { usePermissions } from "@/lib/store/permissions";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/types";

export function CallsPage() {
  const { data } = useAppStore();
  const { deleteCall } = useActions();
  const { canEdit } = usePermissions();
  const mutate = useMutation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OpportunityStage | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<CallRow | null>(null);

  const allRows = getCallRows(data);
  const q = query.trim().toLowerCase();
  const rows = allRows.filter((row) => {
    if (status !== "all" && row.opportunity?.stage !== status) return false;
    if (!q) return true;
    return [row.recruiterName, row.companyName, row.jobTitle].some((f) => f.toLowerCase().includes(q));
  });

  return (
    <>
      <PageHeader
        title="Recruiter Calls"
        description="Notes, recordings and intelligence from every recruiter conversation."
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/calls/new">
                <Plus /> New call
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search calls by recruiter, company or job title"
            placeholder="Search recruiter, company or job title"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as OpportunityStage | "all")}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by opportunity status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {OPPORTUNITY_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
          {rows.length} of {allRows.length} calls
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title={allRows.length ? "No calls match your filters" : "No recruiter calls yet"}
          description={allRows.length ? "Try a different search or status." : "Log your first recruiter conversation."}
          action={
            !allRows.length && canEdit && (
              <Button asChild size="sm">
                <Link href="/calls/new">Log a call</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recruiter</TableHead>
                  <TableHead>Company · Role</TableHead>
                  <TableHead>Call date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>
                    <span className="sr-only">Recording</span>
                    <Paperclip className="size-3.5" aria-hidden />
                  </TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.call.id}>
                    <TableCell className="font-medium">
                      <Link href={`/calls/${row.call.id}`} className="outline-none hover:underline focus-visible:underline">
                        {row.recruiterName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block">{row.companyName}</span>
                      <span className="block text-xs text-muted-foreground">{row.jobTitle}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(row.call.callDateTime)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDuration(row.call.durationMinutes)}</TableCell>
                    <TableCell>{row.opportunity && <StageBadge stage={row.opportunity.stage} />}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <FollowUpCell row={row} />
                    </TableCell>
                    <TableCell>
                      <RecordingIndicator count={row.recordingCount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions row={row} canEdit={canEdit} onDelete={() => setPendingDelete(row)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.call.id}>
                <Card className="gap-2 px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/calls/${row.call.id}`} className="font-medium hover:underline">
                        {row.recruiterName}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {row.companyName} · {row.jobTitle}
                      </p>
                    </div>
                    <RowActions row={row} canEdit={canEdit} onDelete={() => setPendingDelete(row)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {formatDate(row.call.callDateTime)} · {formatDuration(row.call.durationMinutes)}
                    {row.opportunity && <StageBadge stage={row.opportunity.stage} />}
                    <RecordingIndicator count={row.recordingCount} />
                  </div>
                  <p className="text-xs">
                    <span className="text-muted-foreground">Follow-up: </span>
                    <FollowUpCell row={row} />
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recruiter call?</AlertDialogTitle>
            <AlertDialogDescription>
              The call with {pendingDelete?.recruiterName} ({pendingDelete?.companyName}), its recordings and its
              follow-up will be permanently deleted for everyone in this workspace. The linked opportunity is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingDelete;
                setPendingDelete(null);
                if (target) void mutate(() => deleteCall(target.call.id), "Call deleted");
              }}
            >
              Delete call
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FollowUpCell({ row }: { row: CallRow }) {
  const now = useNow();
  if (!row.followUp) return <span className="text-muted-foreground">—</span>;
  const overdue = isOverdue(row.followUp, now);
  return (
    <span
      className={cn(row.followUp.completed && "text-muted-foreground line-through", overdue && "font-medium text-destructive")}
      title={row.followUp.title}
    >
      {formatDate(row.followUp.dueDate)}
      {overdue && " (overdue)"}
    </span>
  );
}

function RecordingIndicator({ count }: { count: number }) {
  if (!count) return <span className="sr-only">No recording</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Paperclip className="size-3.5" aria-hidden />
      <span className="sr-only">{count} recording{count > 1 ? "s" : ""} attached</span>
      {count > 1 && <span aria-hidden>{count}</span>}
    </span>
  );
}

function RowActions({ row, canEdit, onDelete }: { row: CallRow; canEdit: boolean; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for call with ${row.recruiterName}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/calls/${row.call.id}`}>
            <Eye /> View details
          </Link>
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/calls/${row.call.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

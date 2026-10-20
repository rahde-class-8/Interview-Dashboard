"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ListTodo, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNow } from "@/hooks/use-now";
import { formatDate, formatRelativeDay, fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById, isOverdue, sortByDateAsc } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { FollowUpTask, ID } from "@/types";

/**
 * Checklist of follow-up tasks with an inline "add" form.
 * Pass `opportunityId` to scope new tasks; otherwise the user picks one.
 */
export function FollowUpList({
  tasks,
  opportunityId,
  showOpportunity = false,
}: {
  tasks: FollowUpTask[];
  opportunityId?: ID;
  showOpportunity?: boolean;
}) {
  const { data } = useAppStore();
  const { toggleFollowUp, deleteFollowUp } = useActions();
  const now = useNow();
  const sorted = [
    ...sortByDateAsc(tasks.filter((t) => !t.completed), (t) => t.dueDate),
    ...sortByDateAsc(tasks.filter((t) => t.completed), (t) => t.dueDate),
  ];

  return (
    <div className="@container space-y-3">
      {sorted.length === 0 ? (
        <EmptyState icon={ListTodo} title="No follow-up tasks" />
      ) : (
        <ul className="divide-y rounded-lg border">
          {sorted.map((task) => {
            const overdue = isOverdue(task, now);
            const opp = findById(data.opportunities, task.opportunityId);
            const company = findById(data.companies, opp?.companyId);
            const checkboxId = `fu-${task.id}`;
            return (
              <li key={task.id} className="flex items-start gap-3 px-3 py-2.5">
                <Checkbox
                  id={checkboxId}
                  className="mt-0.5"
                  checked={task.completed}
                  onCheckedChange={() => toggleFollowUp(task.id)}
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={checkboxId}
                    className={cn("block cursor-pointer text-sm", task.completed && "text-muted-foreground line-through")}
                  >
                    {task.title}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDate(task.dueDate)}
                    {showOpportunity && opp && (
                      <>
                        {" · "}
                        <Link href={`/opportunities/${opp.id}`} className="hover:underline">
                          {company?.name} — {opp.title}
                        </Link>
                      </>
                    )}
                    {task.callId && (
                      <>
                        {" · "}
                        <Link href={`/calls/${task.callId}`} className="hover:underline">
                          from call
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                {!task.completed && (
                  <Badge variant={overdue ? "destructive" : "outline"}>
                    {overdue ? "Overdue" : formatRelativeDay(task.dueDate, now)}
                  </Badge>
                )}
                {task.completed && <Badge variant="success">Done</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete follow-up: ${task.title}`}
                  onClick={() => deleteFollowUp(task.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <AddFollowUpForm opportunityId={opportunityId} />
    </div>
  );
}

function AddFollowUpForm({ opportunityId }: { opportunityId?: ID }) {
  const { data } = useAppStore();
  const { saveFollowUp } = useActions();
  const now = useNow();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => toDateInputValue(now.toISOString()));
  const [oppId, setOppId] = useState<string>(opportunityId ?? data.opportunities[0]?.id ?? "");
  const [error, setError] = useState("");
  const formId = opportunityId ?? "global";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Describe the follow-up.");
    if (!due) return setError("Choose a due date.");
    if (!oppId) return setError("Choose an opportunity.");
    saveFollowUp({ opportunityId: oppId, title: title.trim(), dueDate: fromDateInputValue(due), completed: false });
    setTitle("");
    setError("");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2 @xl:flex-row @xl:items-start">
      <div className="flex-1">
        <label htmlFor={`fu-title-${formId}`} className="sr-only">
          New follow-up task
        </label>
        <Input
          id={`fu-title-${formId}`}
          placeholder="Add a follow-up task…"
          value={title}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `fu-error-${formId}` : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
        {error && (
          <p id={`fu-error-${formId}`} className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {!opportunityId && (
        <Select value={oppId} onValueChange={setOppId}>
          <SelectTrigger className="w-full @xl:w-56" aria-label="Opportunity for follow-up">
            <SelectValue placeholder="Opportunity" />
          </SelectTrigger>
          <SelectContent>
            {data.opportunities.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {findById(data.companies, o.companyId)?.name} — {o.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <label htmlFor={`fu-due-${formId}`} className="sr-only">
        Due date
      </label>
      <Input
        id={`fu-due-${formId}`}
        type="date"
        className="@xl:w-40"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <Button type="submit" variant="outline">
        <Plus /> Add
      </Button>
    </form>
  );
}

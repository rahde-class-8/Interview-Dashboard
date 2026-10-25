"use client";

import { useState, type FormEvent } from "react";
import { Check, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNow } from "@/hooks/use-now";
import { formatShortDate, toDateInputValue } from "@/lib/format";
import { sortByDateAsc } from "@/lib/store/selectors";
import { useMutation, useSubmit } from "@/lib/hooks/use-submit";
import { usePermissions } from "@/lib/store/permissions";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { ID, PreparationCategory, PreparationTask } from "@/types";

export const PREP_CATEGORY_LABELS: Record<PreparationCategory, string> = {
  technical: "Technical",
  behavioral: "Behavioral",
  research: "Research",
  logistics: "Logistics",
};

export function PrepTaskList({ tasks, opportunityId }: { tasks: PreparationTask[]; opportunityId: ID }) {
  const done = tasks.filter((t) => t.completed).length;
  const sorted = [
    ...sortByDateAsc(tasks.filter((t) => !t.completed), (t) => t.dueDate ?? "9999-12-31"),
    ...tasks.filter((t) => t.completed),
  ];

  return (
    <div className="@container space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} aria-label="Checklist progress" className="flex-1" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {done}/{tasks.length} done
        </span>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={ListChecks} title="No preparation tasks yet" description="Add the first task below." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {sorted.map((task) => (
            <PrepTaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
      <CanEditPrep opportunityId={opportunityId} />
    </div>
  );
}

function CanEditPrep({ opportunityId }: { opportunityId: ID }) {
  const { canEdit } = usePermissions();
  return canEdit ? <PrepTaskForm opportunityId={opportunityId} /> : null;
}

function PrepTaskRow({ task }: { task: PreparationTask }) {
  const { togglePrepTask, deletePrepTask } = useActions();
  const { canEdit } = usePermissions();
  const mutate = useMutation();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const checkboxId = `prep-${task.id}`;

  if (editing) {
    return (
      <li className="p-3">
        <PrepTaskForm opportunityId={task.opportunityId} task={task} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const overdue = !task.completed && task.dueDate && new Date(task.dueDate) < now;

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Checkbox
        id={checkboxId}
        className="mt-0.5"
        checked={task.completed}
        disabled={!canEdit}
        onCheckedChange={() => void mutate(() => togglePrepTask(task))}
      />
      <label
        htmlFor={checkboxId}
        className={cn("min-w-0 flex-1 cursor-pointer text-sm", task.completed && "text-muted-foreground line-through")}
      >
        {task.title}
      </label>
      <Badge variant="outline">{PREP_CATEGORY_LABELS[task.category]}</Badge>
      {task.dueDate && (
        <span className={cn("w-14 text-right text-xs tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
          {formatShortDate(task.dueDate)}
        </span>
      )}
      {canEdit && (
        <>
          <Button variant="ghost" size="icon-sm" aria-label={`Edit task: ${task.title}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete task: ${task.title}`}
            onClick={() => void mutate(() => deletePrepTask(task.id), "Task deleted")}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </li>
  );
}

function PrepTaskForm({
  opportunityId,
  task,
  onDone,
}: {
  opportunityId: ID;
  task?: PreparationTask;
  onDone?: () => void;
}) {
  const { savePrepTask } = useActions();
  const [title, setTitle] = useState(task?.title ?? "");
  const [category, setCategory] = useState<PreparationCategory>(task?.category ?? "technical");
  const [due, setDue] = useState(task?.dueDate ? toDateInputValue(task.dueDate) : "");
  const [localError, setError] = useState("");
  const submit = useSubmit();
  const error = localError || submit.error;
  const idBase = task ? `edit-${task.id}` : `new-${opportunityId}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    setError("");
    const fields = { title: title.trim(), category, dueDate: due || null };
    const saved = await submit.run(() => (task ? savePrepTask(fields, task.id) : savePrepTask({ ...fields, opportunityId })), {
      success: task ? "Task saved" : "Task added",
    });
    if (!saved) return;
    if (task) onDone?.();
    else {
      setTitle("");
      setDue("");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2 @xl:flex-row @xl:items-start">
      <div className="flex-1">
        <label htmlFor={`${idBase}-title`} className="sr-only">
          {task ? "Task title" : "New preparation task"}
        </label>
        <Input
          id={`${idBase}-title`}
          placeholder="Add a preparation task…"
          value={title}
          autoFocus={!!task}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${idBase}-error` : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
        {error && (
          <p id={`${idBase}-error`} className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <Select value={category} onValueChange={(v) => setCategory(v as PreparationCategory)}>
        <SelectTrigger className="w-full @xl:w-36" aria-label="Task category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PREP_CATEGORY_LABELS).map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label htmlFor={`${idBase}-due`} className="sr-only">
        Due date (optional)
      </label>
      <Input id={`${idBase}-due`} type="date" className="@xl:w-40" value={due} onChange={(e) => setDue(e.target.value)} />
      {task ? (
        <div className="flex gap-1">
          <Button type="submit" size="icon" aria-label="Save task" disabled={submit.pending}>
            <Check />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Cancel editing" onClick={onDone}>
            <X />
          </Button>
        </div>
      ) : (
        <Button type="submit" variant="outline" disabled={submit.pending}>
          <Plus /> {submit.pending ? "Adding…" : "Add task"}
        </Button>
      )}
    </form>
  );
}

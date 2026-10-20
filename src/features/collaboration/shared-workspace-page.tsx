"use client";

import { useState, type FormEvent } from "react";
import { FileText, History, MessageSquare, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, fieldAria } from "@/components/shared/field";
import { PrototypeNotice } from "@/components/shared/prototype-notice";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, initials } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById, sortByDateAsc, sortByDateDesc } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { CollaboratorRole, ID, SharedNote } from "@/types";
import { InviteCollaboratorDialog } from "./invite-collaborator-dialog";
import { ROLE_OPTIONS } from "./roles";

const NEW_NOTE = "__new";

export function SharedWorkspacePage() {
  const { data } = useAppStore();
  const notes = sortByDateDesc(data.sharedNotes, (n) => n.updatedAt);
  const [selectedId, setSelectedId] = useState<string>(notes[0]?.id ?? NEW_NOTE);
  const selected = findById(data.sharedNotes, selectedId);

  return (
    <>
      <PageHeader
        title="Shared Workspace"
        description={data.workspace.name}
        actions={<InviteCollaboratorDialog />}
      />
      <PrototypeNotice className="mb-6">
        Collaboration is a <strong>preview of a future feature</strong>. Invitations are not emailed, permissions are not
        enforced, and notes and comments are not synchronized between people — everything here lives only in this
        browser tab. Real-time co-editing will come in a later phase.
      </PrototypeNotice>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Shared notes</CardTitle>
              <CardDescription>Notes your collaborators would be able to see</CardDescription>
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => setSelectedId(NEW_NOTE)}>
                  <Plus /> New note
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
              <nav aria-label="Shared notes">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {notes.map((note) => (
                      <li key={note.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(note.id)}
                          aria-current={note.id === selectedId ? "true" : undefined}
                          className={cn(
                            "w-full rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer",
                            note.id === selectedId ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                          )}
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <FileText className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{note.title}</span>
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {note.updatedBy} · {formatDateTime(note.updatedAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
              <NoteEditor key={selectedId} note={selected} onCreated={setSelectedId} />
            </CardContent>
          </Card>

          {selected && <Comments note={selected} />}
        </div>

        <div className="space-y-6">
          <Collaborators />
          <Activity />
        </div>
      </div>
    </>
  );
}

function NoteEditor({ note, onCreated }: { note?: SharedNote; onCreated: (id: ID) => void }) {
  const { data } = useAppStore();
  const { saveNote } = useActions();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [opportunityId, setOpportunityId] = useState(note?.opportunityId ?? "none");
  const [error, setError] = useState("");
  const dirty = !note || title !== note.title || body !== note.body || opportunityId !== (note.opportunityId ?? "none");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the note a title.");
      return;
    }
    setError("");
    const id = saveNote({
      id: note?.id,
      title: title.trim(),
      body,
      opportunityId: opportunityId === "none" ? undefined : opportunityId,
    });
    if (!note) onCreated(id);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <Field id="note-title" label="Title" required error={error}>
        <Input {...fieldAria("note-title", error)} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field id="note-opportunity" label="Related opportunity">
        <Select value={opportunityId} onValueChange={setOpportunityId}>
          <SelectTrigger id="note-opportunity" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {data.opportunities.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {findById(data.companies, o.companyId)?.name} — {o.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="note-body" label="Note">
        <Textarea id="note-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {note && !dirty ? "Saved locally — not shared with anyone" : ""}
        </span>
        <Button type="submit" disabled={!dirty}>
          {note ? "Save note" : "Create note"}
        </Button>
      </div>
    </form>
  );
}

function Comments({ note }: { note: SharedNote }) {
  const { data } = useAppStore();
  const { addComment, deleteComment } = useActions();
  const [body, setBody] = useState("");
  const comments = sortByDateAsc(
    data.comments.filter((c) => c.noteId === note.id),
    (c) => c.createdAt,
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    addComment(note.id, body.trim());
    setBody("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments</CardTitle>
        <CardDescription>On “{note.title}”</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No comments yet" />
        ) : (
          <ul className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar>
                  <AvatarFallback>{initials(c.authorName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{c.authorName}</span>{" "}
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                  </p>
                  <p className="text-sm">{c.body}</p>
                </div>
                {c.authorName === data.currentUser.name && (
                  <Button variant="ghost" size="icon-sm" aria-label="Delete comment" onClick={() => deleteComment(c.id)}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="new-comment" className="sr-only">
              Add a comment
            </label>
            <Textarea id="new-comment" rows={2} placeholder="Add a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <Button type="submit" disabled={!body.trim()}>
            Comment
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Collaborators() {
  const { data } = useAppStore();
  const { setCollaboratorRole, removeCollaborator } = useActions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collaborators</CardTitle>
        <CardDescription>{data.collaborators.length + 1} people</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          <li className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{initials(data.currentUser.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{data.currentUser.name} (you)</p>
              <p className="truncate text-xs text-muted-foreground">{data.currentUser.email}</p>
            </div>
            <Badge variant="secondary">Owner</Badge>
          </li>
          {data.collaborators.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3">
              <Avatar>
                <AvatarFallback>{initials(c.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                {c.status === "pending" && (
                  <Badge variant="warning" className="mt-1">
                    Pending · invite not sent
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Select value={c.role} onValueChange={(role) => setCollaboratorRole(c.id, role as CollaboratorRole)}>
                  <SelectTrigger size="sm" className="w-32" aria-label={`Permission for ${c.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ConfirmDeleteDialog
                  title={`Remove ${c.name}?`}
                  description="They will be removed from this workspace in the prototype's local state."
                  confirmLabel="Remove"
                  onConfirm={() => removeCollaborator(c.id)}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.name}`}>
                      <Trash2 />
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Activity() {
  const { data } = useAppStore();
  const events = sortByDateDesc(data.activity, (a) => a.createdAt).slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Recent changes in this session</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" />
        ) : (
          <ol className="space-y-3 border-l pl-4">
            {events.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary/60" aria-hidden />
                <span className="font-medium">{e.actorName}</span> {e.description}
                <span className="block text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

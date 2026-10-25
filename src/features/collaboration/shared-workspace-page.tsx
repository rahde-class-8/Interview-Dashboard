"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, FileText, History, LogOut, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, fieldAria } from "@/components/shared/field";
import { FormError } from "@/components/shared/form-error";
import { PrototypeNotice } from "@/components/shared/prototype-notice";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { ApiClientError } from "@/lib/api/client";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { useMutation, useSubmit } from "@/lib/hooks/use-submit";
import { useAppStore } from "@/lib/store/app-store";
import { commentPermissions } from "@/lib/permissions";
import { ROLE_LABELS, usePermissions } from "@/lib/store/permissions";
import { findById, sortByDateAsc, sortByDateDesc } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { SharedNote as ApiNote } from "@/shared/contracts/collaboration";
import type { Collaborator, CollaboratorRole, Comment, ID, SharedNote } from "@/types";
import { InviteCollaboratorDialog } from "./invite-collaborator-dialog";
import { ROLE_OPTIONS } from "./roles";

const NEW_NOTE = "__new";

export function SharedWorkspacePage() {
  const { data } = useAppStore();
  const { canEdit, isOwner, role } = usePermissions();
  const notes = sortByDateDesc(data.sharedNotes, (n) => n.updatedAt);
  const [selectedId, setSelectedId] = useState<string>(notes[0]?.id ?? NEW_NOTE);
  const selected = findById(data.sharedNotes, selectedId);
  const showEditor = selected || (selectedId === NEW_NOTE && canEdit);

  return (
    <>
      <PageHeader
        title="Shared Workspace"
        description={`${data.workspace.name} · you are ${ROLE_LABELS[role].toLowerCase()}`}
        actions={isOwner && <InviteCollaboratorDialog />}
      />
      <PrototypeNotice className="mb-6">
        Changes made by collaborators appear here automatically. Notes are saved as whole versions, not edited
        simultaneously: if someone saves a note before you, you&apos;ll be asked to review their version instead of
        overwriting it.
      </PrototypeNotice>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Shared notes</CardTitle>
              <CardDescription>Visible to everyone in this workspace</CardDescription>
              {canEdit && (
                <CardAction>
                  <Button size="sm" variant="outline" onClick={() => setSelectedId(NEW_NOTE)}>
                    <Plus /> New note
                  </Button>
                </CardAction>
              )}
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
                            "w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
              {showEditor ? (
                canEdit ? (
                  <NoteEditor key={selectedId} note={selected} onSaved={setSelectedId} onDeleted={() => setSelectedId(NEW_NOTE)} />
                ) : (
                  selected && <NoteView note={selected} />
                )
              ) : (
                <EmptyState icon={FileText} title="No note selected" />
              )}
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

function NoteView({ note }: { note: SharedNote }) {
  const { data } = useAppStore();
  const opp = findById(data.opportunities, note.opportunityId);
  return (
    <article className="space-y-2">
      <h3 className="font-medium">{note.title}</h3>
      {opp && <p className="text-xs text-muted-foreground">Related to {opp.title}</p>}
      <div className="text-sm whitespace-pre-line">{note.body || <span className="text-muted-foreground">Empty note.</span>}</div>
    </article>
  );
}

/**
 * Optimistic concurrency: saves send the version the edit started from. If the
 * server has a newer version (409), the user chooses between theirs and ours.
 */
function NoteEditor({ note, onSaved, onDeleted }: { note?: SharedNote; onSaved: (id: ID) => void; onDeleted: () => void }) {
  const { data } = useAppStore();
  const { saveNote, applyNote, deleteNote } = useActions();
  const toast = useToast();
  const submit = useSubmit();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [opportunityId, setOpportunityId] = useState(note?.opportunityId ?? "none");
  // The saved version the draft started from.
  const [base, setBase] = useState(() => snapshot(note));
  const [titleError, setTitleError] = useState("");
  const [conflict, setConflict] = useState<SharedNote>();

  const dirty = !note || title !== base.title || body !== base.body || opportunityId !== base.opportunityId;

  function load(source: SharedNote) {
    setTitle(source.title);
    setBody(source.body);
    setOpportunityId(source.opportunityId ?? "none");
    setBase(snapshot(source));
    setConflict(undefined);
  }

  // A collaborator saved while this editor is open: follow along if untouched, otherwise offer to load it.
  if (note && note.version > base.version && !dirty && !conflict) load(note);
  const newerOnServer = note && note.version > base.version && !conflict;

  async function save(version: number) {
    const saved = await submit.run(async () => {
      try {
        return await saveNote({
          id: note?.id,
          version,
          title: title.trim(),
          body,
          opportunityId: opportunityId === "none" ? null : opportunityId,
        });
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 409 && error.body && typeof error.body === "object" && "current" in error.body) {
          const current = applyNote((error.body as { current: ApiNote }).current);
          setConflict(current);
          return undefined;
        }
        throw error;
      }
    });
    if (saved) {
      setConflict(undefined);
      setBase(snapshot(saved));
      toast.success(note ? "Note saved" : "Note created");
      onSaved(saved.id);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Give the note a title.");
      return;
    }
    setTitleError("");
    void save(base.version);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      {conflict && (
        <div role="alert" className="space-y-2 rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> {conflict.updatedBy} saved a newer version while you were editing.
          </p>
          <details>
            <summary className="cursor-pointer text-muted-foreground">Show their version</summary>
            <div className="mt-2 max-h-48 overflow-auto rounded border bg-background p-2 whitespace-pre-line">{conflict.body || "Empty note."}</div>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => load(conflict)}>
              Discard mine, load theirs
            </Button>
            <Button type="button" size="sm" onClick={() => void save(conflict.version)} disabled={submit.pending}>
              Save mine over theirs
            </Button>
          </div>
        </div>
      )}
      {newerOnServer && note && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="flex-1">{note.updatedBy} saved a newer version of this note.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => load(note)}>
            Load latest
          </Button>
        </div>
      )}
      <Field id="note-title" label="Title" required error={titleError || submit.fieldErrors.title}>
        <Input {...fieldAria("note-title", titleError || submit.fieldErrors.title)} value={title} onChange={(e) => setTitle(e.target.value)} />
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
      <FormError message={submit.error} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">
          {submit.pending ? "Saving…" : note && !dirty ? `Saved · version ${base.version}` : note ? "Unsaved changes" : ""}
        </span>
        {note && (
          <ConfirmDeleteDialog
            title="Delete this note?"
            description={`“${note.title}” and its comments will be permanently deleted for everyone in this workspace.`}
            onConfirm={async () => {
              await deleteNote(note.id);
              toast.success("Note deleted");
              onDeleted();
            }}
            trigger={
              <Button type="button" variant="ghost" className="text-destructive">
                <Trash2 /> Delete
              </Button>
            }
          />
        )}
        <Button type="submit" disabled={!dirty || submit.pending || !!conflict}>
          {note ? "Save note" : "Create note"}
        </Button>
      </div>
    </form>
  );
}

function Comments({ note }: { note: SharedNote }) {
  const { data } = useAppStore();
  const { canComment } = usePermissions();
  const { addComment } = useActions();
  const submit = useSubmit();
  const [body, setBody] = useState("");
  const comments = sortByDateAsc(
    data.comments.filter((c) => c.noteId === note.id),
    (c) => c.createdAt,
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const done = await submit.run(async () => {
      await addComment(note.id, body.trim());
      return true;
    });
    if (done) setBody("");
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
              <CommentItem key={c.id} comment={c} />
            ))}
          </ul>
        )}
        {canComment ? (
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="new-comment" className="sr-only">
                  Add a comment
                </label>
                <Textarea id="new-comment" rows={2} placeholder="Add a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <Button type="submit" disabled={!body.trim() || submit.pending}>
                {submit.pending ? "Posting…" : "Comment"}
              </Button>
            </div>
            <FormError message={submit.error} />
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">Viewers can read comments. Ask the owner for commenter access to reply.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CommentItem({ comment }: { comment: Comment }) {
  const { data } = useAppStore();
  const { role } = usePermissions();
  const { editComment, deleteComment } = useActions();
  const mutate = useMutation();
  const submit = useSubmit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const mine = comment.authorId === data.currentUser.id;
  const allowed = commentPermissions(role, mine);

  if (comment.deleted) {
    return <li className="text-sm text-muted-foreground italic">Comment deleted.</li>;
  }

  return (
    <li className="flex gap-3">
      <Avatar>
        <AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{comment.authorName}</span>{" "}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(comment.createdAt)}
            {comment.editedAt && " · edited"}
          </span>
        </p>
        {editing ? (
          <form
            className="mt-1 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await submit.run(async () => {
                await editComment(comment.id, draft.trim());
                return true;
              });
              if (ok) setEditing(false);
            }}
          >
            <label htmlFor={`edit-${comment.id}`} className="sr-only">
              Edit comment
            </label>
            <Textarea id={`edit-${comment.id}`} rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <FormError message={submit.error} />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={!draft.trim() || submit.pending}>
                Save
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm whitespace-pre-line">{comment.body}</p>
        )}
      </div>
      {!editing && (
        <div className="flex shrink-0">
          {allowed.canEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit comment"
              onClick={() => {
                setDraft(comment.body);
                setEditing(true);
              }}
            >
              <Pencil />
            </Button>
          )}
          {allowed.canDelete && (
            <Button variant="ghost" size="icon-sm" aria-label="Delete comment" onClick={() => void mutate(() => deleteComment(comment.id), "Comment deleted")}>
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Collaborators() {
  const { data } = useAppStore();
  const { isOwner } = usePermissions();
  const { setMemberRole, removeMember, revokeInvitation, leaveWorkspace } = useActions();
  const mutate = useMutation();
  const toast = useToast();
  const router = useRouter();
  const members = data.collaborators.filter((c) => c.kind === "member");
  const invitations = data.collaborators.filter((c) => c.kind === "invitation");
  const me = members.find((m) => m.isYou);

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>
          {members.length} member{members.length === 1 ? "" : "s"}
          {invitations.length > 0 && ` · ${invitations.length} invitation${invitations.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-4">
          {members.map((c) => (
            <MemberRow
              key={c.id}
              member={c}
              canManage={isOwner && c.role !== "owner"}
              onRole={(role) => void mutate(() => setMemberRole(c.id, role), `${c.name} is now ${ROLE_LABELS[role].toLowerCase()}`)}
              onRemove={() => removeMember(c.id).then(() => toast.success(`${c.name} was removed`))}
            />
          ))}
        </ul>
        {invitations.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Invitations</h3>
            <ul className="space-y-3">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[inv.role]} ·{" "}
                      {inv.status === "expired" ? "expired" : `expires ${inv.expiresAt ? formatDate(inv.expiresAt) : ""}`}
                    </p>
                  </div>
                  {inv.status === "pending" ? (
                    <ConfirmDeleteDialog
                      title="Revoke invitation?"
                      description={`The link sent to ${inv.email} will stop working.`}
                      confirmLabel="Revoke"
                      onConfirm={() => revokeInvitation(inv.id).then(() => toast.success("Invitation revoked"))}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Revoke
                        </Button>
                      }
                    />
                  ) : (
                    <Badge variant="outline">Expired</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {me && me.role !== "owner" && (
          <ConfirmDeleteDialog
            title="Leave this workspace?"
            description="You will lose access immediately. The owner can invite you again."
            confirmLabel="Leave workspace"
            onConfirm={async () => {
              await leaveWorkspace();
              toast.success("You left the workspace");
              router.push("/");
            }}
            trigger={
              <Button variant="outline" size="sm" className="w-full">
                <LogOut /> Leave workspace
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member,
  canManage,
  onRole,
  onRemove,
}: {
  member: Collaborator;
  canManage: boolean;
  onRole: (role: CollaboratorRole) => void;
  onRemove: () => Promise<unknown>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3">
      <Avatar>
        <AvatarFallback>{initials(member.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name}
          {member.isYou && " (you)"}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
      {canManage ? (
        <div className="flex items-center gap-1">
          <Select value={member.role} onValueChange={(role) => onRole(role as CollaboratorRole)}>
            <SelectTrigger size="sm" className="w-32" aria-label={`Permission for ${member.name}`}>
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
            title={`Remove ${member.name}?`}
            description="They lose access to this workspace immediately. Content they created stays."
            confirmLabel="Remove"
            onConfirm={onRemove}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`}>
                <Trash2 />
              </Button>
            }
          />
        </div>
      ) : (
        <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
      )}
    </li>
  );
}

function Activity() {
  const { data } = useAppStore();
  const events = sortByDateDesc(data.activity, (a) => a.createdAt).slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Recent important changes by everyone</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" />
        ) : (
          <ol className="space-y-3 border-l pl-4" aria-label="Recent activity">
            {events.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary/60" aria-hidden />
                {e.summary}
                <span className="block text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function snapshot(note?: SharedNote) {
  return {
    title: note?.title ?? "",
    body: note?.body ?? "",
    opportunityId: note?.opportunityId ?? "none",
    version: note?.version ?? 0,
  };
}

"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, UserPlus } from "lucide-react";

import { Field, fieldAria } from "@/components/shared/field";
import { FormError } from "@/components/shared/form-error";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/format";
import { useSubmit } from "@/lib/hooks/use-submit";
import { useAppStore } from "@/lib/store/app-store";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { CollaboratorRole, InvitationCreated } from "@/shared/contracts/collaboration";
import { ROLE_OPTIONS } from "./roles";

/** Owner-only: creates an invitation and shows its one-time link to share. */
export function InviteCollaboratorDialog() {
  const { data } = useAppStore();
  const { inviteCollaborator } = useActions();
  const submit = useSubmit();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("commenter");
  const [emailError, setEmailError] = useState<string>();
  const [created, setCreated] = useState<InvitationCreated>();
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    let next: string | undefined;
    if (!/^\S+@\S+\.\S+$/.test(normalized)) next = "Enter a valid email address.";
    else if (data.collaborators.some((c) => c.email.toLowerCase() === normalized && c.status !== "expired"))
      next = "This person already has access or a pending invitation.";
    setEmailError(next);
    if (next) return;
    const result = await submit.run(() => inviteCollaborator(normalized, role), { success: "Invitation created" });
    if (result) setCreated(result);
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setEmail("");
          setRole("commenter");
          setEmailError(undefined);
          setCreated(undefined);
          setCopied(false);
          submit.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite collaborator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Share the invitation link" : "Invite a collaborator"}</DialogTitle>
          <DialogDescription>
            {created
              ? "Invitation emails are not sent yet. Send this link to them yourself."
              : "They get access with the role you choose after signing in with this email address."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <label htmlFor="invite-link" className="sr-only">
                Invitation link
              </label>
              <Input id="invite-link" readOnly value={created.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copy()} aria-label="Copy invitation link">
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-muted-foreground">
              The link works once, only for <strong>{created.invitation.email}</strong>, until {formatDate(created.invitation.expiresAt)}. It
              is shown only now; if it gets lost, revoke the invitation and create a new one.
            </p>
          </div>
        ) : (
          <form id="invite-form" onSubmit={handleSubmit} noValidate className="space-y-4">
            <Field id="invite-email" label="Email" required error={emailError ?? submit.fieldErrors.email}>
              <Input
                {...fieldAria("invite-email", emailError ?? submit.fieldErrors.email)}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Permission</legend>
              <div className="grid grid-cols-1 gap-2">
                {ROLE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                      role === option.value && "border-primary bg-accent/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="invite-role"
                      value={option.value}
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <FormError message={submit.error} />
          </form>
        )}

        <DialogFooter>
          {created ? (
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="invite-form" disabled={submit.pending}>
                {submit.pending ? "Creating…" : "Create invitation"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

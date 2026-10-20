"use client";

import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";

import { Field, fieldAria } from "@/components/shared/field";
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
import { useAppStore } from "@/lib/store/app-store";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { CollaboratorRole } from "@/types";
import { ROLE_OPTIONS } from "./roles";

export function InviteCollaboratorDialog() {
  const { data } = useAppStore();
  const { inviteCollaborator } = useActions();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("commenter");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const normalized = email.trim().toLowerCase();
    if (!name.trim()) next.name = "Enter the collaborator's name.";
    if (!/^\S+@\S+\.\S+$/.test(normalized)) next.email = "Enter a valid email address.";
    else if (
      normalized === data.currentUser.email.toLowerCase() ||
      data.collaborators.some((c) => c.email.toLowerCase() === normalized)
    )
      next.email = "This person already has access.";
    setErrors(next);
    if (Object.keys(next).length) return;
    inviteCollaborator(name.trim(), normalized, role);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName("");
          setEmail("");
          setRole("commenter");
          setErrors({});
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
          <DialogTitle>Invite a collaborator</DialogTitle>
          <DialogDescription>
            Prototype only: this adds a pending collaborator to local state. No email is sent and no access is granted.
          </DialogDescription>
        </DialogHeader>
        <form id="invite-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field id="invite-name" label="Name" required error={errors.name}>
            <Input {...fieldAria("invite-name", errors.name)} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="invite-email" label="Email" required error={errors.email}>
            <Input {...fieldAria("invite-email", errors.email)} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form">
            Add to workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

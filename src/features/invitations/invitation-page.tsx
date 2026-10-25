"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Users } from "lucide-react";

import { FormError } from "@/components/shared/form-error";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/auth-card";
import { api, errorMessage } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import type { InvitationAccepted, InvitationPreview } from "@/shared/contracts/collaboration";

const ROLE_TEXT = {
  editor: "edit records and notes, upload and play recordings",
  commenter: "read everything and comment on shared notes",
  viewer: "read everything in the workspace",
} as const;

type State = { phase: "loading" } | { phase: "ready"; preview: InvitationPreview } | { phase: "invalid"; message: string };

/** Shows who invited the user to which workspace, then accepts the invitation. */
export function InvitationPage({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    api<InvitationPreview>("/invitations/preview", { method: "POST", body: { token } })
      .then((preview) => !cancelled && setState({ phase: "ready", preview }))
      .catch((caught) => !cancelled && setState({ phase: "invalid", message: errorMessage(caught) }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setAccepting(true);
    setError(undefined);
    try {
      const result = await api<InvitationAccepted>("/invitations/accept", { method: "POST", body: { token } });
      try {
        window.localStorage.setItem("activeWorkspaceId", result.workspaceId);
      } catch {
        // storage unavailable: the workspace can be chosen from the switcher
      }
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        <AuthCard title="Workspace invitation" description={`Signed in as ${email}`}>
          {state.phase === "loading" && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your invitation…
            </p>
          )}
          {state.phase === "invalid" && (
            <div className="space-y-4">
              <p role="alert" className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                {state.message} Ask the workspace owner to send you a new invitation.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/">Go to your dashboard</Link>
              </Button>
            </div>
          )}
          {state.phase === "ready" && (
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Users className="mt-0.5 size-5 text-primary" aria-hidden />
                <p>
                  {state.preview.invitedByName ?? "The owner"} invited you to <strong>{state.preview.workspaceName}</strong> as{" "}
                  <strong>{state.preview.role}</strong>. You&apos;ll be able to {ROLE_TEXT[state.preview.role]}.
                  <span className="mt-1 block text-xs text-muted-foreground">Valid until {formatDate(state.preview.expiresAt)}.</span>
                </p>
              </div>
              {!state.preview.emailMatches && (
                <p role="alert" className="rounded-md border border-warning/50 bg-warning/5 px-3 py-2">
                  This invitation was sent to a different email address. Sign out and sign in with the invited address to accept it.
                </p>
              )}
              <FormError message={error} />
              <Button className="w-full" onClick={() => void accept()} disabled={accepting || !state.preview.emailMatches}>
                {accepting ? "Joining…" : "Accept invitation"}
              </Button>
            </div>
          )}
        </AuthCard>
      </div>
    </div>
  );
}

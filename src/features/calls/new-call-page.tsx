"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { usePermissions } from "@/lib/store/permissions";
import { Lock } from "lucide-react";
import { CallForm } from "./call-form";

export function NewCallPage() {
  const searchParams = useSearchParams();
  const { canEdit } = usePermissions();
  if (!canEdit) {
    return (
      <EmptyState
        icon={Lock}
        title="You can't log calls in this workspace"
        description="Your role is read-only here. Ask the workspace owner for editor access."
        action={
          <Button asChild>
            <Link href="/calls">Back to calls</Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/calls">
          <ArrowLeft /> Recruiter calls
        </Link>
      </Button>
      <PageHeader
        title="New recruiter call"
        description="Capture what you learned. Only the essentials are required — fill in the rest when you can."
      />
      <CallForm presetOpportunityId={searchParams.get("opportunityId") ?? undefined} />
    </>
  );
}

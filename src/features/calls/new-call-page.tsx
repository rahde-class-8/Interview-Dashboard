"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { CallForm } from "./call-form";

export function NewCallPage() {
  const searchParams = useSearchParams();
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

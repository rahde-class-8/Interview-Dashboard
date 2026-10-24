import Link from "next/link";

import { AuthCard } from "@/features/auth/auth-card";
import { LoginForm } from "@/features/auth/login-form";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata = { title: "Sign in" };

const NOTICES = {
  signed_out: { tone: "success", text: "You have been signed out." },
  link_invalid: { tone: "error", text: "That link is invalid or has expired. Sign in, or request a new link." },
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next, "") : "";
  const notice = params.signed_out ? NOTICES.signed_out : params.error === "link_invalid" ? NOTICES.link_invalid : undefined;

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to your workspace."
      footer={
        <p>
          New here?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <LoginForm next={next || undefined} notice={notice} />
    </AuthCard>
  );
}

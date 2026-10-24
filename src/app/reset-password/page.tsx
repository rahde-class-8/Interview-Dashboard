import { redirect } from "next/navigation";

import { AuthCard } from "@/features/auth/auth-card";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { getCurrentUser } from "@/server/core/auth";

export const metadata = { title: "Choose a new password" };

/** Reached from the recovery email link, which signs the user in first. */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/forgot-password?error=link_invalid");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <AuthCard title="Choose a new password" description={`Signed in as ${user.email}.`}>
          <ResetPasswordForm />
        </AuthCard>
      </div>
    </main>
  );
}

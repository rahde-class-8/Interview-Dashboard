import { redirect } from "next/navigation";

import { InvitationPage } from "@/features/invitations/invitation-page";
import { getCurrentUser } from "@/server/core/auth";

export const metadata = { title: "Workspace invitation" };

/** /invite/<token> — the middleware sends signed-out visitors to sign in first. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  return <InvitationPage token={token} email={user.email} />;
}

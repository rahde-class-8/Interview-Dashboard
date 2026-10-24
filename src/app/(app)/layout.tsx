import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { AppStoreProvider } from "@/lib/store/app-store";
import { getCurrentUser } from "@/server/core/auth";

/** Authenticated application shell. The middleware also guards these routes. */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppStoreProvider>
      <AppShell user={{ displayName: user.displayName, email: user.email }}>{children}</AppShell>
    </AppStoreProvider>
  );
}

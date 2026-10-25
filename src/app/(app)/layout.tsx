import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toaster";
import { AppStoreProvider } from "@/lib/store/app-store";
import { getCurrentUser } from "@/server/core/auth";

/** Authenticated application shell. The middleware also guards these routes. */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <ToastProvider>
      <AppStoreProvider user={{ id: user.id, displayName: user.displayName, email: user.email }}>
        <AppShell user={{ displayName: user.displayName, email: user.email }}>{children}</AppShell>
      </AppStoreProvider>
    </ToastProvider>
  );
}

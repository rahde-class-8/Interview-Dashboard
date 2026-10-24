import type { ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { DataGate } from "@/components/shared/data-gate";

export interface ShellUser {
  displayName: string;
  email: string;
}

export function AppShell({ children, user }: { children: ReactNode; user: ShellUser }) {
  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <DataGate>{children}</DataGate>
        </main>
      </div>
    </div>
  );
}

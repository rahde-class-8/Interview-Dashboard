import { Brand, NavLinks } from "./nav-links";

export function AppSidebar() {
  return (
    <div className="hidden w-64 shrink-0 border-r bg-sidebar lg:block">
      <aside className="sticky top-0 flex h-screen flex-col gap-6 px-3 py-4">
        <div className="px-2">
          <Brand />
        </div>
        <NavLinks />
        <p className="mt-auto rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Prototype — data lives in this browser tab only and resets on reload.
        </p>
      </aside>
    </div>
  );
}

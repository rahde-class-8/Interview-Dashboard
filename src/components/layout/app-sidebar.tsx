import { Brand, NavLinks } from "./nav-links";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AppSidebar() {
  return (
    <div className="hidden w-64 shrink-0 border-r bg-sidebar lg:block">
      <aside className="sticky top-0 flex h-screen flex-col gap-6 px-3 py-4">
        <div className="px-2">
          <Brand />
        </div>
        <NavLinks />
        <div className="mt-auto">
          <WorkspaceSwitcher />
        </div>
      </aside>
    </div>
  );
}

"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/lib/store/app-store";
import { ROLE_LABELS } from "@/lib/store/permissions";

/** Shows the active workspace and the user's role; switches between workspaces they belong to. */
export function WorkspaceSwitcher({ onSwitch }: { onSwitch?: () => void }) {
  const { data, status, workspaces, switchWorkspace } = useAppStore();
  if (status !== "ready" || workspaces.length === 0) return null;

  return (
    <div className="space-y-1.5 px-1">
      <label htmlFor="workspace-switcher" className="px-1 text-xs font-medium text-muted-foreground">
        Workspace
      </label>
      <Select
        value={data.workspace.id}
        onValueChange={(id) => {
          switchWorkspace(id);
          onSwitch?.();
        }}
      >
        <SelectTrigger id="workspace-switcher" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name} · {ROLE_LABELS[w.role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

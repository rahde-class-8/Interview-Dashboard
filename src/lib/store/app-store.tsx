"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";

import { ApiClientError, api, errorMessage } from "@/lib/api/client";
import { toWorkspace } from "@/lib/api/mappers";
import { loadWorkspaceData, refreshRecord } from "@/lib/api/workspace-data";
import type { Me, Workspace as ApiWorkspace } from "@/shared/contracts/workspaces";
import type { AppData, User, Workspace } from "@/types";
import { appReducer, type AppAction } from "./reducer";
import { useRealtimeSync } from "./use-realtime-sync";

type LoadStatus = "loading" | "ready" | "error";

interface AppStoreValue {
  data: AppData;
  dispatch: Dispatch<AppAction>;
  status: LoadStatus;
  /** Message shown when loading failed. */
  error?: string;
  /** Reloads the active workspace from the server. */
  reload: (options?: { silent?: boolean }) => Promise<void>;
  /** All workspaces the user belongs to. */
  workspaces: Workspace[];
  switchWorkspace: (workspaceId: string) => void;
  /** Re-reads the workspace list (after creating, renaming, leaving or losing access). */
  refreshWorkspaces: () => Promise<void>;
  /** Re-reads records changed by a composite write (e.g. a call with a new opportunity). */
  refresh: (changes: { table: string; id: string }[]) => Promise<void>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";

function readStoredWorkspace() {
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function storeWorkspace(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
  } catch {
    // Storage unavailable (private mode): fall back to the default workspace next time.
  }
}

/** The remembered workspace if the user still belongs to it, else their own, else the first. */
function pickWorkspace(list: Workspace[], preferred: string | null) {
  return list.find((w) => w.id === preferred) ?? list.find((w) => w.role === "owner") ?? list[0];
}

export interface StoreUser {
  id: string;
  displayName: string;
  email: string;
}

/**
 * Client-side cache of the active workspace, loaded from the API and kept in
 * sync by Realtime change notifications. The server is the source of truth:
 * every mutation goes through the API first (see use-actions.ts).
 */
export function AppStoreProvider({ user, children }: { user: StoreUser; children: ReactNode }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string>();
  const [data, dispatch] = useReducer(appReducer, EMPTY_DATA);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const activeId = useRef<string | null>(null);
  const loadToken = useRef(0);

  const load = useCallback(
    async (options: { silent?: boolean; workspaceId?: string } = {}) => {
      const token = ++loadToken.current;
      if (!options.silent) setStatus("loading");
      try {
        const [list, me] = await Promise.all([
          api<{ data: ApiWorkspace[] }>("/workspaces").then((r) => r.data.map(toWorkspace)),
          api<Me>("/me"),
        ]);
        const workspace = pickWorkspace(list, options.workspaceId ?? activeId.current ?? readStoredWorkspace());
        if (!workspace) throw new ApiClientError(404, "not_found", "No workspace is available for your account.");
        const currentUser: User = { id: me.id, name: me.displayName, email: me.email, title: me.headline ?? "" };
        const next = await loadWorkspaceData(workspace, currentUser);
        if (token !== loadToken.current) return; // a newer load started meanwhile
        activeId.current = workspace.id;
        storeWorkspace(workspace.id);
        setWorkspaces(list);
        dispatch({ type: "reset", data: next });
        setError(undefined);
        setStatus("ready");
      } catch (loadError) {
        if (token !== loadToken.current) return;
        console.error("Failed to load workspace data", loadError);
        setError(errorMessage(loadError));
        if (!options.silent) setStatus("error");
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback((options?: { silent?: boolean }) => load(options), [load]);

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      activeId.current = workspaceId;
      storeWorkspace(workspaceId);
      void load({ workspaceId });
    },
    [load],
  );

  const refreshWorkspaces = useCallback(async () => {
    const list = (await api<{ data: ApiWorkspace[] }>("/workspaces")).data.map(toWorkspace);
    setWorkspaces(list);
    const current = list.find((w) => w.id === activeId.current);
    if (current) dispatch({ type: "workspace/update", workspace: current });
    else await load({ workspaceId: pickWorkspace(list, null)?.id }); // access to the active workspace ended
  }, [load]);

  const workspace = status === "ready" ? data.workspace : undefined;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const refresh = useCallback(
    async (changes: { table: string; id: string }[]) => {
      const current = workspaceRef.current;
      if (!current) return;
      const results = await Promise.allSettled(changes.map((c) => refreshRecord(current, c.table, c.id)));
      for (const result of results) {
        if (result.status === "fulfilled") result.value.forEach(dispatch);
        else if (result.reason instanceof ApiClientError && (result.reason.status === 404 || result.reason.status === 403)) {
          await refreshWorkspaces(); // our role changed or we were removed
          return;
        } else console.error("Failed to refresh a changed record", result.reason);
      }
    },
    [refreshWorkspaces],
  );

  const onChanges = useCallback(
    (changes: { table: string; id: string }[]) => {
      if (changes.some((c) => c.table === "workspaces" || (c.table === "workspace_members" && c.id === user.id))) {
        void refreshWorkspaces().then(() => refresh(changes.filter((c) => c.table !== "workspaces")));
      } else void refresh(changes);
    },
    [refresh, refreshWorkspaces, user.id],
  );

  // After a dropped connection, notifications may have been missed: reload quietly.
  const onResync = useCallback(() => void load({ silent: true }), [load]);
  useRealtimeSync(workspace?.id, onChanges, onResync);

  const value = useMemo(
    () => ({ data, dispatch, status, error, reload, workspaces, switchWorkspace, refreshWorkspaces, refresh }),
    [data, status, error, reload, workspaces, switchWorkspace, refreshWorkspaces, refresh],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}

const EMPTY_DATA: AppData = {
  currentUser: { id: "", name: "", email: "", title: "" },
  workspace: { id: "", name: "", ownerId: "", role: "viewer", recordingRetentionDays: null, createdAt: "" },
  collaborators: [],
  companies: [],
  recruiters: [],
  opportunities: [],
  calls: [],
  recordings: [],
  interviews: [],
  followUps: [],
  preparationTasks: [],
  starStories: [],
  questions: [],
  sharedNotes: [],
  comments: [],
  activity: [],
};

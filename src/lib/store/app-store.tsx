"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";

import { createMockData } from "@/data/mock-data";
import type { AppData } from "@/types";
import { appReducer, type AppAction } from "./reducer";

type LoadStatus = "loading" | "ready" | "error";

interface AppStoreValue {
  data: AppData;
  dispatch: Dispatch<AppAction>;
  status: LoadStatus;
  /** Restores the original mock dataset. */
  resetData: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

/**
 * In-memory prototype data store. State is created on the client after mount
 * (dates are relative to the user's "now" and formatted in their timezone),
 * which also models the loading phase a real API request would have.
 * Nothing is persisted: a full page reload restores the mock dataset.
 */
export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, dispatch] = useReducer(appReducer, EMPTY_DATA);

  useEffect(() => {
    try {
      dispatch({ type: "reset", data: createMockData(new Date()) });
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load prototype data", error);
      setStatus("error");
    }
  }, []);

  const resetData = useCallback(() => {
    dispatch({ type: "reset", data: createMockData(new Date()) });
  }, []);

  const value = useMemo(
    () => ({ data, dispatch, status, resetData }),
    [data, status, resetData],
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
  workspace: { id: "", name: "", ownerId: "", createdAt: "" },
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

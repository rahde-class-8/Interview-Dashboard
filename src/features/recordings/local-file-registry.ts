"use client";

import { useSyncExternalStore } from "react";

import type { ID } from "@/types";

/**
 * Holds locally selected recording files in memory, keyed by attachment ID.
 * Files are never written to browser storage and disappear on page reload.
 * When a backend exists, this is replaced by remote URLs on the attachment.
 */
const files = new Map<ID, File>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const localFileRegistry = {
  get: (id: ID) => files.get(id),
  set(id: ID, file: File) {
    files.set(id, file);
    emit();
  },
  delete(id: ID) {
    if (files.delete(id)) emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The in-memory File for an attachment, if one was selected this session. */
export function useLocalFile(id: ID) {
  return useSyncExternalStore(
    localFileRegistry.subscribe,
    () => localFileRegistry.get(id),
    () => undefined,
  );
}

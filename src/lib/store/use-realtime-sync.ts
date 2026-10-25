"use client";

import { useEffect, useRef } from "react";

import { api } from "@/lib/api/client";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";
import { workspaceTopic, type RealtimeChange, type RealtimeToken } from "@/shared/contracts/collaboration";

type Change = { table: string; id: string };

const BATCH_MS = 250;
const MAX_RETRY_MS = 30_000;

/**
 * Subscribes to the workspace's private Realtime channel. Notifications carry
 * only which record changed; `onChanges` re-reads them through the API.
 * Reconnects with backoff and a fresh token; calls `onResync` after a
 * reconnect, since messages sent while disconnected are not replayed.
 */
export function useRealtimeSync(workspaceId: string | undefined, onChanges: (changes: Change[]) => void, onResync: () => void) {
  const handlers = useRef({ onChanges, onResync });
  handlers.current = { onChanges, onResync };

  useEffect(() => {
    if (!workspaceId) return;
    const client = getRealtimeClient();
    let disposed = false;
    let channel: ReturnType<typeof client.channel> | undefined;
    let tokenTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let hadFailure = false;
    const pending = new Map<string, Change>();

    const flush = () => {
      batchTimer = undefined;
      const changes = [...pending.values()];
      pending.clear();
      if (changes.length) handlers.current.onChanges(changes);
    };

    async function authorize() {
      const { accessToken, expiresAt } = await api<RealtimeToken>("/realtime/token");
      await client.realtime.setAuth(accessToken);
      clearTimeout(tokenTimer);
      // Refresh a minute before expiry; Realtime re-checks channel access on new tokens.
      const refreshIn = Math.max(new Date(expiresAt).getTime() - Date.now() - 60_000, 30_000);
      tokenTimer = setTimeout(() => void authorize().catch(scheduleRetry), refreshIn);
    }

    function scheduleRetry() {
      if (disposed) return;
      hadFailure = true;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void connect(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
    }

    async function connect() {
      if (disposed) return;
      try {
        await authorize();
      } catch {
        scheduleRetry();
        return;
      }
      if (channel) await client.removeChannel(channel);
      if (disposed) return;
      channel = client
        .channel(workspaceTopic(workspaceId!), { config: { private: true } })
        .on("broadcast", { event: "change" }, ({ payload }) => {
          const change = payload as RealtimeChange;
          if (change.workspaceId !== workspaceId) return;
          pending.set(`${change.table}:${change.recordId}`, { table: change.table, id: change.recordId });
          batchTimer ??= setTimeout(flush, BATCH_MS);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            retryDelay = 1000;
            if (hadFailure) {
              hadFailure = false;
              handlers.current.onResync();
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            scheduleRetry();
          }
        });
    }

    void connect();
    return () => {
      disposed = true;
      clearTimeout(tokenTimer);
      clearTimeout(retryTimer);
      clearTimeout(batchTimer);
      if (channel) void client.removeChannel(channel);
    };
  }, [workspaceId]);
}

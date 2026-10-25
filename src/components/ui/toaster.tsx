"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = { success: 4000, error: 8000 };

/** Lightweight, accessible notifications (polite for success, assertive for errors). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (variant: ToastVariant, title: string, description?: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, title, description, variant }]);
      setTimeout(() => dismiss(id), DURATION_MS[variant]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (t, d) => show("success", t, d), error: (t, d) => show("error", t, d) }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        <div aria-live="polite" className="contents">
          {toasts.filter((t) => t.variant === "success").map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
        <div aria-live="assertive" className="contents">
          {toasts.filter((t) => t.variant === "error").map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const Icon = toast.variant === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card p-3 text-sm shadow-lg",
        toast.variant === "error" && "border-destructive/40",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", toast.variant === "success" ? "text-success" : "text-destructive")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-muted-foreground">{toast.description}</p>}
      </div>
      <button type="button" onClick={() => onDismiss(toast.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Dismiss notification">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

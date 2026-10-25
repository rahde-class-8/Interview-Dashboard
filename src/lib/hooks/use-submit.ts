"use client";

import { useCallback, useState } from "react";

import { ApiClientError, errorMessage } from "@/lib/api/client";
import { useToast } from "@/components/ui/toaster";

/**
 * Runs an async mutation with pending state, a success toast and error capture.
 * Returns `error` (message) and `fieldErrors` (server validation details by path)
 * for the form to display; the user retries by submitting again.
 */
export function useSubmit() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async <T,>(operation: () => Promise<T>, options: { success?: string; errorToast?: boolean } = {}): Promise<T | undefined> => {
      setPending(true);
      setError(undefined);
      setFieldErrors({});
      try {
        const result = await operation();
        if (options.success) toast.success(options.success);
        return result;
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        if (caught instanceof ApiClientError) setFieldErrors(caught.fieldErrors());
        if (options.errorToast) toast.error(message);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [toast],
  );

  const reset = useCallback(() => {
    setError(undefined);
    setFieldErrors({});
  }, []);

  return { run, pending, error, fieldErrors, reset };
}

/** For one-click actions (toggles, deletes): returns a runner that toasts on failure. */
export function useMutation() {
  const toast = useToast();
  return useCallback(
    async <T,>(operation: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await operation();
        if (success) toast.success(success);
        return result;
      } catch (caught) {
        toast.error(errorMessage(caught));
        return undefined;
      }
    },
    [toast],
  );
}

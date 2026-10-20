"use client";

import { useEffect, useState } from "react";

/**
 * Creates a blob: URL for a File and revokes it when the file changes
 * or the component unmounts, so preview memory is released.
 */
export function useObjectUrl(file: File | undefined) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}

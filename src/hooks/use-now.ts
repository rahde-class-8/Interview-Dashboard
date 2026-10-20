"use client";

import { useState } from "react";

/**
 * A stable "now" captured when the component mounts. Keeps derived values
 * (upcoming, overdue) consistent across a render without ticking.
 */
export function useNow() {
  const [now] = useState(() => new Date());
  return now;
}

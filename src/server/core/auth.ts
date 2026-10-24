import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "./supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * The authenticated user for this request, verified with the Auth server
 * (`getUser`, never the unverified cookie session). Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    displayName: profile?.display_name ?? user.email?.split("@")[0] ?? "Account",
  };
});

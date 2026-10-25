import "server-only";

import type { PersonRef } from "@/shared/contracts/collaboration";

type ProfileEmbed = { id: string; display_name: string } | null;

/** Embedded profiles are null when RLS hides them (the person no longer shares a workspace). */
export function toPerson(profile: ProfileEmbed): PersonRef | null {
  return profile ? { id: profile.id, displayName: profile.display_name } : null;
}

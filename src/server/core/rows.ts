import "server-only";

import type { Database } from "./database.types";

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

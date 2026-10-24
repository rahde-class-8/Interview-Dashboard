/**
 * Workspace isolation through the real Supabase HTTP API (PostgREST + Auth),
 * using real user sessions. Requires local Supabase (`npm run supabase:start`)
 * and `.env.local` (`npm run env:local`).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const configured = Boolean(url && publishableKey && secretKey && /127\.0\.0\.1|localhost/.test(url ?? ""));

const PASSWORD = "integration2026";
const runId = Date.now().toString(36);

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

describe("RLS over HTTP", () => {
  let admin: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let anon: SupabaseClient;
  const userIds: string[] = [];
  let aliceWorkspaceId = "";
  let aliceCompanyId = "";

  beforeAll(async () => {
    if (!configured) {
      throw new Error("Local Supabase is not configured. Run `npm run supabase:start` and `npm run env:local`.");
    }
    admin = createClient(url!, secretKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const name of ["alice", "bob"]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `${name}-${runId}@example.com`,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: name },
      });
      if (error) throw error;
      userIds.push(data.user.id);
    }
    alice = await signedInClient(`alice-${runId}@example.com`);
    bob = await signedInClient(`bob-${runId}@example.com`);
    anon = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    for (const id of userIds) await admin?.auth.admin.deleteUser(id);
  });

  it("gives each new user exactly one workspace they own", async () => {
    const { data, error } = await alice.from("workspaces").select("id, owner_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].owner_id).toBe(userIds[0]);
    aliceWorkspaceId = data![0].id;
  });

  it("lets the owner create records in their workspace", async () => {
    const { data, error } = await alice
      .from("companies")
      .insert({ workspace_id: aliceWorkspaceId, name: "Northwind (fictional)" })
      .select("id")
      .single();
    expect(error).toBeNull();
    aliceCompanyId = data!.id;
  });

  it("hides another user's workspace and records", async () => {
    const workspaces = await bob.from("workspaces").select("id").eq("id", aliceWorkspaceId);
    expect(workspaces.data).toEqual([]);
    const companies = await bob.from("companies").select("id").eq("id", aliceCompanyId);
    expect(companies.data).toEqual([]);
  });

  it("rejects writes into another user's workspace", async () => {
    const insert = await bob.from("companies").insert({ workspace_id: aliceWorkspaceId, name: "Intruder" });
    expect(insert.error?.code).toBe("42501");

    const update = await bob.from("companies").update({ name: "Renamed" }).eq("id", aliceCompanyId).select("id");
    expect(update.data).toEqual([]);

    const check = await alice.from("companies").select("name").eq("id", aliceCompanyId).single();
    expect(check.data?.name).toBe("Northwind (fictional)");
  });

  it("denies anonymous access entirely", async () => {
    const { data, error } = await anon.from("companies").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("never exposes invitation token hashes", async () => {
    const { error } = await alice.from("workspace_invitations").select("token_hash");
    expect(error?.code).toBe("42501");
  });

  it("rejects unknown invitation tokens", async () => {
    const { error } = await bob.rpc("accept_invitation", { p_token: "x".repeat(43) });
    expect(error?.code).toBe("P0002");
  });

  it("does not allow clients to change their profile email", async () => {
    const { error } = await alice.from("profiles").update({ email: "spoof@example.com" }).eq("id", userIds[0]);
    expect(error?.code).toBe("42501");
  });
});

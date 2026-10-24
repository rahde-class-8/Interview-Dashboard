import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { request, type APIRequestContext } from "@playwright/test";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
export const BASE_URL = "http://localhost:3000";
const PASSWORD = "apiTests2026";

if (!URL_ || !PUBLISHABLE || !SECRET) {
  throw new Error("Local Supabase is not configured. Run `npm run supabase:start` and `npm run env:local`.");
}

export const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

let counter = 0;
const runId = Date.now().toString(36);

export interface TestUser {
  id: string;
  email: string;
  api: APIRequestContext;
  workspaceId: string;
}

/** Signs in through @supabase/ssr so the cookies are exactly what the app issues. */
async function sessionCookieHeader(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const client = createServerClient(URL_, PUBLISHABLE, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** Creates a confirmed user, a signed-in API client and returns their personal workspace. */
export async function createUser(label: string): Promise<TestUser> {
  const email = `api-${label}-${runId}-${counter++}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (error) throw error;
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { cookie: await sessionCookieHeader(email) } });
  const workspaces = await (await api.get("/api/v1/workspaces")).json();
  return { id: data.user.id, email, api, workspaceId: workspaces.data[0].id };
}

/** Adds an existing user to a workspace with a role (test setup via the service role). */
export async function addMember(workspaceId: string, userId: string, role: "editor" | "commenter" | "viewer") {
  const { error } = await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: userId, role });
  if (error) throw error;
}

export async function deleteUsers(users: TestUser[]) {
  for (const user of users) {
    await user.api.dispose();
    await admin.auth.admin.deleteUser(user.id);
  }
}

export const ws = (user: TestUser, path = "") => `/api/v1/workspaces/${user.workspaceId}${path}`;

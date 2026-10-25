import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, request, test } from "@playwright/test";

import { BASE_URL, addMember, createUser, deleteUsers, type TestUser } from "./helpers";

/**
 * Phase 8 security suite. Endpoint-by-endpoint authorization matrix (every
 * route under /api/v1 must be listed; a guard test fails otherwise), plus
 * credential-exposure checks on the served application.
 *
 * Detailed behavior (uploads, invitations, roles, Storage) is covered in the
 * feature specs; this file proves the boundaries hold for every route.
 */

type Role = "viewer" | "commenter" | "editor" | "owner";
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
interface Route {
  method: Method;
  /** Path under /api/v1/workspaces/{ws}; `:x` placeholders are filled with real ids. */
  path: string;
  /** Minimum role that passes the authorization check. */
  min: Role;
}

const W = (method: Method, path: string, min: Role): Route => ({ method, path, min });

// Workspace-scoped routes and the minimum role each requires (see API.md).
const MATRIX: Route[] = [
  W("GET", "", "viewer"),
  W("PATCH", "", "owner"),
  W("DELETE", "", "owner"),
  W("GET", "/activity", "viewer"),
  W("GET", "/members", "viewer"),
  W("PATCH", "/members/:owner", "owner"),
  W("DELETE", "/members/:owner", "owner"),
  W("GET", "/invitations", "owner"),
  W("POST", "/invitations", "owner"),
  W("DELETE", "/invitations/:invitation", "owner"),
  ...(["companies", "recruiters", "opportunities", "calls", "interviews", "preparation-tasks", "questions", "star-stories", "follow-ups", "notes"] as const).flatMap(
    (r) => [W("GET", `/${r}`, "viewer"), W("POST", `/${r}`, "editor"), W("GET", `/${r}/:${r}`, "viewer"), W("PATCH", `/${r}/:${r}`, "editor"), W("DELETE", `/${r}/:${r}`, "editor")],
  ),
  W("PUT", "/opportunities/:opportunities/stage", "editor"),
  W("GET", "/calls/:calls/recordings", "viewer"),
  W("POST", "/calls/:calls/recordings", "editor"),
  W("GET", "/recordings", "viewer"),
  W("GET", "/recordings/:recording", "viewer"),
  W("PATCH", "/recordings/:recording", "editor"),
  W("DELETE", "/recordings/:recording", "editor"),
  W("POST", "/recordings/:recording/upload-url", "editor"),
  W("POST", "/recordings/:recording/complete", "editor"),
  W("GET", "/recordings/:recording/playback-url", "editor"),
  W("GET", "/notes/:notes/comments", "viewer"),
  W("POST", "/notes/:notes/comments", "commenter"),
  W("GET", "/comments", "viewer"),
  W("PATCH", "/comments/:comment", "commenter"),
  W("DELETE", "/comments/:comment", "commenter"),
];

// Account-level routes (any signed-in user) and the internal job (secret, not sessions).
const ACCOUNT_ROUTES: { method: Method; path: string }[] = [
  { method: "GET", path: "/me" },
  { method: "PATCH", path: "/me" },
  { method: "GET", path: "/workspaces" },
  { method: "POST", path: "/workspaces" },
  { method: "GET", path: "/realtime/token" },
  { method: "POST", path: "/invitations/preview" },
  { method: "POST", path: "/invitations/accept" },
];

const RANK: Record<Role, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

let owner: TestUser;
let viewer: TestUser;
let commenter: TestUser;
let outsider: TestUser;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  test.setTimeout(60_000);
  [owner, viewer, commenter, outsider] = await Promise.all([
    createUser("sec-owner"),
    createUser("sec-viewer"),
    createUser("sec-commenter"),
    createUser("sec-outsider"),
  ]);
  await addMember(owner.workspaceId, viewer.id, "viewer");
  await addMember(owner.workspaceId, commenter.id, "commenter");
  ids.owner = owner.id;

  const post = async (path: string, data: object) => {
    const res = await owner.api.post(`/api/v1/workspaces/${owner.workspaceId}${path}`, { data });
    expect(res.status(), `${path}: ${await res.text()}`).toBe(201);
    return res.json();
  };
  const company = await post("/companies", { name: "Fictional Security Co" });
  ids.companies = company.id;
  ids.recruiters = (await post("/recruiters", { name: "Fictional Recruiter", companyId: company.id })).id;
  const call = await post("/calls", {
    opportunity: { create: { company: { id: company.id }, title: "Security Engineer", workMode: "remote", employmentType: "full_time" } },
    recruiter: { id: ids.recruiters },
    callAt: "2026-10-20T15:00:00Z",
    durationMinutes: 30,
    interestLevel: 7,
    followUp: { title: "Fictional follow-up", dueDate: "2026-11-01" },
  });
  ids.calls = call.id;
  ids.opportunities = call.opportunity.id;
  ids["follow-ups"] = call.followUp.id;
  ids.interviews = (await post("/interviews", { opportunityId: ids.opportunities, title: "Tech", stage: "technical", scheduledAt: "2026-11-05T15:00:00Z", durationMinutes: 60, format: "video" })).id;
  ids["preparation-tasks"] = (await post("/preparation-tasks", { opportunityId: ids.opportunities, title: "Review IAM", category: "technical" })).id;
  ids.questions = (await post("/questions", { type: "technical", topic: "AWS", difficulty: "easy", question: "What is IAM?" })).id;
  ids["star-stories"] = (await post("/star-stories", { title: "Fictional incident" })).id;
  ids.notes = (await post("/notes", { title: "Fictional note" })).id;
  ids.comment = (await post(`/notes/${ids.notes}/comments`, { body: "Owner comment" })).id;
  ids.recording = (await post(`/calls/${ids.calls}/recordings`, { fileName: "s.mp3", fileSize: 1000, consentConfirmed: true })).recording.id;
  ids.invitation = (await post("/invitations", { email: "sec-invitee@example.com", role: "viewer" })).invitation.id;
});
test.afterAll(async () => deleteUsers([owner, viewer, commenter, outsider]));

const fill = (path: string) => path.replace(/:([a-z-]+)/g, (_, key: string) => ids[key] ?? key);
const url = (workspaceId: string, route: Route) => `/api/v1/workspaces/${workspaceId}${fill(route.path)}`;

async function call(user: TestUser | null, method: Method, path: string) {
  const ctx = user?.api ?? (await request.newContext({ baseURL: BASE_URL }));
  const options = method === "GET" || method === "DELETE" ? {} : { data: {} };
  const res = await ctx.fetch(path, { method, ...options });
  if (!user) await ctx.dispose();
  return res;
}

test("every API route is covered by this matrix", () => {
  const root = join(process.cwd(), "src/app/api/v1");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") {
        const route = "/" + relative(root, dir).replace(/\\/g, "/");
        for (const [, method] of readFileSync(full, "utf8").matchAll(/export const (GET|POST|PATCH|PUT|DELETE)\b/g)) {
          found.push(`${method} ${route.replace(/\[[^\]]+\]/g, ":id")}`);
        }
      }
    }
  };
  walk(root);
  const listed = new Set([
    ...MATRIX.map((r) => `${r.method} /workspaces/:id${r.path.replace(/:[a-z-]+/g, ":id")}`),
    ...ACCOUNT_ROUTES.map((r) => `${r.method} ${r.path}`),
  ]);
  expect(found.length).toBe(MATRIX.length + ACCOUNT_ROUTES.length);
  expect(found.filter((r) => !listed.has(r))).toEqual([]);
});

test("unauthenticated requests are rejected with 401 on every route", async () => {
  for (const route of MATRIX) {
    const res = await call(null, route.method, url(owner.workspaceId, route));
    expect(res.status(), `${route.method} ${route.path}`).toBe(401);
  }
  for (const route of ACCOUNT_ROUTES) {
    const res = await call(null, route.method, `/api/v1${route.path}`);
    expect(res.status(), `${route.method} ${route.path}`).toBe(401);
  }
});

test("users cannot access another workspace through any route (404, no existence leak)", async () => {
  for (const route of MATRIX) {
    const res = await call(outsider, route.method, url(owner.workspaceId, route));
    expect(res.status(), `${route.method} ${route.path}`).toBe(404);
  }
  // Ids from another workspace are not found inside the outsider's own workspace either.
  for (const route of MATRIX.filter((r) => r.method === "GET" && r.path.includes(":"))) {
    const res = await call(outsider, "GET", url(outsider.workspaceId, route));
    expect(res.status(), `own workspace ${route.path}`).toBe(404);
  }
});

for (const [label, getUser, role] of [
  ["viewers", () => viewer, "viewer"],
  ["commenters", () => commenter, "commenter"],
] as const) {
  test(`${label} are denied every route above their role and can read the rest`, async () => {
    const user = getUser();
    for (const route of MATRIX) {
      const res = await call(user, route.method, url(owner.workspaceId, route));
      const where = `${route.method} ${route.path}`;
      if (RANK[role] < RANK[route.min]) expect(res.status(), where).toBe(403);
      else if (route.method === "GET") expect(res.status(), where).toBe(200);
    }
  });
}

test("commenters cannot upload recordings or edit records, but can comment", async () => {
  const ws = `/api/v1/workspaces/${owner.workspaceId}`;
  const upload = await commenter.api.post(`${ws}/calls/${ids.calls}/recordings`, { data: { fileName: "x.mp3", fileSize: 100, consentConfirmed: true } });
  expect(upload.status()).toBe(403);
  expect((await commenter.api.patch(`${ws}/opportunities/${ids.opportunities}`, { data: { title: "Hijacked" } })).status()).toBe(403);
  expect((await commenter.api.post(`${ws}/notes/${ids.notes}/comments`, { data: { body: "Allowed" } })).status()).toBe(201);
  // …but not edit or delete the owner's comment.
  expect((await commenter.api.patch(`${ws}/comments/${ids.comment}`, { data: { body: "Rewritten" } })).status()).toBe(403);
  expect((await commenter.api.delete(`${ws}/comments/${ids.comment}`)).status()).toBe(403);
  const opp = await (await owner.api.get(`${ws}/opportunities/${ids.opportunities}`)).json();
  expect(opp.title).toBe("Security Engineer");
});

test("API responses never contain secrets or storage internals", async () => {
  const ws = `/api/v1/workspaces/${owner.workspaceId}`;
  const bodies = await Promise.all(
    ["/api/v1/me", "/api/v1/workspaces", `${ws}/recordings`, `${ws}/recordings/${ids.recording}`, `${ws}/invitations?status=all`, `${ws}/members`].map(
      async (path) => (await owner.api.get(path)).text(),
    ),
  );
  const all = bodies.join("\n");
  expect(all).not.toContain(process.env.SUPABASE_SECRET_KEY!);
  expect(all).not.toMatch(/token_?hash|storage_?path|sb_secret_|service_role/i);
  expect(all).not.toContain(`${owner.workspaceId}/${ids.calls}/`); // object keys stay server-side
});

test("the served application never exposes privileged credentials", async ({ request: req }) => {
  const secrets = [process.env.SUPABASE_SECRET_KEY!, process.env.CRON_SECRET!].filter(Boolean);
  expect(secrets.length).toBe(2);
  const pages = ["/login", "/register", "/forgot-password"];
  const scripts = new Set<string>();
  for (const page of pages) {
    const html = await (await req.get(page)).text();
    for (const secret of secrets) expect(html).not.toContain(secret);
    for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(src);
  }
  // Every JavaScript chunk of the build, not only those the public pages reference.
  const chunks = join(process.cwd(), ".next/static/chunks");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : n.endsWith(".js") ? [join(dir, n)] : []));
  const files = walk(chunks);
  expect(files.length).toBeGreaterThan(5);
  for (const file of files) {
    const js = readFileSync(file, "utf8");
    for (const secret of secrets) expect(js.includes(secret), file).toBe(false);
    // A service-role JWT would contain the base64 of "service_role".
    expect(/c2VydmljZV9yb2xl/.test(js), file).toBe(false);
    expect(js.includes("SUPABASE_SECRET_KEY") || js.includes("CRON_SECRET"), file).toBe(false);
  }
  for (const src of scripts) {
    const js = await (await req.get(src)).text();
    for (const secret of secrets) expect(js).not.toContain(secret);
  }
});

test("security headers are set on pages and API responses", async ({ request: req }) => {
  for (const path of ["/login", "/api/v1/me"]) {
    const headers = (await req.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"], path).toContain("microphone=()");
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
  expect((await req.get("/api/v1/me")).headers()["cache-control"]).toBe("no-store");
});

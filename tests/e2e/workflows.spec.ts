import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Phase 7: frontend workflows persist real data through the API.
 * Each test signs in fresh users created with the service role (fictional data only).
 */

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runId = Date.now().toString(36);
const PASSWORD = "workflowPass2026";
const created: string[] = [];
let counter = 0;

// Fictional audio fixture: a valid MP3 signature followed by padding.
const MP3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(4096, 0x55)]);

async function newUser(name: string) {
  const email = `wf-${runId}-${counter++}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email, name };
}

async function signIn(page: Page, email: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signedInPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  return page;
}

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

test("opportunity → recruiter call → recording → preparation, all persisted", async ({ page }) => {
  test.setTimeout(120_000);
  const user = await newUser("Riley Workflow");
  await signIn(page, user.email);
  await expect(page.getByRole("heading", { name: "Welcome back, Riley" })).toBeVisible();

  let callUrl = "";
  await test.step("create an opportunity", async () => {
    await page.goto("/opportunities");
    await page.getByRole("button", { name: "New opportunity", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Company").fill("Fictional Freightworks");
    await dialog.getByLabel("Job title").fill("Platform Engineer");
    await dialog.getByRole("button", { name: "Create opportunity" }).click();
    await expect(page.getByText("Opportunity created")).toBeVisible();
    await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Platform Engineer" })).toBeVisible();
  });

  await test.step("move it through the pipeline", async () => {
    await page.getByRole("button", { name: /Technical Interview/ }).click();
    await expect(page.getByRole("button", { name: /Technical Interview/ })).toHaveAttribute("aria-current", "step");
    await page.reload();
    await expect(page.getByRole("button", { name: /Technical Interview/ })).toHaveAttribute("aria-current", "step");
  });

  await test.step("log a recruiter call with a new recruiter and a follow-up", async () => {
    await page.getByRole("link", { name: "Log call" }).click();
    await expect(page.getByRole("heading", { name: "New recruiter call" })).toBeVisible();
    await page.getByLabel("Recruiter name").fill("Casey Fictional");
    await page.getByLabel("Email").fill("casey@example.com");
    await page.getByRole("tab", { name: "Interview intelligence" }).click();
    await page.getByLabel("Technical topics likely to be tested").fill("Kubernetes, Terraform");
    await page.getByRole("tab", { name: "Follow-up & notes" }).click();
    await page.getByLabel("Next action").fill("Send thank-you note");
    await page.getByLabel("Follow-up date").fill("2026-11-02");
    await page.getByLabel("Full recruiter call notes").fill("[Fictional] Team of eight, on-call one week in six.");
    await page.getByRole("button", { name: "Save call" }).click();
    await expect(page.getByText("Call logged")).toBeVisible();
    await expect(page).toHaveURL(/\/calls\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Casey Fictional · Fictional Freightworks" })).toBeVisible();
    callUrl = page.url();
  });

  await test.step("upload, verify and play an existing recording", async () => {
    await page.getByRole("tab", { name: "Recording" }).click();
    const upload = page.getByRole("button", { name: "Upload a recording" });
    await expect(upload).toBeDisabled(); // consent first
    await page.getByLabel(/Everyone in this recording agreed/).check();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "casey-call.mp3", mimeType: "audio/mpeg", buffer: MP3 });
    await expect(page.getByText("“casey-call.mp3” was uploaded and verified.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Stored privately", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Play recording" }).click();
    const audio = page.locator("audio");
    await expect(audio).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/recordings\//);
    const src = await audio.getAttribute("src");
    const fetched = await page.request.get(src!);
    expect(fetched.status()).toBe(200);
    expect(Buffer.from(await fetched.body()).equals(MP3)).toBe(true);
  });

  await test.step("an invalid file is rejected by the server", async () => {
    await page.getByLabel(/Everyone in this recording agreed/).check();
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "not-audio.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("plain text, not audio ".repeat(40)) });
    await expect(page.getByText("The file is not a valid MP3, M4A or WAV recording.").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Upload failed")).toBeVisible();
  });

  await test.step("everything is still there after a reload", async () => {
    await page.reload();
    await page.getByRole("tab", { name: "Recording" }).click();
    await expect(page.getByText("casey-call.mp3")).toBeVisible();
    await page.getByRole("tab", { name: "Notes" }).click();
    await expect(page.getByText("Send thank-you note")).toBeVisible();
    await expect(page.getByText("[Fictional] Team of eight")).toBeVisible();
  });

  await test.step("create and complete a preparation task", async () => {
    await page.goto("/preparation");
    await page.getByLabel("New preparation task").fill("Review Kubernetes networking");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added")).toBeVisible();
    await page.getByRole("checkbox", { name: "Review Kubernetes networking" }).check();
    await expect(page.getByRole("checkbox", { name: "Review Kubernetes networking" })).toBeChecked();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Review Kubernetes networking" })).toBeChecked();
  });

  await test.step("the dashboard reflects the stored data", async () => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Key metrics" })).toContainText("1");
    await page.goto("/calls");
    await expect(page.getByRole("link", { name: "Casey Fictional" }).first()).toBeVisible();
  });

  await test.step("another account cannot reach the data", async () => {
    const stranger = await newUser("Stranger");
    const context = await page.context().browser()!.newContext();
    const other = await context.newPage();
    await signIn(other, stranger.email);
    await expect(other.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
    await other.goto(callUrl);
    await expect(other.getByText("Recruiter call not found")).toBeVisible();
    await expect(other.getByText("Casey Fictional")).toHaveCount(0);
    const api = await other.request.get(callUrl.replace("/calls/", "/api/v1/workspaces/x/calls/"));
    expect(api.status()).toBe(404);
    await context.close();
  });
});

test("invite a viewer by link; roles shape the interface; changes appear live", async ({ browser }) => {
  test.setTimeout(120_000);
  const owner = await newUser("Olivia Owner");
  const viewer = await newUser("Vic Viewer");
  const ownerPage = await signedInPage(browser, owner.email);

  let inviteUrl = "";
  await test.step("the owner creates an invitation link", async () => {
    await ownerPage.goto("/shared");
    await ownerPage.getByRole("button", { name: "Invite collaborator" }).click();
    const dialog = ownerPage.getByRole("dialog");
    await dialog.getByLabel("Email").fill(viewer.email);
    await dialog.getByLabel(/^Viewer/).check();
    await dialog.getByRole("button", { name: "Create invitation" }).click();
    inviteUrl = await dialog.getByRole("textbox", { name: "Invitation link" }).inputValue();
    expect(inviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]{43}$/);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(ownerPage.locator("main").getByText(viewer.email)).toBeVisible();
  });

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await test.step("the invitee signs in through the link and accepts", async () => {
    await viewerPage.goto(inviteUrl);
    await expect(viewerPage).toHaveURL(/\/login\?next=%2Finvite%2F/);
    await viewerPage.getByLabel("Email").fill(viewer.email);
    await viewerPage.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await viewerPage.getByRole("button", { name: "Sign in" }).click();
    await expect(viewerPage.getByText(/Olivia Owner invited you to/)).toBeVisible();
    await viewerPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(viewerPage.getByText(/You're viewing the shared workspace/)).toBeVisible();
  });

  await test.step("viewers get a read-only interface", async () => {
    await expect(viewerPage.getByRole("link", { name: "New Recruiter Call" })).toHaveCount(0);
    await viewerPage.goto("/opportunities");
    await expect(viewerPage.getByRole("heading", { name: "Opportunities" })).toBeVisible();
    await expect(viewerPage.getByRole("button", { name: "New opportunity", exact: true })).toHaveCount(0);
    await viewerPage.goto("/shared");
    await expect(viewerPage.getByRole("button", { name: "Invite collaborator" })).toHaveCount(0);
    await expect(viewerPage.getByText("Vic Viewer (you)")).toBeVisible();
  });

  await test.step("a note created by the owner appears for the viewer without reloading", async () => {
    await ownerPage.reload();
    await ownerPage.getByRole("textbox", { name: "Title" }).fill("Interview game plan");
    await ownerPage.getByRole("textbox", { name: "Note" }).fill("[Fictional] Lead with the migration story.");
    await ownerPage.getByRole("button", { name: "Create note" }).click();
    await expect(ownerPage.getByText("Note created")).toBeVisible();
    await expect(viewerPage.getByRole("button", { name: /Interview game plan/ })).toBeVisible({ timeout: 15_000 });
  });

  await test.step("the owner promotes the viewer; the interface follows", async () => {
    await ownerPage.reload();
    await ownerPage.getByRole("combobox", { name: "Permission for Vic Viewer" }).click();
    await ownerPage.getByRole("option", { name: "Commenter" }).click();
    await expect(ownerPage.getByText("Vic Viewer is now commenter")).toBeVisible();
    await viewerPage.reload();
    await viewerPage.getByRole("button", { name: /Interview game plan/ }).click();
    await viewerPage.getByLabel("Add a comment").fill("Also mention the cost savings.");
    await viewerPage.getByRole("button", { name: "Comment" }).click();
    await expect(viewerPage.getByText("Also mention the cost savings.")).toBeVisible();
    await expect(ownerPage.getByText("Also mention the cost savings.")).toBeVisible({ timeout: 15_000 });
  });

  await viewerContext.close();
  await ownerPage.context().close();
});

test("a stale note save asks the user to review instead of overwriting", async ({ browser }) => {
  test.setTimeout(90_000);
  const owner = await newUser("Nora Owner");
  const editor = await newUser("Eli Editor");
  const ownerPage = await signedInPage(browser, owner.email);
  const workspaces = await (await ownerPage.request.get("/api/v1/workspaces")).json();
  const ws = `/api/v1/workspaces/${workspaces.data[0].id}`;

  // Set up through the API: invite + accept, and a note.
  const invite = await (await ownerPage.request.post(`${ws}/invitations`, { data: { email: editor.email, role: "editor" } })).json();
  const editorPage = await signedInPage(browser, editor.email);
  expect((await editorPage.request.post("/api/v1/invitations/accept", { data: { token: invite.token } })).status()).toBe(200);
  const note = await (await ownerPage.request.post(`${ws}/notes`, { data: { title: "Offer negotiation", body: "Draft one" } })).json();

  await editorPage.evaluate((id) => window.localStorage.setItem("activeWorkspaceId", id), workspaces.data[0].id);
  await editorPage.goto("/shared");
  await editorPage.getByRole("button", { name: /Offer negotiation/ }).click();
  await editorPage.getByRole("textbox", { name: "Note" }).fill("Editor's rewrite");

  // The owner saves first.
  const updated = await ownerPage.request.patch(`${ws}/notes/${note.id}`, { data: { body: "Owner's version", version: 1 } });
  expect((await updated.json()).version).toBe(2);
  await expect(editorPage.getByText("Nora Owner saved a newer version of this note.")).toBeVisible({ timeout: 15_000 });

  await editorPage.getByRole("button", { name: "Save note" }).click();
  await expect(editorPage.getByText("Nora Owner saved a newer version while you were editing.")).toBeVisible();
  await editorPage.getByRole("button", { name: "Discard mine, load theirs" }).click();
  await expect(editorPage.getByRole("textbox", { name: "Note" })).toHaveValue("Owner's version");
  const final = await (await ownerPage.request.get(`${ws}/notes/${note.id}`)).json();
  expect(final).toMatchObject({ body: "Owner's version", version: 2 });

  await editorPage.context().close();
  await ownerPage.context().close();
});

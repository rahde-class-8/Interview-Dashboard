import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { waitForEmailLink } from "./mailpit";

/**
 * Phase 8 end-to-end workflow (specification §12), step by step through the UI:
 *  1 register and log in · 2 create an opportunity · 3 add a recruiter call ·
 *  4 save structured notes · 5 upload an existing audio file · 6 play it ·
 *  7 create preparation tasks · 8 log out · 9 log back in · 10 verify persistence ·
 *  11 confirm an unauthorized account cannot access it.
 * All data is fictional.
 */

const runId = Date.now().toString(36);
const email = `full-${runId}@example.com`;
const strangerEmail = `full-stranger-${runId}@example.com`;
const password = "fullFlow2026";
const MP3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(8192, 0x33)]);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test.afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data.users.filter((u) => u.email === email || u.email === strangerEmail)) {
    await admin.auth.admin.deleteUser(user.id);
  }
});

async function logIn(page: Page, address: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
}

async function logOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=1/);
}

test("register → opportunity → call → notes → recording → prep → log out/in → persisted → private", async ({ page, browser }) => {
  test.setTimeout(180_000);
  let opportunityUrl = "";
  let callUrl = "";

  await test.step("1. register and log in", async () => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Jamie Fulltest");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("confirmation link");
    await page.goto(await waitForEmailLink(email, "Confirm your", "/auth/confirm"));
    await expect(page.getByRole("heading", { name: "Welcome back, Jamie" })).toBeVisible();
    await logOut(page);
    await logIn(page, email);
  });

  await test.step("2. create an opportunity", async () => {
    await page.goto("/opportunities");
    await expect(page.getByText("No opportunities yet").or(page.getByText(/No opportunities/))).toBeVisible();
    await page.getByRole("button", { name: "New opportunity", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Company").fill("Fictional Northwind Cloud");
    await dialog.getByLabel("Job title").fill("Senior DevOps Engineer");
    await dialog.getByLabel("Location").fill("Remote (US)");
    await dialog.getByLabel("Minimum").fill("150000");
    await dialog.getByLabel("Maximum").fill("180000");
    await dialog.getByRole("button", { name: "Create opportunity" }).click();
    await expect(page.getByRole("heading", { name: "Senior DevOps Engineer" })).toBeVisible();
    opportunityUrl = page.url();
  });

  await test.step("3–4. add a recruiter call with structured notes", async () => {
    await page.getByRole("link", { name: "Log call" }).click();
    await page.getByLabel("Recruiter name").fill("Morgan Fictional");
    await page.getByLabel("Email").fill("morgan@example.com");
    await page.getByLabel("Agency").fill("Fictional Talent Partners");
    await page.getByLabel("Minutes").fill("40");
    await page.getByRole("tab", { name: "Requirements" }).click();
    await page.getByLabel("Hiring manager priorities").fill("Terraform ownership\nIncident leadership");
    await page.getByRole("tab", { name: "Interview intelligence" }).click();
    await page.getByLabel("Interview process and stages").fill("Recruiter screen\nTechnical deep dive\nHiring manager");
    await page.getByLabel("Recruiter advice").fill("Bring a concrete migration story.");
    await page.getByLabel("Technical topics likely to be tested").fill("Kubernetes, Terraform, AWS networking");
    await page.getByLabel("Behavioral themes").fill("Ownership");
    await page.getByLabel("Red flags").fill("Team was reorganized recently");
    await page.getByRole("button", { name: "Add question" }).click();
    await page.getByRole("textbox", { name: "Question 1" }).fill("How large is the platform team?");
    await page.getByLabel("Recruiter answer").fill("Seven engineers.");
    await page.getByRole("tab", { name: "Follow-up & notes" }).click();
    await page.getByLabel("Next action").fill("Send thank-you email");
    await page.getByLabel("Follow-up date").fill("2026-11-03");
    await page.getByLabel("Full recruiter call notes").fill("[Fictional] Strong focus on platform reliability and cost.");
    await page.getByRole("button", { name: "Save call" }).click();
    await expect(page.getByRole("heading", { name: "Morgan Fictional · Fictional Northwind Cloud" })).toBeVisible();
    callUrl = page.url();
  });

  await test.step("5–6. upload an existing audio file and play it", async () => {
    await page.getByRole("tab", { name: "Recording" }).click();
    await page.getByLabel(/Everyone in this recording agreed/).check();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "morgan-call.mp3", mimeType: "audio/mpeg", buffer: MP3 });
    await expect(page.getByText("“morgan-call.mp3” was uploaded and verified.")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Play recording" }).click();
    const src = await page.locator("audio").getAttribute("src");
    expect(src).toMatch(/\/storage\/v1\/object\/sign\/recordings\//);
    const audio = await page.request.get(src!);
    expect(audio.status()).toBe(200);
    expect(Buffer.from(await audio.body()).equals(MP3)).toBe(true);
  });

  await test.step("7. create interview preparation tasks", async () => {
    await page.goto("/preparation");
    for (const title of ["Review Terraform state locking", "Prepare the migration STAR story"]) {
      await page.getByLabel("New preparation task").fill(title);
      await page.getByRole("button", { name: "Add task" }).click();
      await expect(page.getByRole("checkbox", { name: title })).toBeVisible();
    }
    await page.getByRole("checkbox", { name: "Review Terraform state locking" }).check();
  });

  await test.step("8. log out", async () => {
    await logOut(page);
    await page.goto(callUrl);
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  await test.step("9. log back in", async () => {
    await logIn(page, email);
  });

  await test.step("10. verify the data persisted", async () => {
    await page.goto(opportunityUrl);
    await expect(page.getByRole("heading", { name: "Senior DevOps Engineer" })).toBeVisible();
    await expect(page.getByText("Fictional Northwind Cloud · Remote (US)")).toBeVisible();

    await page.goto(callUrl);
    await expect(page.getByRole("heading", { name: "Morgan Fictional · Fictional Northwind Cloud" })).toBeVisible();
    await page.getByRole("tab", { name: "Interview intelligence" }).click();
    for (const text of ["Bring a concrete migration story.", "Team was reorganized recently", "How large is the platform team?", "Seven engineers."]) {
      await expect(page.getByText(text)).toBeVisible();
    }
    await page.getByRole("tab", { name: "Notes & follow-up" }).click();
    await expect(page.getByText("Send thank-you email")).toBeVisible();
    await expect(page.getByText("[Fictional] Strong focus on platform reliability and cost.")).toBeVisible();
    await page.getByRole("tab", { name: "Recording" }).click();
    await expect(page.getByText("morgan-call.mp3")).toBeVisible();
    await page.getByRole("button", { name: "Play recording" }).click();
    await expect(page.locator("audio")).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/recordings\//);

    await page.goto("/preparation");
    await expect(page.getByRole("checkbox", { name: "Review Terraform state locking" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Prepare the migration STAR story" })).not.toBeChecked();
  });

  await test.step("11. an unauthorized account cannot access it", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: strangerEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Stranger Fictional" },
    });
    expect(error).toBeNull();
    const context = await browser.newContext();
    const stranger = await context.newPage();
    await logIn(stranger, strangerEmail);

    await stranger.goto(callUrl);
    await expect(stranger.getByText("Recruiter call not found")).toBeVisible();
    await stranger.goto(opportunityUrl);
    await expect(stranger.getByText("Opportunity not found")).toBeVisible();
    await stranger.goto("/calls");
    await expect(stranger.getByText("Morgan Fictional")).toHaveCount(0);

    // Directly against the API, with the owner's real ids.
    const ownerWorkspace = (await (await page.request.get("/api/v1/workspaces")).json()).data[0].id as string;
    const callId = callUrl.split("/").pop()!;
    const recordings = (await (await page.request.get(`/api/v1/workspaces/${ownerWorkspace}/recordings`)).json()).data;
    for (const path of [
      `/api/v1/workspaces/${ownerWorkspace}`,
      `/api/v1/workspaces/${ownerWorkspace}/calls/${callId}`,
      `/api/v1/workspaces/${ownerWorkspace}/recordings/${recordings[0].id}/playback-url`,
    ]) {
      expect((await stranger.request.get(path)).status(), path).toBe(404);
    }
    await context.close();
  });
});

import { expect, test, type Page } from "@playwright/test";

import { waitForEmailLink } from "./mailpit";

const runId = Date.now().toString(36);
const email = `e2e-${runId}@example.com`;
const password = "firstPass2026";
const newPassword = "secondPass2026";

async function signIn(page: Page, pw: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=1/);
  await expect(page.getByText("You have been signed out.")).toBeVisible();
}

test("protected pages redirect to sign-in and keep the destination", async ({ page }) => {
  await page.goto("/calls?tab=x");
  await expect(page).toHaveURL(/\/login\?next=%2Fcalls%3Ftab%3Dx$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("invalid email links are rejected", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email");
  await expect(page).toHaveURL(/\/login\?error=link_invalid/);
  await expect(page.locator("main").getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
});

test("register, confirm, sign out, sign in, reset password", async ({ page }) => {
  await test.step("register validates input", async () => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("E2E Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("#register-password-error")).toHaveText("Use at least 8 characters.");
    await expect(page.getByLabel("Email")).toHaveValue(email);
  });

  await test.step("register succeeds with a neutral message", async () => {
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("we've sent a confirmation link");
  });

  await test.step("sign-in is blocked until the email is confirmed", async () => {
    await signIn(page, password);
    await expect(page.locator("main").getByRole("alert")).toContainText("Confirm your email address first");
  });

  await test.step("the confirmation link signs the user in", async () => {
    const link = await waitForEmailLink(email, "Confirm your", "/auth/confirm");
    await page.goto(link);
    await expect(page).toHaveURL("http://localhost:3000/");
    const authCookies = (await page.context().cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(authCookies.length).toBeGreaterThan(0);
    for (const cookie of authCookies) {
      expect(cookie.httpOnly, `${cookie.name} is HttpOnly`).toBe(true);
      expect(cookie.sameSite).toBe("Lax");
      expect(cookie.secure, `${cookie.name} is Secure in production builds`).toBe(true);
    }
    expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menu")).toContainText("E2E Tester");
    await expect(page.getByRole("menu")).toContainText(email);
    await page.keyboard.press("Escape");
  });

  await test.step("signed-in users are sent away from guest pages", async () => {
    await page.goto("/login");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  await test.step("sign out ends the session", async () => {
    await signOut(page);
    await page.goto("/opportunities");
    await expect(page).toHaveURL(/\/login\?next=%2Fopportunities/);
  });

  await test.step("wrong password shows a generic error", async () => {
    await signIn(page, "wrongPass2026");
    await expect(page.locator("main").getByRole("alert")).toHaveText("Invalid email or password.");
    await expect(page.getByLabel("Email")).toHaveValue(email);
  });

  await test.step("sign in returns to the requested page", async () => {
    await signIn(page, password, "/login?next=%2Fopportunities");
    await expect(page).toHaveURL("http://localhost:3000/opportunities");
    await signOut(page);
  });

  await test.step("open redirects are ignored", async () => {
    await signIn(page, password, "/login?next=https%3A%2F%2Fevil.example.com");
    await expect(page).toHaveURL("http://localhost:3000/");
    await signOut(page);
  });

  await test.step("password reset via email link", async () => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("If an account exists");

    const link = await waitForEmailLink(email, "Reset your", "/auth/confirm");
    await page.goto(link);
    await expect(page).toHaveURL("http://localhost:3000/reset-password");
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL("http://localhost:3000/?password_updated=1");
    await signOut(page);
  });

  await test.step("only the new password works", async () => {
    await signIn(page, password);
    await expect(page.locator("main").getByRole("alert")).toHaveText("Invalid email or password.");
    await signIn(page, newPassword);
    await expect(page).toHaveURL("http://localhost:3000/");
  });
});

test("password reset requests do not reveal unknown accounts", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${runId}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("If an account exists");
});

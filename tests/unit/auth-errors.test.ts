import { describe, expect, it } from "vitest";

import { authErrorMessage } from "@/server/auth/errors";

describe("authErrorMessage", () => {
  it("never reveals whether an account exists at sign-in", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 }, "sign_in")).toBe("Invalid email or password.");
    expect(authErrorMessage({ code: "user_not_found", status: 400 }, "sign_in")).toBe("Invalid email or password.");
  });

  it("explains unconfirmed email at sign-in", () => {
    expect(authErrorMessage({ code: "email_not_confirmed" }, "sign_in")).toMatch(/Confirm your email/);
  });

  it("maps rate limits for every context", () => {
    for (const ctx of ["sign_in", "sign_up", "reset", "update_password"] as const) {
      expect(authErrorMessage({ status: 429 }, ctx)).toMatch(/Too many attempts/);
    }
  });

  it("does not pass through raw provider messages", () => {
    const message = authErrorMessage({ code: "unexpected_failure", message: "db connection string postgres://..." }, "sign_up");
    expect(message).not.toMatch(/postgres/);
  });
});

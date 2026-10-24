import { describe, expect, it } from "vitest";

import {
  newPasswordSchema,
  passwordSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
} from "@/shared/contracts/auth";

describe("passwordSchema", () => {
  it("accepts 8+ characters with a letter and a digit", () => {
    expect(passwordSchema.safeParse("interview2026").success).toBe(true);
  });
  it.each([
    ["short1", "Use at least 8 characters."],
    ["onlyletters", "Include at least one number."],
    ["12345678", "Include at least one letter."],
    [`a1${"x".repeat(71)}`, "Use at most 72 characters."],
  ])("rejects %j", (value, message) => {
    const result = passwordSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe("signUpSchema", () => {
  const valid = { displayName: "  Jamie Rivera ", email: " Jamie@Example.COM ", password: "interview2026", confirmPassword: "interview2026" };

  it("normalizes name and email", () => {
    const result = signUpSchema.parse(valid);
    expect(result.displayName).toBe("Jamie Rivera");
    expect(result.email).toBe("jamie@example.com");
  });

  it("requires matching passwords", () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: "different2026" });
    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!)).toEqual({ confirmPassword: "Passwords do not match." });
  });

  it("reports one message per field", () => {
    const result = signUpSchema.safeParse({ displayName: "", email: "nope", password: "x", confirmPassword: "" });
    const errors = toFieldErrors(result.error!);
    expect(Object.keys(errors).sort()).toEqual(["confirmPassword", "displayName", "email", "password"]);
    expect(errors.email).toBe("Enter a valid email address.");
  });
});

describe("signInSchema", () => {
  it("does not apply password strength rules at sign-in", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true);
  });
  it("requires both fields", () => {
    const errors = toFieldErrors(signInSchema.safeParse({ email: "", password: "" }).error!);
    expect(errors).toEqual({ email: "Enter your email address.", password: "Enter your password." });
  });
});

describe("newPasswordSchema", () => {
  it("validates strength and confirmation", () => {
    expect(newPasswordSchema.safeParse({ password: "newpass2026", confirmPassword: "newpass2026" }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: "newpass2026", confirmPassword: "x" }).success).toBe(false);
  });
});

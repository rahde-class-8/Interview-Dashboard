import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Privileged credentials must never be committed. Scans every tracked and
 * untracked-but-not-ignored file (what `git add -A` would commit).
 */
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !/\.(png|jpg|jpeg|ico|gif|webp|woff2?|mp3|m4a|wav)$/i.test(f));

const read = (f: string) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return ""; // deleted in the working tree
  }
};

describe("repository secret scan", () => {
  it("never commits .env files other than .env.example", () => {
    expect(files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"))).toEqual([]);
  });

  it("contains no local secret values", () => {
    const secrets = [process.env.SUPABASE_SECRET_KEY, process.env.CRON_SECRET].filter((v): v is string => !!v && v.length > 16);
    expect(secrets.length).toBe(2);
    const leaks = files.filter((f) => secrets.some((s) => read(f).includes(s)));
    expect(leaks).toEqual([]);
  });

  it("contains no credential-shaped strings", () => {
    const patterns = [
      /sb_secret_[A-Za-z0-9_-]{10,}/, // Supabase secret keys
      /eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl/, // service-role JWTs
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /postgres(ql)?:\/\/[^:\s]+:(?!postgres@)[^@\s]{6,}@/, // DB URLs with a non-default password
    ];
    const hits = files.filter((f) => f !== "tests/integration/repository-secrets.test.ts" && patterns.some((p) => p.test(read(f))));
    expect(hits).toEqual([]);
  });

  it(".env.example leaves every server-only secret empty", () => {
    const example = read(".env.example");
    for (const key of ["SUPABASE_SECRET_KEY", "CRON_SECRET"]) {
      expect(example).toMatch(new RegExp(`^${key}=$`, "m"));
    }
  });
});

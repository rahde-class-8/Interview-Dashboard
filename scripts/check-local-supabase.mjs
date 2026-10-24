#!/usr/bin/env node
// Loads environment variables exactly as Next.js does (@next/env) and checks
// that the configured Supabase endpoint is reachable with the browser-safe key.
// Prints status codes only — never key values.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const problems = [];

if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set");
if (!key) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
for (const name of Object.keys(process.env)) {
  if (name.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE/.test(name)) {
    problems.push(`${name} looks privileged but is browser-exposed (NEXT_PUBLIC_)`);
  }
}
if (problems.length) {
  problems.forEach((p) => console.error(`✗ ${p}`));
  process.exit(1);
}

const checks = [
  ["Auth health", "/auth/v1/health"],
  ["REST API", "/rest/v1/"],
];
let failed = false;
for (const [label, path] of checks) {
  try {
    const res = await fetch(new URL(path, url), { headers: { apikey: key } });
    console.log(`${res.ok ? "✓" : "✗"} ${label}: HTTP ${res.status}`);
    failed ||= !res.ok;
  } catch (error) {
    console.error(`✗ ${label}: ${error.cause?.code ?? error.message}`);
    failed = true;
  }
}
console.log(`Endpoint: ${url}${/127\.0\.0\.1|localhost/.test(url) ? " (local)" : " (NOT local)"}`);
process.exit(failed ? 1 : 0);

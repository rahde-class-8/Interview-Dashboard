#!/usr/bin/env node
// Writes the local Supabase connection values into .env.local using
// `supabase status`. Other variables already in .env.local are preserved.
// Refuses to write values that do not point at a local Supabase instance.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";

let status;
try {
  const out = execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  status = JSON.parse(out.slice(out.indexOf("{")));
} catch {
  console.error("Could not read `supabase status`. Is local Supabase running? Try `npm run supabase:start`.");
  process.exit(1);
}

const isLocal = (url) => /^(https?|postgresql):\/\/[^/]*(127\.0\.0\.1|localhost)[:/]/.test(url ?? "");
if (!isLocal(status.API_URL) || !isLocal(status.DB_URL)) {
  console.error("Refusing to write: status does not point at a local Supabase instance.");
  process.exit(1);
}

const values = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: status.DB_URL,
};
const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`supabase status did not return: ${missing.join(", ")}`);
  process.exit(1);
}

const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [];
const seen = new Set();
const updated = lines.map((line) => {
  const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
  if (key && key in values) {
    seen.add(key);
    return `${key}=${values[key]}`;
  }
  return line;
});
for (const [key, value] of Object.entries(values)) {
  if (!seen.has(key)) updated.push(`${key}=${value}`);
}
if (!updated.some((l) => l.startsWith("NEXT_PUBLIC_MAX_RECORDING_SIZE_MB="))) {
  updated.push("NEXT_PUBLIC_MAX_RECORDING_SIZE_MB=100");
}

writeFileSync(ENV_FILE, updated.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n", { mode: 0o600 });
console.log(`Updated ${ENV_FILE}: ${Object.keys(values).join(", ")} (values not printed).`);

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../..");
const allow = JSON.parse(readFileSync(join(root, "supabase/deploy-allowlist.json"), "utf8"));
const fnDir = join(root, "supabase/functions");
const dirs = readdirSync(fnDir).filter((n) => !n.startsWith("_") && statSync(join(fnDir, n)).isDirectory());
const configFns = [...readFileSync(join(root, "supabase/config.toml"), "utf8").matchAll(/^\[functions\.([^\]]+)\]/gm)].map((m) => m[1]);

describe("Worker App deployment allowlist", () => {
  it("check-scheduled-bookings is not deployable from the Worker App", () => {
    expect(dirs).not.toContain("check-scheduled-bookings");
    expect(configFns).not.toContain("check-scheduled-bookings");
  });
  it("every function folder is on the allowlist", () => {
    for (const d of dirs) expect(allow.worker_app_functions).toContain(d);
  });
  it("every configured function is on the allowlist", () => {
    for (const f of configFns) expect(allow.worker_app_functions).toContain(f);
  });
  it("no Admin-owned function is present", () => {
    for (const a of allow.admin_owned_never_deploy) {
      expect(dirs).not.toContain(a);
      expect(allow.worker_app_functions).not.toContain(a);
    }
  });
});

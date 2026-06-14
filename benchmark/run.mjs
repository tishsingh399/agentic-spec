// Enforcement benchmark.
//
// Question: when an agent makes the mistakes agents actually make against a
// design system, does the contract catch them? This seeds each documented
// failure mode as a one-line mutation of a real spec, runs the validator, and
// reports the catch rate plus false positives on the clean spec.
//
// It is deterministic and reproducible (no LLM in the loop). It measures the
// enforcement layer, not an end-to-end agent A/B — see README for that design.
//
//   npm run build && node benchmark/run.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSpec } from "../dist/validate/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, "..", "examples", "button");
const idx = readFileSync(join(base, "index.md"), "utf8");
const tok = readFileSync(join(base, "tokens.json"), "utf8");

// Each case is one mistake an agent commonly makes, as a mutation of the spec.
const cases = [
  { id: "clean spec (control — must NOT flag)", mistake: false, mutate: (i, t) => [i, t] },
  {
    id: "invents a token that doesn't exist",
    mistake: true,
    mutate: (i, t) => [i.replace("  - button.radius", "  - button.radius\n  - button.bg.galaxy"), t],
  },
  {
    id: "leaves an orphan token (code/contract drift)",
    mistake: true,
    mutate: (i, t) => {
      const o = JSON.parse(t);
      o.tokens.push({
        name: "button.bg.stale",
        tier: "component",
        role: "x",
        path: "button.bg.stale",
        references: "{action.primary}",
        primitive: "{color.blue.6}",
        light: "#000000",
        status: "existing",
      });
      return [i, JSON.stringify(o, null, 2)];
    },
  },
  {
    id: "binds a component token straight to a primitive (skips a tier)",
    mistake: true,
    mutate: (i, t) => [i, t.replace('"references": "{action.primary}"', '"references": "{color.blue.6}"')],
  },
  {
    id: "renames component in code but not in tokens (identity mismatch)",
    mistake: true,
    mutate: (i, t) => [i.replace("component: button", "component: btn"), t],
  },
  {
    id: "self-reports valid while the contract is broken (lying)",
    mistake: true,
    mutate: (i, t) => [i.replace("  - button.radius", "  - button.radius\n  - button.bg.ghost"), t],
  },
  {
    id: "stamps a future verification date",
    mistake: true,
    mutate: (i, t) => [i.replace(/last_verified: .*/, "last_verified: 2099-01-01"), t],
  },
  {
    id: "uses an invalid status value",
    mistake: true,
    mutate: (i, t) => [i.replace(/status: .*/, "status: Shipped"), t],
  },
];

let caught = 0;
let blocking = 0;
let mistakes = 0;
let falsePositives = 0;
const rows = [];
for (const c of cases) {
  const dir = mkdtempSync(join(tmpdir(), "agspec-"));
  const [mi, mt] = c.mutate(idx, tok);
  writeFileSync(join(dir, "index.md"), mi);
  writeFileSync(join(dir, "tokens.json"), mt);
  const r = await validateSpec(dir);
  rmSync(dir, { recursive: true, force: true });
  const surfaced = r.findings.length > 0;
  const blocks = !r.passed; // an error fails CI; a warning surfaces but passes
  const rules = [...new Set(r.findings.map((f) => `${f.severity}:${f.rule}`))];
  if (c.mistake) {
    mistakes++;
    if (surfaced) caught++;
    if (blocks) blocking++;
  } else if (surfaced) {
    falsePositives++;
  }
  const tag = c.mistake
    ? surfaced
      ? blocks
        ? "BLOCK "
        : "WARN  "
      : "MISSED"
    : surfaced
      ? "FALSE+"
      : "ok    ";
  rows.push(`  ${tag} ${c.id.padEnd(54)} ${rules.join(", ")}`);
}

console.log("\nEnforcement benchmark — seeded agent mistakes vs the contract\n");
console.log("  BLOCK = fails CI (error)   WARN = surfaced (warning)   missed = slipped through\n");
console.log(rows.join("\n"));
console.log(`\n  Agent mistakes surfaced:      ${caught}/${mistakes}  (${blocking} block CI, ${caught - blocking} warn)`);
console.log(`  False positives (clean spec): ${falsePositives}`);
process.exit(caught === mistakes && falsePositives === 0 ? 0 : 1);

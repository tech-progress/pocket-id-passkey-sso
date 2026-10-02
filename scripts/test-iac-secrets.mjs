import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { evaluateRailwayFile } from "railway/iac";

const observed = new Set();
for (const environment of [undefined, undefined, "production", "production"]) {
  const evaluated = await evaluateRailwayFile(".railway/railway.ts", { context: { environment } });
  const resource = evaluated.graph.resources.find((candidate) => candidate.type === "service");
  for (const [key, oldLabel] of [["ENCRYPTION_KEY", "pocket-id-encryption-key"], ["GATE_ADMIN_TOKEN", "pocket-id-gate-token"]]) {
    const variable = evaluated.desiredConfig.services["Pocket ID"].variables[key];
    assert.ok(typeof variable.value === "string" && /^[a-f0-9]{64}$/.test(variable.value), "Secret shape invalid (value redacted)");
    assert.equal(variable.preserveExisting, true);
    assert.equal(resource.variables[key].type, "raw");
    assert.ok(JSON.stringify(resource.variables[key].value) === JSON.stringify(variable), "Raw secret metadata changed during compilation (values redacted)");
    assert.ok(!observed.has(variable.value), "Secret reused across evaluations (value redacted)");
    assert.ok(variable.value !== createHash("sha256").update(`railway-iac:${environment ?? "default"}:${oldLabel}`).digest("hex"), "Public deterministic SDK value detected (value redacted)");
    observed.add(variable.value);
  }
}
assert.equal(observed.size, 8);
console.log("PASS: repeated default/production evaluations generate eight distinct crypto-random 256-bit secrets; raw preserveExisting=true compiles intact (live semantics unrun).");

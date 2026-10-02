import { readFileSync } from "node:fs";
import { evaluateRailwayFile } from "railway/iac";

const evaluated = await evaluateRailwayFile(".railway/railway.ts");
const service = evaluated.graph.resources.find((resource) => resource.type === "service");
if (service?.source?.rootDirectory !== (process.env.SOURCE_ROOT_DIR ?? "/pocket-id-passkey-sso")) {
  throw new Error("SDK dropped source.rootDirectory; refuse an incorrect source build context.");
}
const defaults = JSON.parse(readFileSync("template-defaults.json", "utf8"));
const configuration = evaluated.desiredConfig;
for (const key of ["ENCRYPTION_KEY", "GATE_ADMIN_TOKEN"]) {
  const native = configuration.services["Pocket ID"].variables[key];
  if (native.preserveExisting !== true || !/^[a-f0-9]{64}$/.test(native.value)) {
    throw new Error("Secure secret generation/preservation did not survive native compilation.");
  }
}
for (const [name, resource] of Object.entries(configuration.services)) {
  resource.variables = Object.fromEntries(
    Object.entries(defaults[name]).map(([key, value]) => [key, { ...resource.variables[key], value }]),
  );
}
console.log(JSON.stringify({ graph: {
  ...evaluated.graph,
  resources: evaluated.graph.resources.map((resource) => resource.type === "service"
    ? { ...resource, variables: defaults[resource.name] }
    : resource),
}, configuration }, null, 2));

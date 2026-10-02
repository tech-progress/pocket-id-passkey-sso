import { randomBytes } from "node:crypto";
import { defineRailway, project, service, volume } from "railway/iac";

const sourceRepo = process.env.SOURCE_REPO;
const sourceBranch = process.env.SOURCE_BRANCH ?? "release-v1";
const sourceRoot = process.env.SOURCE_ROOT_DIR ?? "/pocket-id-passkey-sso";

if (!sourceRepo || !/^[\w.-]+\/[\w.-]+$/.test(sourceRepo)) {
  throw new Error("Set SOURCE_REPO to an authorized, accessible owner/repository; no distribution repository is assumed.");
}
if (!/^[\w.-]+$/.test(sourceBranch)) {
  throw new Error("SOURCE_BRANCH must be a slash-free release channel.");
}
if (!sourceRoot.startsWith("/") || sourceRoot.includes("..")) {
  throw new Error("SOURCE_ROOT_DIR must be an absolute repository root directory without '..'.");
}

export default defineRailway(() => {
  const data = volume("Pocket ID Data", { sizeMB: 1000 });
  const pocket = service("Pocket ID", {
    source: { type: "github", repo: sourceRepo, branch: sourceBranch, rootDirectory: sourceRoot },
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "sh /opt/pocket-gate/entrypoint.sh python3 /opt/pocket-gate/gateway.py",
    healthcheck: "/healthz",
    healthcheckTimeout: 180,
    replicas: 1,
    volumeMounts: { "/app/data": data },
    env: {
      PORT: "8080",
      APP_URL: "https://${{Pocket ID.RAILWAY_PUBLIC_DOMAIN}}",
      ENCRYPTION_KEY: { value: randomBytes(32).toString("hex"), preserveExisting: true },
      GATE_ADMIN_TOKEN: { value: randomBytes(32).toString("hex"), preserveExisting: true },
      GATE_FORCE_LOCK: "true",
    },
  });
  return project("Pocket ID passkey SSO", { resources: [pocket, data] });
});

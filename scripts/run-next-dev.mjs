import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const extra = "--max-http-header-size=98304";
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, extra].filter(Boolean).join(" ").trim();

const child = spawn(process.execPath, [nextBin, "dev", "--webpack"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));

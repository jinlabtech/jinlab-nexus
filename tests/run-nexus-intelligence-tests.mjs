import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const output = mkdtempSync(join(tmpdir(), "nexus-core-tests-"));
for (const [source, target] of [
  ["lib/intelligence/engine.ts", "engine.mjs"],
  ["tests/nexus-intelligence.test.ts", "engine.test.mjs"],
]) {
  const content = readFileSync(new URL(`../${source}`, import.meta.url), "utf8")
    .replace('from "../lib/intelligence/engine"', 'from "./engine.mjs"');
  const compiled = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  writeFileSync(join(output, target), compiled.outputText);
}
const result = spawnSync(process.execPath, ["--test", join(output, "engine.test.mjs")], { stdio: "inherit" });
process.exitCode = result.status ?? 1;

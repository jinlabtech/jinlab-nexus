import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
const output = mkdtempSync(join(tmpdir(), "nexus-second-hand-tests-"));
for (const [source, target] of [["types/secondHand.ts", "helpers.mjs"], ["tests/second-hand.test.ts", "helpers.test.mjs"]]) {
  const content = readFileSync(new URL("../" + source, import.meta.url), "utf8").replace('"../types/secondHand.ts"', '"./helpers.mjs"');
  const compiled = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  writeFileSync(join(output, target), compiled.outputText);
}
const result = spawnSync(process.execPath, ["--test", join(output, "helpers.test.mjs")], { stdio: "inherit" });
process.exitCode = result.status ?? 1;

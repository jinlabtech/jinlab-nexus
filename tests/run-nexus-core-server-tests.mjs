import { mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const output = mkdtempSync(join(tmpdir(), 'nexus-core-server-tests-'));
symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(output, 'node_modules'), 'dir');
for (const [source, target] of [
  ['lib/intelligence/server.ts', 'server.mjs'],
  ['lib/intelligence/engine.ts', 'engine.mjs'],
  ['lib/intelligence/http.ts', 'http.mjs'],
  ['tests/nexus-core-server.test.ts', 'server.test.mjs'],
]) {
  const content = readFileSync(new URL('../' + source, import.meta.url), 'utf8')
    .replace('"../lib/intelligence/server.ts"', '"./server.mjs"')
    .replace('"../lib/intelligence/http.ts"', '"./http.mjs"')
    .replace('from "./server"', 'from "./server.mjs"')
    .replace('from "./engine"', 'from "./engine.mjs"');
  const compiled = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  writeFileSync(join(output, target), compiled.outputText);
}
const result = spawnSync(process.execPath, ['--test', join(output, 'server.test.mjs')], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;

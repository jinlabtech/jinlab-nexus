import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const output = mkdtempSync(join(tmpdir(), 'nexus-whatsapp-tests-'));
for (const [source, target] of [
  ['lib/whatsapp/phone.ts', 'phone.mjs'],
  ['lib/whatsapp/protocol.ts', 'protocol.mjs'],
  ['lib/whatsapp/history.ts', 'history.mjs'],
  ['tests/whatsapp-protocol.test.ts', 'protocol.test.mjs'],
]) {
  let content = readFileSync(new URL('../' + source, import.meta.url), 'utf8');
  content = content.replace('from "./phone"', 'from "./phone.mjs"').replace('"../lib/whatsapp/protocol.ts"', '"./protocol.mjs"').replace('"../lib/whatsapp/history.ts"', '"./history.mjs"');
  const compiled = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  writeFileSync(join(output, target), compiled.outputText);
}
const result = spawnSync(process.execPath, ['--test', join(output, 'protocol.test.mjs')], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;

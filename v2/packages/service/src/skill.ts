import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha } from './common.js';

/**
 * The worker skill: a short core SKILL.md plus situational references. The model cannot
 * read files, so the service appends only the references a job needs (progressive
 * disclosure without extra tool calls). The hash covers every part.
 */
export interface WorkerSkill {
  hash: string;
  core: string;
  references: Record<string, string>;
}

export function loadSkill(dir: string): WorkerSkill {
  const core = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const references: Record<string, string> = {};
  const refDir = join(dir, 'references');
  if (existsSync(refDir))
    for (const file of readdirSync(refDir).sort())
      if (file.endsWith('.md'))
        references[file.replace(/\.md$/, '')] = readFileSync(join(refDir, file), 'utf8');
  const hash = sha(
    [core, ...Object.entries(references).map(([name, text]) => `\n--- ${name}\n${text}`)].join(''),
  );
  return { hash, core, references };
}

export function composeSkill(skill: WorkerSkill, parts: string[]) {
  return [
    skill.core.trimEnd(),
    ...parts.map((p) => skill.references[p]?.trimEnd()).filter(Boolean),
  ].join('\n\n');
}

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: join(apiRoot, '.env'), quiet: true });
if (!process.env.DEEPSEEK_API_KEY?.trim()) {
  console.error(
    'Configure DEEPSEEK_API_KEY in the server environment or apps/api/.env before running live evaluation.',
  );
  process.exit(1);
}
const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitest, 'run', 'src/evaluation/live-evaluation.live.spec.ts'],
  {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, RUN_LIVE_AGENT_EVAL: '1' },
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

// Copies the single-file build output to the repo root as estimator.html —
// the committed artifact users download and open with Ctrl+O (no server needed).
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'dist', 'index.html'), join(root, 'estimator.html'));
console.log('estimator.html updated');

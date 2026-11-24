import fs from 'node:fs';
import path from 'node:path';

const TARGETS = [
  'node_modules/jsthermalcomfort/lib/cjs/models/utci.js',
  'node_modules/jsthermalcomfort/lib/esm/models/utci.js',
];

const BUGGY = '2.7150305 * Math.log1p(tk)';
const FIXED = '2.7150305 * Math.log(tk)';

let patchedCount = 0;

for (const rel of TARGETS) {
  const fullPath = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(fullPath)) continue;

  const src = fs.readFileSync(fullPath, 'utf8');
  if (src.includes(FIXED)) continue;

  if (!src.includes(BUGGY)) {
    throw new Error(`Expected UTCI vapor-pressure line not found in ${rel}`);
  }

  fs.writeFileSync(fullPath, src.replace(BUGGY, FIXED), 'utf8');
  patchedCount++;
}

if (patchedCount > 0) {
  console.log(`Patched jsthermalcomfort UTCI Math.log1p -> Math.log (${patchedCount} files).`);
}

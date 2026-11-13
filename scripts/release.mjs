// Raises the version everywhere it is written, then builds.
// usage: npm run release -- patch | minor | major | 1.2.3
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const arg = process.argv[2] || 'patch';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const [major, minor, patch] = manifest.version.split('.').map(Number);
const next =
  arg === 'major' ? `${major + 1}.0.0`
  : arg === 'minor' ? `${major}.${minor + 1}.0`
  : arg === 'patch' ? `${major}.${minor}.${patch + 1}`
  : /^\d+\.\d+\.\d+$/.test(arg) ? arg
  : null;
if (!next) {
  console.error(`Unknown version step "${arg}". Use patch, minor, major or a version like 1.2.3.`);
  process.exit(1);
}

const bump = (file, apply) => {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  apply(json);
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
};
bump('manifest.json', (j) => { j.version = next; });
bump('package.json', (j) => { j.version = next; });
bump('package-lock.json', (j) => { j.version = next; if (j.packages?.['']) j.packages[''].version = next; });

execSync('npx tsc --noEmit', { stdio: 'inherit' });
execSync('npm run build', { stdio: 'inherit' });
console.log(`\nVersion ${manifest.version} -> ${next}. Commit, then tag and push to publish:\n  git tag v${next} && git push personal main v${next}`);

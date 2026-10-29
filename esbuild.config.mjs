import { build, context } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: {
    background: 'src/background/index.ts',
    content: 'src/content/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome100',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  loader: { '.css': 'text' },
};

function copyStaticFiles() {
  mkdirSync('dist/icons', { recursive: true });
  cpSync('manifest.json', 'dist/manifest.json');
  cpSync('icons', 'dist/icons', { recursive: true });
}

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  copyStaticFiles();
  console.log('Watching for changes...');
} else {
  await build(options);
  copyStaticFiles();
}

import * as esbuild from 'esbuild';
import fs from 'fs/promises';

const isWatch = process.argv.includes('--watch');
const contentScripts = ['chatgpt', 'claude', 'grok', 'gemini', 'perplexity'];

async function prepareDist() {
  await fs.mkdir('dist/content', { recursive: true });
  await fs.mkdir('dist/popup', { recursive: true });
  await fs.mkdir('dist/background', { recursive: true });
  await fs.mkdir('dist/icons', { recursive: true });

  await fs.copyFile('src/manifest.json', 'dist/manifest.json').catch(() => {});
  await fs.copyFile('src/popup/popup.html', 'dist/popup/popup.html').catch(() => {});
  await fs.copyFile('src/popup/popup.css', 'dist/popup/popup.css').catch(() => {});

  // Copy icons if they exist
  for (const size of [16, 48, 128]) {
    await fs.copyFile(`src/icons/icon${size}.png`, `dist/icons/icon${size}.png`).catch(() => {});
  }

  console.log('Dist directories ready and static files copied.');
}

async function buildAll() {
  await prepareDist();

  const buildTasks = [];

  for (const name of contentScripts) {
    buildTasks.push(
      esbuild.build({
        entryPoints: [`src/content/${name}.ts`],
        outfile: `dist/content/${name}.js`,
        format: 'iife',
        target: 'es2020',
        bundle: true,
      })
    );
  }

  buildTasks.push(
    esbuild.build({
      entryPoints: ['src/popup/popup.ts'],
      outfile: 'dist/popup/popup.js',
      format: 'iife',
      target: 'es2020',
      bundle: true,
    })
  );

  buildTasks.push(
    esbuild.build({
      entryPoints: ['src/background/service-worker.ts'],
      outfile: 'dist/background/service-worker.js',
      format: 'esm',
      target: 'es2020',
      bundle: true,
    })
  );

  await Promise.all(buildTasks);
  console.log('Build completed successfully.');
}

async function startWatch() {
  await prepareDist();
  console.log('Watch mode started...');

  const contexts = [];

  for (const name of contentScripts) {
    contexts.push(await esbuild.context({
      entryPoints: [`src/content/${name}.ts`],
      outfile: `dist/content/${name}.js`,
      format: 'iife',
      target: 'es2020',
      bundle: true,
      sourcemap: true,
    }));
  }

  contexts.push(await esbuild.context({
    entryPoints: ['src/popup/popup.ts'],
    outfile: 'dist/popup/popup.js',
    format: 'iife',
    target: 'es2020',
    bundle: true,
    sourcemap: true,
  }));

  contexts.push(await esbuild.context({
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/background/service-worker.js',
    format: 'esm',
    target: 'es2020',
    bundle: true,
    sourcemap: true,
  }));

  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('All files are now being watched.');
  process.stdin.resume();
}

if (isWatch) {
  startWatch().catch(console.error);
} else {
  buildAll().catch(console.error);
}

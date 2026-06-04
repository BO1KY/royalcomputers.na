import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { extname, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const ROOT = dirname(fileURLToPath(import.meta.url));

function minifyDir(dir) {
  const files = readdirSync(dir);
  for (const file of files) {
    const ext = extname(file);
    if (ext === '.js' || ext === '.css') {
      const src = resolve(dir, file);
      const code = readFileSync(src, 'utf8');
      const result = esbuild.transformSync(code, {
        loader: ext === '.js' ? 'js' : 'css',
        minify: true,
      });
      writeFileSync(src, result.code);
      console.log(`Minified: ${file}`);
    }
  }
}

minifyDir(resolve(ROOT, 'js'));
minifyDir(resolve(ROOT, 'css'));
console.log('Done.');

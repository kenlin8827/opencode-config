/**
 * Convert PNG images to WebP format (overwriting the original filename).
 *
 * Usage:
 *   bun run scripts/png-to-webp.ts [dir1] [dir2] ...
 *
 * If no directory is given, defaults to `docs/public/images`.
 * The script replaces `foo.png` with `foo.webp` in-place (the PNG file is deleted).
 */

import fs from 'node:fs';
import path from 'node:path';

async function ensureSharp(): Promise<any> {
  const tryLoad = async () => {
    const mod: any = await import('sharp');
    // ESM interop: prefer default export
    return typeof mod === 'function' ? mod : mod.default ?? mod;
  };
  try {
    return await tryLoad();
  } catch {
    // sharp not installed yet — install it on the fly using bun.
    console.log('sharp not found, installing...');
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('bun', ['add', '-d', 'sharp'], { stdio: 'inherit', shell: true });
    if (r.status !== 0) {
      throw new Error('Failed to install sharp. Please run `bun add -d sharp` manually.');
    }
    return await tryLoad();
  }
}

async function convertDir(dir: string, sharp: any): Promise<{ ok: number; fail: number }> {
  const pngs = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .map((f) => path.join(dir, f));

  if (pngs.length === 0) {
    console.log(`[skip] No PNG files in: ${dir}`);
    return { ok: 0, fail: 0 };
  }

  let ok = 0;
  let fail = 0;

  for (const png of pngs) {
    const webp = png.replace(/\.png$/i, '.webp');
    try {
      await sharp(png).webp({ quality: 90 }).toFile(webp);
      fs.unlinkSync(png); // remove original PNG
      console.log(`  ✓ ${path.basename(png)} → ${path.basename(webp)}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${path.basename(png)}: ${(err as Error).message}`);
      fail++;
    }
  }

  return { ok, fail };
}

async function main() {
  const dirs = process.argv.slice(2);
  const targets = dirs.length > 0 ? dirs : [path.resolve(process.cwd(), 'docs/public/images')];

  // Validate directories
  for (const d of targets) {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
      console.error(`Directory not found: ${d}`);
      process.exit(1);
    }
  }

  console.log(`Converting PNG → WebP in:\n  ${targets.join('\n  ')}\n`);

  const sharp = await ensureSharp();

  let totalOk = 0;
  let totalFail = 0;

  for (const dir of targets) {
    console.log(`\n[${dir}]`);
    const r = await convertDir(dir, sharp);
    totalOk += r.ok;
    totalFail += r.fail;
  }

  console.log(`\nDone. Converted: ${totalOk}, Failed: ${totalFail}`);
  if (totalFail > 0) process.exit(1);
}

main();

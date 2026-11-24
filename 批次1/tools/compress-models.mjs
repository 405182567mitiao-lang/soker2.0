// 把 assets/models 下的 .buf 模型文件就地 gzip 压缩。
// 浏览器与 CDN 看到 Content-Encoding: gzip 会自动解压，前端代码读取到的仍是原始字节，无需改任何 JS。
// 用法：
//   node tools/compress-models.mjs          压缩（已是 gzip 的会跳过）
//   node tools/compress-models.mjs --check  只检查，不写入；有未压缩文件时退出码 1
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = path.join(root, 'assets', 'models');
const checkOnly = process.argv.includes('--check');
const restore = process.argv.includes('--restore');

const isGzip = buffer => buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.buf')) out.push(full);
  }
  return out;
}

const files = await walk(modelDir);

if (restore) {
  let restored = 0;
  for (const file of files) {
    const buffer = await readFile(file);
    if (!isGzip(buffer)) continue;
    await writeFile(file, gunzipSync(buffer));
    restored += 1;
  }
  console.log(`已还原 ${restored} 个 .buf 为原始字节。注意：还原后需同步删除 vercel.json 里针对 .buf 的 Content-Encoding 规则，否则线上会解析失败。`);
  process.exit(0);
}

let before = 0;
let after = 0;
let skipped = 0;
const stale = [];

for (const file of files) {
  const buffer = await readFile(file);
  if (isGzip(buffer)) {
    skipped += 1;
    after += buffer.length;
    continue;
  }
  const packed = gzipSync(buffer, { level: 9 });
  before += buffer.length;
  after += packed.length;
  const rel = path.relative(root, file);
  if (checkOnly) {
    stale.push(`${rel} 未压缩 ${(buffer.length / 1048576).toFixed(2)}MB，压缩后约 ${(packed.length / 1048576).toFixed(2)}MB`);
    continue;
  }
  await writeFile(file, packed);
  console.log(`  ${rel}  ${(buffer.length / 1024).toFixed(0)}KB → ${(packed.length / 1024).toFixed(0)}KB`);
}

if (checkOnly) {
  if (stale.length) {
    console.log(`\n发现 ${stale.length} 个未压缩的 .buf：`);
    stale.forEach(line => console.log('  ' + line));
    console.log('\n执行 node tools/compress-models.mjs 即可压缩。');
    process.exit(1);
  }
  console.log(`全部 ${files.length} 个 .buf 都已压缩，合计 ${(after / 1048576).toFixed(2)}MB。`);
  process.exit(0);
}

if (stale.length === 0 && skipped === files.length) {
  console.log(`全部 ${files.length} 个 .buf 已是 gzip，无需处理（合计 ${(after / 1048576).toFixed(2)}MB）。`);
} else if (before > 0) {
  console.log(`\n已压缩 ${files.length - skipped} 个文件：${(before / 1048576).toFixed(2)}MB → ${(after / 1048576).toFixed(2)}MB，省 ${(100 - after / before * 100).toFixed(0)}%`);
} else {
  console.log(`全部 ${files.length} 个 .buf 已是 gzip（合计 ${(after / 1048576).toFixed(2)}MB）。`);
}

#!/usr/bin/env node
// Soker 官网 SEO/GEO 自查脚本
// 用法：node check-seo.mjs
// 说明：不需要安装任何依赖，只要 Node 就能跑。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), 'utf8') : null);

// 一键换域名：node check-seo.mjs --domain https://soker.ai
const di = process.argv.indexOf('--domain');
if (di > -1) {
  const raw = process.argv[di + 1];
  if (!raw || !/^https?:\/\/[^/\s]+/.test(raw)) {
    console.error('用法：node check-seo.mjs --domain https://你的域名\n域名要带 https:// 开头，结尾不要加斜杠。');
    process.exit(1);
  }
  const target = raw.replace(/\/+$/, '');
  const files = ['index.html', 'faq.html', 'robots.txt', 'sitemap.xml', 'llms.txt'];
  let total = 0;
  for (const f of files) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    const before = readFileSync(p, 'utf8');
    const after = before.replace(/https?:\/\/soker-website\.vercel\.app/g, target);
    const n = (before.match(/https?:\/\/soker-website\.vercel\.app/g) || []).length;
    if (n > 0) { writeFileSync(p, after); total += n; }
    console.log(`  ${f.padEnd(14)} 替换 ${n} 处`);
  }
  console.log(`\n共替换 ${total} 处，域名已统一为 ${target}`);
  console.log('接着运行 node check-seo.mjs 复查。');
  process.exit(0);
}

let pass = 0, warn = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`); };
const wr = (m) => { warn++; console.log(`  \x1b[33m!\x1b[0m ${m}`); };
const no = (m) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const html = read('index.html');
if (!html) { console.error('找不到 index.html，请在官网目录下运行'); process.exit(1); }

const meta = (prop) => {
  for (const attr of ['property', 'name']) {
    const re = new RegExp(`<meta[^>]*${attr}="${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*content="([^"]*)"`, 'i');
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
};
const canonical = (html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i) || [])[1] || null;
const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
const desc = meta('description') || '';

head('1. 域名一致性（最要紧的一项）');
if (!canonical) no('index.html 缺少 canonical 标签');
else {
  ok(`canonical 存在：${canonical}`);
  if (/synthetic-humans\.ai/.test(canonical)) no('canonical 仍指向模板站 synthetic-humans.ai，权重会送给别人');
  if (/vercel\.app/.test(canonical)) wr('canonical 目前用的是 Vercel 预览域名，绑定正式域名后必须替换');
  if (!/^https?:\/\//.test(canonical)) no('canonical 不是绝对地址');
}
const ogUrl = meta('og:url');
const twUrl = meta('twitter:url');
if (ogUrl === canonical) ok('og:url 与 canonical 一致');
else no(`og:url（${ogUrl}）与 canonical 不一致，分享卡片会指错页面`);
if (twUrl === canonical) ok('twitter:url 与 canonical 一致');
else no(`twitter:url（${twUrl}）与 canonical 不一致`);

head('2. 标题与摘要');
const tLen = [...title].length;
if (tLen >= 15 && tLen <= 40) ok(`title 长度 ${tLen} 字，合适`);
else wr(`title 长度 ${tLen} 字，建议 15–40 字之间（过长会被截断）`);
console.log(`      title：${title}`);
const dLen = [...desc].length;
if (dLen >= 50 && dLen <= 120) ok(`description 长度 ${dLen} 字，合适`);
else wr(`description 长度 ${dLen} 字，建议 50–120 字`);

head('3. 社交分享图');
const ogImg = meta('og:image');
if (!ogImg) no('缺少 og:image，转发出去没有缩略图');
else {
  if (/\.svg$/i.test(ogImg)) no('og:image 是 SVG，微信和 Twitter 都抓不到，必须换成 PNG 或 JPG');
  else {
    ok(`og:image 格式正确：${path.basename(ogImg)}`);
    const local = path.join(root, ogImg.replace(/^https?:\/\/[^/]+\//, '/'));
    if (existsSync(local)) {
      const buf = readFileSync(local);
      if (buf.slice(1, 4).toString() === 'PNG') {
        const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
        if (w === 1200 && h === 630) ok(`图片尺寸 ${w}×${h}，符合平台规范`);
        else wr(`图片尺寸 ${w}×${h}，建议 1200×630`);
      } else ok('图片文件存在');
    } else no(`og:image 指向的文件不存在：${ogImg}`);
  }
}

head('4. 结构化数据（让 Google 和 AI 认出你是谁）');
const ldBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
if (ldBlocks.length === 0) no('index.html 没有任何 JSON-LD 结构化数据');
else {
  ldBlocks.forEach((b, i) => {
    try {
      const data = JSON.parse(b[1]);
      const types = JSON.stringify(data).match(/"@type":"([^"]+)"/g)?.map(s => s.split(':')[1].replace(/"/g, '')) || [];
      ok(`第 ${i + 1} 段 JSON-LD 可正常解析，包含：${[...new Set(types)].join('、')}`);
    } catch (e) { no(`第 ${i + 1} 段 JSON-LD 语法有错，搜索引擎会直接忽略：${e.message}`); }
  });
}

head('5. 正文结构');
const h1n = (html.match(/<h1[\s>]/g) || []).length;
if (h1n === 1) ok('h1 唯一，正确');
else if (h1n === 0) no('页面没有 h1');
else wr(`页面有 ${h1n} 个 h1，建议只保留一个`);
const emptyH = (html.match(/<h[1-6][^>]*>\s*<\/h[1-6]>/g) || []).length;
const emptyP = (html.match(/<p[^>]*>\s*<\/p>/g) || []).length;
if (emptyH + emptyP === 0) ok('没有空标题或空段落');
else wr(`发现 ${emptyH} 个空标题、${emptyP} 个空段落（动画占位），爬虫读到这里会断`);
const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
const noAlt = imgs.filter(t => !/\balt=/.test(t)).length;
if (noAlt === 0) ok(`图片 alt 齐全（共 ${imgs.length} 张）`);
else wr(`${noAlt} 张图片完全没有 alt 属性`);

head('6. 抓取入口文件');
const robots = read('robots.txt');
if (!robots) no('缺少 robots.txt');
else {
  ok('robots.txt 存在');
  if (/^Sitemap:\s*\S+/im.test(robots)) ok('robots.txt 指向了 sitemap');
  else no('robots.txt 没有 Sitemap 行，爬虫找不到目录');
  const bots = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bytespider'];
  const missing = bots.filter(b => !robots.includes(b));
  if (missing.length === 0) ok('已显式允许主流 AI 爬虫抓取');
  else wr(`未显式声明 AI 爬虫：${missing.join('、')}`);
  if (/^Disallow:\s*\/\s*$/im.test(robots)) no('robots.txt 里存在 Disallow: /，全站会被屏蔽');
}
const sm = read('sitemap.xml');
if (!sm) no('缺少 sitemap.xml');
else {
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  ok(`sitemap.xml 存在，收录 ${locs.length} 个网址`);
  const cHost = canonical ? new URL(canonical).host : null;
  const bad = locs.filter(u => { try { return new URL(u).host !== cHost; } catch { return true; } });
  if (bad.length) no(`sitemap 里有 ${bad.length} 个网址和 canonical 域名不一致：${bad[0]}`);
  else ok('sitemap 里所有网址与 canonical 同域');
  locs.forEach(u => console.log(`      ${u}`));
}
const llms = read('llms.txt');
if (!llms) no('缺少 llms.txt（给 AI 看的站点说明）');
else if (llms.length < 300) wr('llms.txt 太短，信息量可能不足');
else ok(`llms.txt 存在，约 ${[...llms].length} 字`);

head('7. 页面之间的连接');
const faq = read('faq.html');
if (!faq) no('缺少 faq.html 内容页，长尾关键词没有落地页');
else {
  ok('faq.html 存在');
  if (/<h1[\s>]/.test(faq)) ok('faq.html 有 h1');
  else no('faq.html 没有 h1');
  const faqCanon = (faq.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i) || [])[1];
  if (faqCanon) ok(`faq.html 的 canonical：${faqCanon}`);
  else no('faq.html 缺少 canonical');
  if (/"FAQPage"/.test(faq)) ok('faq.html 带 FAQPage 结构化数据，AI 更容易摘引');
  else wr('faq.html 没有 FAQPage 结构化数据');
  if (/href="\/faq\.html"/.test(html)) ok('首页有指向 faq.html 的链接');
  else no('首页没有指向 faq.html 的链接，新页面会成为孤岛，收录很慢');
  if (/href="\/"/.test(faq)) ok('faq.html 有权重回指首页的链接');
  else wr('faq.html 没有回到首页的链接');
}

console.log(`\n\x1b[1m结果：\x1b[0m\x1b[32m${pass} 项通过\x1b[0m，\x1b[33m${warn} 项提醒\x1b[0m，\x1b[31m${fail} 项必须修\x1b[0m`);
if (fail > 0) console.log('\x1b[31m还有必须修的问题，先别上线。\x1b[0m');
else if (warn > 0) console.log('\x1b[33m没有硬伤，剩下的提醒可以逐条处理。\x1b[0m');
else console.log('\x1b[32m全部通过。\x1b[0m');
process.exit(fail > 0 ? 1 : 0);

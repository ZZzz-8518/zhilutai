const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const dns = require('node:dns').promises;
const zlib = require('node:zlib');
const { DATA_DIR, TOOLS_DIR } = require('./db');

const bundledPlaywright = path.join(TOOLS_DIR, 'node_modules', 'playwright-core');
const PLAYWRIGHT_PATH = fs.existsSync(bundledPlaywright) ? bundledPlaywright : 'playwright-core';
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
  process.platform === 'win32' ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' : '',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const CHROME_PATH = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || '';
const PAGE_CACHE_DIR = path.join(DATA_DIR, 'cache', 'pages');
const PAGE_CACHE_VERSION = 2;
const PROFILE_DIR = path.join(DATA_DIR, 'cache', 'chrome-profile');
const PROCESS_PROFILE_DIR = path.join(PROFILE_DIR, String(process.pid));
let contextPromise;

function isPrivateIp(address) {
  if (!net.isIP(address)) return false;
  const value = address.toLowerCase();
  if (value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  const ipv4 = value.startsWith('::ffff:') ? value.slice(7) : value;
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

async function assertPublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('招聘原文链接无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('只允许读取公开的 HTTP/HTTPS 网页');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || isPrivateIp(hostname)) throw new Error('不能读取本机或内网地址');
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new Error('不能读取本机或内网地址');
  return url.toString();
}

function cacheFile(url) {
  const key = crypto.createHash('sha256').update(url).digest('hex');
  return path.join(PAGE_CACHE_DIR, `${key}.json`);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[\t\u00a0 ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 50_000);
}

function decodeHtml(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function htmlToText(html) {
  return cleanText(decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')));
}

function decodePackedHtml(html) {
  const decoded = [];
  const pattern = /Base64\.decode\(unzip\("([A-Za-z0-9+/=]+)"\)\.substr\((\d+)\)\)\.substr\((\d+)\)/g;
  for (const match of String(html || '').matchAll(pattern)) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'base64')).toString('utf8');
      const content = Buffer.from(inflated.slice(Number(match[2])), 'base64').toString('utf8').slice(Number(match[3]));
      const text = htmlToText(content);
      if (text) decoded.push(text);
    } catch {}
  }
  return cleanText(decoded.join('\n'));
}

async function readPackedStaticPage(url) {
  try {
    const origin = new URL(url).origin;
    const queue = [url];
    const visited = new Set();
    const texts = [];
    let title = '';
    let finalUrl = url;
    while (queue.length && visited.size < 4) {
      const currentUrl = queue.shift();
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);
      const response = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
        signal: AbortSignal.timeout(25_000)
      });
      if (!response.ok) continue;
      const html = await response.text();
      finalUrl = response.url || currentUrl;
      title ||= decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
      texts.push(htmlToText(html), decodePackedHtml(html));
      for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const label = htmlToText(match[2]);
        if (!/公司简介|企业简介|招聘公告|校园招聘|\babout\b|\bintro|\brecruit|\brecuit|campus/i.test(`${label} ${match[1]}`)
          || /校招职位|school-pos|position|jobs?/i.test(`${label} ${match[1]}`)) continue;
        try {
          const target = new URL(match[1], finalUrl).toString();
          if (new URL(target).origin === origin && !visited.has(target)) queue.push(target);
        } catch {}
      }
    }
    const text = cleanText(texts.join('\n'));
    if (text.length < 80) return null;
    return { title, final_url: finalUrl, text };
  } catch { return null; }
}

async function getContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      if (!CHROME_PATH) throw new Error('未找到本机 Chrome，无法读取动态招聘网页；可通过 CHROME_PATH 指定位置');
      try { require.resolve(PLAYWRIGHT_PATH); } catch { throw new Error('正文读取组件未安装，请先运行 npm install'); }
      fs.mkdirSync(PROCESS_PROFILE_DIR, { recursive: true });
      const { chromium } = require(PLAYWRIGHT_PATH);
      return chromium.launchPersistentContext(PROCESS_PROFILE_DIR, {
        executablePath: CHROME_PATH,
        headless: true,
        viewport: { width: 1365, height: 900 },
        locale: 'zh-CN',
        args: [`--disk-cache-dir=${path.join(DATA_DIR, 'cache', 'chrome')}`, '--disable-background-networking']
      });
    })().catch((error) => {
      contextPromise = null;
      throw error;
    });
  }
  return contextPromise;
}

async function readPage(sourceUrl, options = {}) {
  const url = await assertPublicUrl(sourceUrl);
  const file = cacheFile(url);
  if (!options.force && fs.existsSync(file)) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cached.cache_version === PAGE_CACHE_VERSION
        && Date.now() - new Date(cached.read_at).getTime() < 6 * 60 * 60 * 1000 && cached.text) return cached;
    } catch {}
  }
  const packed = await readPackedStaticPage(url);
  if (packed) {
    const record = { ...packed, source_url: url, read_at: new Date().toISOString(), cache_version: PAGE_CACHE_VERSION };
    fs.mkdirSync(PAGE_CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record), 'utf8');
    return record;
  }
  const context = await getContext();
  const page = await context.newPage();
  try {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35_000 });
    } catch {
      throw new Error('招聘网页连接超时或暂时不可访问');
    }
    await page.waitForTimeout(1200);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const result = await page.evaluate(() => ({
      title: document.title || '',
      final_url: location.href,
      text: document.body?.innerText || ''
    }));
    const record = { ...result, text: cleanText(result.text), source_url: url, read_at: new Date().toISOString(), cache_version: PAGE_CACHE_VERSION };
    if (record.text.length < 80) throw new Error('招聘网页正文为空或被网站拦截');
    fs.mkdirSync(PAGE_CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(record), 'utf8');
    return record;
  } finally {
    await page.close().catch(() => {});
  }
}

function normalizeDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractDate(text, labels) {
  const separator = '[年\\-/.]';
  const daySuffix = '(?:日)?';
  const pattern = new RegExp(`(?:${labels})[^\\n\\d]{0,12}(20\\d{2})${separator}(\\d{1,2})[月\\-/.](\\d{1,2})${daySuffix}`, 'i');
  const match = String(text).match(pattern);
  return match ? normalizeDate(match[1], match[2], match[3]) : '';
}

function section(lines, starts, ends, limit = 1200) {
  const start = lines.findIndex((line) => starts.some((pattern) => pattern.test(line)));
  if (start < 0) return '';
  const selected = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && ends.some((pattern) => pattern.test(line))) break;
    selected.push(line);
    if (selected.join('\n').length >= limit) break;
  }
  return selected.join('\n').slice(0, limit);
}

function extractFacts(text) {
  const value = cleanText(text);
  const lines = value.split('\n');
  const locationMatch = value.match(/(?:工作|招聘|任职|办公)地点\s*[：:]\s*([^\n，,；;]{1,30})/i);
  const city = String(locationMatch?.[1] || '').replace(/[。.]$/, '').trim();
  const deadline = extractDate(value, '过期时间|截止(?:时间|日期)?|报名截止|网申截止');
  const published_at = extractDate(value, '发布时间|发布日期|更新日期');
  const official_benefits = section(
    lines,
    [/^[●•◆■\s]*薪酬福利\s*[：:]?/i, /^[●•◆■\s]*(?:福利待遇|薪资待遇|薪酬待遇)\s*[：:]?/i],
    [/^[●•◆■\s]*(?:招聘流程|应聘流程|申请方式|联系方式|报名方式)\s*[：:]?/i]
  );
  const description = section(
    lines,
    [/^招聘对象\s*[：:]?/i, /^[●•◆■\s]*(?:岗位要求|任职要求|招聘要求|资格条件)\s*[：:]?/i],
    [/^[●•◆■\s]*(?:薪酬福利|福利待遇|薪资待遇|薪酬待遇|招聘流程|联系方式)\s*[：:]?/i],
    2400
  );
  return { city, deadline, published_at, official_benefits, description };
}

module.exports = { assertPublicUrl, cleanText, decodePackedHtml, extractFacts, htmlToText, readPage, normalizeDate };

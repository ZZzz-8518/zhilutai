const path = require('node:path');
const crypto = require('node:crypto');
const {
  DATA_DIR, TOOLS_DIR, getSettings, getCompanyResearch, saveCompanyResearch, getSearchCache, setSearchCache
} = require('./db');
const { readPage } = require('./content');
const { parseSearchResults, parseSogouResults } = require('./ai');

let parser;
function getXmlParser() {
  if (parser) return parser;
  let FastXmlParser;
  try { FastXmlParser = require('fast-xml-parser'); }
  catch { FastXmlParser = require(path.join(TOOLS_DIR, 'node_modules', 'fast-xml-parser')); }
  parser = new FastXmlParser.XMLParser({ ignoreAttributes: false, trimValues: true });
  return parser;
}
const RESEARCH_VERSION = 2;
const SOCIAL_HOSTS = /xiaohongshu\.com|douyin\.com|zhihu\.com|nowcoder\.com|yingjiesheng\.com|bilibili\.com/i;
const BLOCKED_OFFICIAL_HOSTS = /bing\.com|baidu\.com|so\.com|sogou\.com|wikipedia\.org|zhipin\.com|liepin\.com|kanzhun\.com/i;

function normalizeApiBase(value) {
  const base = String(value || '').trim().replace(/\/+$/, '');
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('公司资料分析结果不是有效 JSON');
}

function extractChatText(body) {
  const content = body?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((part) => part.text || '').join('\n') : String(content || '');
}

async function searchBing(query) {
  const key = `company-web:${crypto.createHash('sha256').update(query).digest('hex')}`;
  const cached = getSearchCache(key, 30 * 24 * 60 * 60 * 1000);
  if (Array.isArray(cached)) return cached;
  const response = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`公开搜索失败 (${response.status})`);
  const parsed = getXmlParser().parse(await response.text());
  const rawItems = parsed?.rss?.channel?.item || [];
  const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).filter(Boolean).map((item) => ({
    title: String(item.title || ''),
    url: String(item.link || ''),
    summary: String(item.description || ''),
    published_at: String(item.pubDate || '')
  })).filter((item) => /^https?:\/\//i.test(item.url));
  setSearchCache(key, items);
  return items;
}

async function searchHtmlEngine(url, parse) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
      signal: AbortSignal.timeout(20_000)
    });
    return response.ok ? parse(await response.text()).map((item) => ({
      title: item.title || '', url: item.source_url || '', summary: item.snippet || '', published_at: item.date || ''
    })) : [];
  } catch { return []; }
}

async function searchWeb(query) {
  const key = `company-web-v2:${crypto.createHash('sha256').update(query).digest('hex')}`;
  const cached = getSearchCache(key, 30 * 24 * 60 * 60 * 1000);
  if (Array.isArray(cached)) return cached;
  const encoded = encodeURIComponent(query);
  const [bing, so, sogou] = await Promise.all([
    searchBing(query).catch(() => []),
    searchHtmlEngine(`https://www.so.com/s?q=${encoded}`, parseSearchResults),
    searchHtmlEngine(`https://www.sogou.com/web?query=${encoded}`, parseSogouResults)
  ]);
  const unique = new Map();
  for (const item of [...so, ...sogou, ...bing]) {
    const keyUrl = normalizeUrl(item.url);
    if (keyUrl && !unique.has(keyUrl)) unique.set(keyUrl, item);
  }
  const items = [...unique.values()];
  setSearchCache(key, items);
  return items;
}

function host(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch { return ''; }
}

function companyStem(company) {
  return String(company || '').replace(/[（(].*?[）)]/g, '').replace(/有限责任公司|股份有限公司|集团有限公司|有限公司|集团|股份/g, '').trim();
}

function relevantToCompany(item, company) {
  const stem = companyStem(company);
  if (!stem) return false;
  const text = `${item?.title || ''} ${item?.summary || ''}`.replace(/\s+/g, '');
  return text.includes(stem.replace(/\s+/g, '')) || (stem.length >= 8 && text.includes(stem.slice(0, 8)));
}

async function discoverCompanyInfoPages(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) return [];
    const html = await response.text();
    const links = [];
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/公司简介|企业简介|企业概况|公司概况|\babout\b|\bintro/i.test(`${label} ${match[1]}`)) continue;
      try {
        const target = new URL(match[1], response.url || url).toString();
        if (new URL(target).origin === new URL(url).origin) links.push(target);
      } catch {}
    }
    return [...new Set(links)].slice(0, 2);
  } catch { return []; }
}

async function collectCompanyEvidence(company, jobs) {
  const [introResults, benefitResults, socialResults] = await Promise.all([
    searchWeb(`${company} 官方网站 公司简介 主营业务`),
    searchWeb(`${company} 校园招聘 薪酬福利 补贴 假期 培训`),
    searchWeb(`site:zhihu.com OR site:nowcoder.com OR site:xiaohongshu.com OR site:yingjiesheng.com ${company} 校招 待遇 面试 工作体验`)
  ]);
  const companyIntroResults = introResults.filter((item) => relevantToCompany(item, company));
  const companyBenefitResults = benefitResults.filter((item) => relevantToCompany(item, company));
  const companySocialResults = socialResults.filter((item) => relevantToCompany(item, company));
  const officialOptions = jobs.flatMap((job) => job.application_options || [])
    .filter((option) => option.category === 'official').map((option) => option.url);
  const officialSearch = [...companyIntroResults, ...companyBenefitResults]
    .filter((item) => !SOCIAL_HOSTS.test(host(item.url)) && !BLOCKED_OFFICIAL_HOSTS.test(host(item.url)))
    .slice(0, 12);
  const searchedOfficial = officialSearch
    .map((item) => item.url);
  const discoveredInfoPages = (await Promise.all(officialOptions.slice(0, 2).map(discoverCompanyInfoPages))).flat();
  const pageUrls = [...new Set([...discoveredInfoPages, ...officialOptions, ...searchedOfficial])].slice(0, 3);
  const pages = [];
  for (const url of pageUrls) {
    try {
      const page = await readPage(url);
      pages.push({ url, text: String(page.text || '').slice(0, 7000) });
    } catch {}
  }
  return {
    company,
    current_jobs: jobs.slice(0, 3).map((job) => ({
      title: job.title, source_url: job.source_url, description: String(job.description || '').slice(0, 2500),
      official_benefits: job.official_benefits || '', deadline: job.deadline || ''
    })),
    official_search: officialSearch,
    official_pages: pages,
    social_search: companySocialResults.filter((item) => SOCIAL_HOSTS.test(host(item.url))).slice(0, 10)
  };
}

async function analyseEvidenceBatch(evidenceBatch, settings) {
  const provider = { key: settings.api_key, base: settings.api_base, model: settings.model };
  if (!provider.key) throw new Error('未配置公司资料分析接口');
  const prompt = `你是企业校招资料核验员。仅依据给定搜索结果、官网正文和招聘原文整理资料，不得凭常识补写。

要求：
1. official_intro 为80-180字的公司介绍，必须来自企业官网或可靠官方来源，intro_source_url填写对应原链接。
2. official_benefits 只写来源明确公布的薪酬、补贴、保险、住房、假期、培训等；没有统一信息则留空，benefits_source_url填写来源。
3. social_reviews 仅收录小红书、知乎、牛客、应届生、B站、抖音等原始链接能支持的内容。每条必须有source_name和source_url；无法读取正文或摘要没有事实时不收录。
4. 不把往届待遇冒充本届承诺，在summary中标明年份或“往届参考”。
5. 只输出JSON，不要Markdown：{"companies":[{"company_name":"","official_intro":"","intro_source_url":"","official_benefits":"","benefits_source_url":"","social_reviews":[{"topic":"待遇/笔试/面试/工作体验","sentiment":"正面/中性/负面","summary":"","source_name":"","source_url":"","date":""}]}]}

资料：${JSON.stringify(evidenceBatch)}`;
  const response = await fetch(`${normalizeApiBase(provider.base)}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'system', content: '严格依据来源提取企业资料，只输出JSON。' }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(120_000)
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { throw new Error('公司资料分析接口返回了非 JSON 响应'); }
  if (!response.ok) throw new Error(body?.error?.message || `公司资料分析失败 (${response.status})`);
  const parsed = parseJson(extractChatText(body));
  return Array.isArray(parsed.companies) ? parsed.companies : [];
}

function shouldResearch(company, force = false) {
  if (force) return true;
  const existing = getCompanyResearch(company);
  if (!existing) return true;
  if (Number(existing.research_version || 0) < RESEARCH_VERSION) return true;
  if (['complete', 'partial'].includes(existing.status)) return false;
  return Date.now() - new Date(existing.researched_at).getTime() > 12 * 60 * 60 * 1000;
}

async function researchCompanies(jobs, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 50);
  const grouped = new Map();
  for (const job of jobs) {
    const company = String(job.company || '').trim();
    if (!company || !shouldResearch(company, options.force === true)) continue;
    if (!grouped.has(company)) grouped.set(company, []);
    grouped.get(company).push(job);
  }
  const selected = [...grouped.entries()].slice(0, limit);
  const evidence = new Array(selected.length);
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const index = cursor++;
      const [company, companyJobs] = selected[index];
      try { evidence[index] = await collectCompanyEvidence(company, companyJobs); }
      catch (error) { evidence[index] = { company, current_jobs: companyJobs.slice(0, 2), error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, selected.length) }, worker));

  const settings = getSettings(true);
  const saved = [];
  for (let index = 0; index < evidence.length; index += 5) {
    const batch = evidence.slice(index, index + 5);
    try {
      const analysed = await analyseEvidenceBatch(batch, settings);
      const byName = new Map(analysed.map((item) => [String(item.company_name || '').trim(), item]));
      for (const item of batch) {
        const result = byName.get(item.company) || {};
        const officialEvidenceUrls = new Set([
          ...(item.current_jobs || []).map((job) => job.source_url),
          ...(item.official_search || []).map((entry) => entry.url),
          ...(item.official_pages || []).map((page) => page.url)
        ].map(normalizeUrl).filter(Boolean));
        const socialEvidenceUrls = new Set((item.social_search || []).map((entry) => normalizeUrl(entry.url)).filter(Boolean));
        const socialReviews = (Array.isArray(result.social_reviews) ? result.social_reviews : [])
          .filter((review) => review && SOCIAL_HOSTS.test(host(review.source_url))
            && socialEvidenceUrls.has(normalizeUrl(review.source_url)));
        const hasIntro = Boolean(result.official_intro && result.intro_source_url
          && !BLOCKED_OFFICIAL_HOSTS.test(host(result.intro_source_url))
          && officialEvidenceUrls.has(normalizeUrl(result.intro_source_url)));
        const hasBenefits = Boolean(result.official_benefits && result.benefits_source_url
          && !BLOCKED_OFFICIAL_HOSTS.test(host(result.benefits_source_url))
          && officialEvidenceUrls.has(normalizeUrl(result.benefits_source_url)));
        saved.push(saveCompanyResearch({
          company_name: item.company,
          official_intro: hasIntro ? result.official_intro : '已检索公开官网，暂未提取到可核验的公司介绍。',
          intro_source_url: hasIntro ? result.intro_source_url : '',
          official_benefits: hasBenefits ? result.official_benefits : '暂未找到该企业针对本届校招统一公布的薪酬福利信息。',
          benefits_source_url: hasBenefits ? result.benefits_source_url : '',
          social_reviews: socialReviews,
          status: hasIntro && hasBenefits && socialReviews.length ? 'complete' : 'partial',
          research_version: RESEARCH_VERSION
        }));
      }
    } catch (error) {
      for (const item of batch) saved.push(saveCompanyResearch({
        company_name: item.company, status: 'failed', error: error.message, research_version: RESEARCH_VERSION
      }));
    }
  }
  return {
    total: selected.length,
    saved: saved.filter((item) => ['complete', 'partial'].includes(item.status)).length,
    complete: saved.filter((item) => item.status === 'complete').length,
    partial: saved.filter((item) => item.status === 'partial').length,
    failed: saved.filter((item) => item.status === 'failed').length
  };
}

module.exports = {
  searchBing, searchWeb, companyStem, relevantToCompany, discoverCompanyInfoPages,
  collectCompanyEvidence, researchCompanies
};

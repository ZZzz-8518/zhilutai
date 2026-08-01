const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getSettings, getJobs, getSearchCache, setSearchCache, DATA_DIR } = require('./db');
const { inferEmploymentType, normalizeList } = require('./scoring');
const { readPage, extractFacts } = require('./content');
const { getSearchWatchlist } = require('./company');

function normalizeApiBase(value) {
  const base = String(value || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function extractChatText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text || '').join('\n');
  return '';
}

function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  for (const key of ['jobs', 'reviews']) {
    const keyIndex = cleaned.indexOf(`"${key}"`);
    const arrayStart = keyIndex >= 0 ? cleaned.indexOf('[', keyIndex) : -1;
    if (arrayStart < 0) continue;
    const items = [];
    let objectStart = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = arrayStart + 1; index < cleaned.length; index += 1) {
      const char = cleaned[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') {
        if (depth === 0) objectStart = index;
        depth += 1;
      } else if (char === '}' && depth > 0) {
        depth -= 1;
        if (depth === 0 && objectStart >= 0) {
          try { items.push(JSON.parse(cleaned.slice(objectStart, index + 1))); } catch {}
          objectStart = -1;
        }
      } else if (char === ']' && depth === 0) break;
    }
    if (items.length) return { [key]: items };
  }
  throw new Error('AI 返回内容无法解析为岗位数据');
}


function decodeHtml(value = '') {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function stripHtml(value = '') {
  return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseSearchResults(html) {
  const results = [];
  const pattern = /<h3[^>]*class=["'][^"']*res-title[^"']*["'][^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a><\/h3>([\s\S]*?)(?=<\/li>)/gi;
  let match;
  while ((match = pattern.exec(String(html || ''))) !== null) {
    const attrs = match[1];
    const sourceMatch = attrs.match(/data-mdurl=["']([^"']+)["']/i) || attrs.match(/href=["']([^"']+)["']/i);
    const sourceUrl = decodeHtml(sourceMatch?.[1] || '');
    if (!/^https?:\/\//i.test(sourceUrl) || sourceUrl.includes('so.com/link?')) continue;
    const summary = match[3].match(/class=["'][^"']*(?:res-list-summary|res-desc)[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const date = stripHtml(match[3].match(/class=["'][^"']*g-c-gray[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || '');
    results.push({ title: stripHtml(match[2]), source_url: sourceUrl, snippet: stripHtml(summary?.[1] || ''), date });
  }
  return results;
}

function parseSogouResults(html) {
  const results = [];
  const blocks = String(html || '').match(/<div class=["']vrwrap["'][\s\S]*?<!--STATUS VR OK-->/gi) || [];
  for (const block of blocks) {
    const titleMatch = block.match(/<h3[^>]*class=["']vr-title["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a><\/h3>/i);
    const sourceMatch = block.match(/data-url=["'](https?:\/\/[^"']+)["']/i);
    if (!titleMatch || !sourceMatch) continue;
    const summary = block.match(/id=["']cacheresult_summary[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const dateMatches = [...block.matchAll(/<span[^>]*>(\d{4}[-年]\d{1,2}(?:[-月]\d{1,2}日?)?)[\s\S]*?<\/span>/gi)];
    results.push({
      title: stripHtml(titleMatch[1]),
      source_url: decodeHtml(sourceMatch[1]),
      snippet: stripHtml(summary?.[1] || ''),
      date: stripHtml(dateMatches.at(-1)?.[1] || '')
    });
  }
  return results;
}

function decodeBingRedirect(value) {
  try {
    const url = new URL(value);
    const encoded = url.hostname.endsWith('bing.com') ? url.searchParams.get('u') : '';
    if (encoded?.startsWith('a1')) {
      const decoded = Buffer.from(encoded.slice(2), 'base64url').toString('utf8');
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return url.toString();
  } catch { return ''; }
}

function parseJinaSearchResults(markdown) {
  const text = String(markdown || '');
  const headings = [...text.matchAll(/^## \[([^\]]+)\]\((https?:\/\/[^)]+)\)/gm)];
  return headings.map((match, index) => {
    const start = match.index + match[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    const snippet = text.slice(start, end).replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 1200);
    return {
      title: stripHtml(match[1]),
      source_url: decodeBingRedirect(match[2]),
      snippet,
      date: snippet.match(/(?:\d+\s*(?:days?|hours?) ago|\d{4}[-年]\d{1,2}(?:[-月]\d{1,2}日?)?)/i)?.[0] || ''
    };
  }).filter((item) => /^https?:\/\//i.test(item.source_url)
    && !/(?:^|\.)bing\.com$/i.test((() => { try { return new URL(item.source_url).hostname; } catch { return ''; } })()));
}

function profileSummary(profile) {
  return `
- 专业：${profile.major}
- 相近专业：${profile.related_majors || '未填写'}
- 学历：${profile.education || '未填写'}
- 学校：${profile.school || '未填写'}
- 学校所在省份：${profile.school_province || '未填写'}
- 技能：${profile.skills || '未填写'}
- 证书：${profile.certificates || '未填写'}
- 意向行业：${profile.preferred_industries || '不限'}
- 意向城市：${profile.preferred_cities || '未设置，不考虑地点偏好'}
- 单位偏好：${profile.preferred_employers || '不限'}
- 排除条件：${profile.exclusions || '无'}`;
}

function professionalSearchPlan(profile = {}) {
  const text = `${profile.major || ''} ${profile.related_majors || ''} ${profile.preferred_industries || ''} ${profile.skills || ''}`.toLowerCase();
  const related = normalizeList(profile.related_majors).slice(0, 4);
  if (/电气|电力系统|电力电子|自动化|控制工程|电机/.test(text)) {
    return {
      domain: 'electrical',
      roles: ['电气工程师', '电力系统', '电力电子', '电气设计', '电气控制', '自动化', '控制工程', '电机', '变电', '输配电', '继电保护'],
      industries: ['电网', '发电集团', '电力设计院', '电力装备', '新能源', '风电', '光伏', '核电', '储能', '车企', '轨道交通', '半导体', '数据中心'],
      transfer: ['设备电气', '厂务动力', '新能源电控', '充电桩', '测试认证', '工艺工程']
    };
  }
  if (/土木|结构|建筑|岩土|道路|桥梁|工程管理/.test(text)) {
    return {
      domain: 'civil',
      roles: ['土木工程师', '结构设计', '土建设计', '岩土工程', '工程管理', '有限元', 'CAE', '工程咨询'],
      industries: ['设计院', '建筑', '轨道交通', '电网', '电力设计院', '能源', '风电', '核电', '车企', '装备制造', '工业厂房'],
      transfer: ['厂房基建', '业主方工程管理', '设备结构', '可靠性测试', 'EPC', '数据中心基建']
    };
  }
  if (/机械|机电|车辆|材料|力学/.test(text)) {
    return {
      domain: 'mechanical',
      roles: ['机械工程师', '结构设计', '机电工程', '设备工程', '仿真分析', '工艺工程', '可靠性测试'],
      industries: ['汽车', '装备制造', '智能制造', '航空', '航天', '船舶', '新能源', '电力装备'],
      transfer: ['CAE', '有限元', '生产质量', '项目管理', '厂务设备']
    };
  }
  return {
    domain: 'general',
    roles: [profile.major, ...related].filter(Boolean),
    industries: normalizeList(profile.preferred_industries).slice(0, 10),
    transfer: normalizeList(profile.skills).slice(0, 8)
  };
}

function professionalCoverageText(profile) {
  const plan = professionalSearchPlan(profile);
  return `重点岗位方向：${plan.roles.join('、') || '按专业名称检索'}；重点行业：${plan.industries.join('、') || '按画像意向行业检索'}；可迁移方向：${plan.transfer.join('、') || '按画像技能检索'}。`;
}

function outputContract() {
  return `报名口径 eligibility 只能是：明确符合、宽口径符合、未限制专业、优先但不排他、表述模糊、明确不符合。
最终只输出一个 JSON 对象，不要 Markdown：
{"jobs":[{"title":"","company":"","city":"","district":"","source_url":"","source_name":"","apply_url":"可投递或进入网申的链接","application_channels":[{"type":"官网网申/招聘平台/邮箱/内推/线下","label":"","url":"","value":"","source_url":""}],"company_type":"央企/地方国企/事业单位/大型民企或大厂/外企/中小企业/其他","company_intro":"","company_intro_source":"","description":"","official_benefits":"","deadline":"YYYY-MM-DD或空","published_at":"YYYY-MM-DD或空","graduate_year":2027,"employment_type":"正式校招/校招+实习/待确认","eligibility":"表述模糊","fit_score":0,"reasons":[""],"gaps":[""],"historical_evidence":[{"claim":"","year":"","source_name":"","source_url":"","confidence":"高/中/低"}],"social_reviews":[{"topic":"","sentiment":"正面/中性/负面","summary":"","source_name":"小红书/抖音/知乎/牛客等","source_url":"","date":""}],"ai_summary":""}]}`;
}

function buildPrompt(profile) {
  return `你是中国校园招聘研究员。请联网搜索截至今天仍值得核验的 2027 届正式校园招聘或提前批岗位。

候选人画像：${profileSummary(profile)}

宽口径收集。只有画像填写了意向城市时才考虑地点偏好；未填写时地点不影响筛选。除非官方要求明确排除该专业，否则不要判为“明确不符合”。“某专业优先”不等于其他专业不能报名。

覆盖以下不同入口，不要只停留在搜索结果第一页或最先找到的几家公司：
- “2027年高校毕业生招聘简章”“2027届校园招聘”“2027届秋季招聘”等不同措辞
- 央企、国企、设计院、研究院、事业单位、行业甲方和大型民企
- 画像意向城市及全国岗位；画像未填写城市时不要自行假设城市偏好
- 候选人的专业名称、相近专业名称，以及“相关专业”“专业不限”等宽口径条件
- 不要把候选人限制在专业名称对应的传统行业，同时搜索画像意向行业和能力可迁移岗位
- ${professionalCoverageText(profile)}

优先引用企业官网、官方公众号文章、国聘或高校就业网。每个岗位必须有可打开的 source_url。搜索到招聘汇总页时，应继续查找具体公司公告。往届案例、待遇和社交评价没有可核验证据时返回空值，不可猜测。

${outputContract()}

排除只有实习机会、没有正式校招岗位的公告。尽量返回 15-30 个彼此不重复的岗位；当前确实不足时可以少于 15 个，但不可用旧公告或虚构内容凑数。`;
}

function buildGroundedPrompt(profile, leads) {
  const compactLeads = leads.map((lead) => ({
    title: lead.title,
    company: lead.company || '',
    city: lead.city || '',
    source_url: lead.source_url,
    source_name: lead.source_name || '',
    apply_url: lead.apply_url || '',
    application_channels: lead.application_channels || [],
    company_type: lead.company_type || '',
    snippet: String(lead.snippet || '').slice(0, 1000),
    source_text: String(lead.source_text || '').slice(0, 2500),
    deadline: lead.deadline || '',
    published_at: lead.published_at || '',
    official_benefits: lead.official_benefits || ''
  }));
  return `你是中国校园招聘信息整理员。根据下面已经检索到的网页线索，为候选人筛选 2027 届正式校招或提前批岗位。

候选人画像：${profileSummary(profile)}

规则：
1. 只能使用给定线索中的事实和 source_url，不得创造公司、待遇、日期或链接。
2. 宽口径收集。只有来源明确排除候选人专业时，才可判为“明确不符合”。
3. 搜索摘要信息不足时使用“表述模糊”，并在 gaps 中写明初审未确认的事实，交由第二轮复核。
4. 只有画像填写了意向城市时才考虑地点；未填写时地点不影响判断。无法确认公司或城市时留空。
5. 往届案例、官方待遇和外部评价没有明确证据时返回空值或空数组。
6. 排除只有实习机会的公告；同时包含正式校招和实习的公告标记为“校招+实习”。
7. 不得把原文没有写出的否定事实作为匹配理由。例如工作地点在香港或境外，不等于“非长期驻外”；未写期限或性质时必须加入 gaps 标注为尚未确认。
8. 按画像专业及技能判断能力迁移岗位，不得套用其他画像的固定行业模板。${professionalCoverageText(profile)}专业要求未读清时标为“表述模糊”并进入第二轮复核。
9. 每条必须给出 apply_url。优先官方招聘网或网申页面，其次为带“申请职位/投递简历”的高校或招聘平台详情页。application_channels 记录官网、平台、邮箱、内推或线下方式；没有替代方式时至少记录当前可投递入口。
10. 公司介绍与招聘信息分开。social_reviews 每一条都必须有 source_url；没有来源就返回空数组。company_type 必须按给定枚举分类。

网页线索：
${JSON.stringify(compactLeads)}

${outputContract()}

最多返回 20 个岗位。`;
}

function sourceName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return '公开搜索'; }
}

function urlKey(value) {
  try {
    const url = new URL(value);
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !/^utm_|^(?:from|source|spm)$/i.test(key))
      .sort(([left], [right]) => left.localeCompare(right));
    const search = params.length ? `?${new URLSearchParams(params)}` : '';
    return `${url.hostname}${url.pathname}${search}`.replace(/\/$/, '').toLowerCase();
  } catch { return ''; }
}

function mergeLead(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const preferred = incoming.watchlist_company && !existing.watchlist_company ? incoming : existing;
  const secondary = preferred === existing ? incoming : existing;
  return {
    ...secondary,
    ...preferred,
    snippet: String(preferred.snippet || '').length >= String(secondary.snippet || '').length
      ? preferred.snippet : secondary.snippet,
    source_url: preferred.source_url || secondary.source_url,
    company: preferred.company || secondary.company || '',
    apply_url: preferred.apply_url || secondary.apply_url || '',
    company_type: preferred.company_type || secondary.company_type || '',
    application_channels: (preferred.application_channels || []).length
      ? preferred.application_channels : (secondary.application_channels || [])
  };
}

function normalizeFitScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  const percentage = number > 0 && number <= 1 ? number * 100 : number > 1 && number <= 10 ? number * 10 : number;
  return Math.round(Math.max(0, Math.min(100, percentage)));
}

function descriptionQuality(value, title = '') {
  const text = String(value || '').trim();
  if (!text) return -1000;
  let score = Math.min(text.length, 1200) / 30;
  if (/岗位要求|招聘对象|专业|学历|工作内容|需求方向/.test(text)) score += 25;
  if (/土木|结构|工程|力学|制造|能源|电力|机械|专业不限/.test(text)) score += 20;
  if (/未经51job|版权所有|&copy;|document\.write|-->|<script/i.test(text)) score -= 120;
  if (/2027/.test(title) && /2026/.test(text) && !/2027/.test(text)) score -= 100;
  return score;
}

function pickBestDescription(title, ...values) {
  return values.filter(Boolean).sort((left, right) => descriptionQuality(right, title) - descriptionQuality(left, title))[0] || '';
}

function normalizeJobs(value, allowedUrls = null) {
  const allowed = allowedUrls ? new Map(allowedUrls.map((url) => [urlKey(url), url])) : null;
  return (Array.isArray(value) ? value : []).slice(0, 20).filter((job) => {
    if (!job?.title || !job?.source_url) return false;
    return !allowed || allowed.has(urlKey(job.source_url));
  }).map((job) => ({
    ...job,
    source_url: allowed?.get(urlKey(job.source_url)) || job.source_url,
    source_name: job.source_name || sourceName(job.source_url),
    apply_url: /^https?:\/\//i.test(job.apply_url || '') ? job.apply_url : job.source_url,
    application_channels: Array.isArray(job.application_channels) ? job.application_channels : [],
    company_type: ['央企', '地方国企', '事业单位', '大型民企或大厂', '外企', '中小企业', '其他'].includes(job.company_type) ? job.company_type : '其他',
    company_intro: String(job.company_intro || ''),
    company_intro_source: /^https?:\/\//i.test(job.company_intro_source || '') ? job.company_intro_source : '',
    graduate_year: 2027,
    employment_type: ['正式校招', '校招+实习', '待确认'].includes(job.employment_type)
      ? job.employment_type : inferEmploymentType(`${job.title || ''} ${job.description || ''}`),
    fit_score: normalizeFitScore(job.fit_score),
    reasons: Array.isArray(job.reasons) ? job.reasons : [],
    gaps: Array.isArray(job.gaps) ? job.gaps : [],
    historical_evidence: Array.isArray(job.historical_evidence) ? job.historical_evidence : [],
    social_reviews: Array.isArray(job.social_reviews)
      ? job.social_reviews.filter((review) => review && /^https?:\/\//i.test(review.source_url || ''))
      : []
  })).filter((job) => job.employment_type !== '实习');
}

function isFallbackRelevant(profile, lead) {
  const text = `${lead.title || ''} ${lead.company || ''} ${lead.snippet || ''}`;
  if (/校园大使|纯实习|实习生招募/.test(text)) return false;
  try {
    const url = new URL(lead.source_url);
    if ((url.pathname === '/' || /\/h\.php$|\/zhaopin\//i.test(url.pathname)) && !lead.company) return false;
    if (/mp\.weixin\.qq\.com\/count\//i.test(lead.source_url)) return false;
  } catch { return false; }
  // 重点企业是通过逐家公司定向检索得到的。搜索摘要常常不展示完整专业列表，
  // 因此先作为“表述模糊”保留，不能在模型异常时仅凭摘要把整家公司删掉。
  if (lead.watchlist_company === true) return true;
  if (!lead.company && /就业信息网|招聘信息[_ |]|校园招聘资料|招聘信息$/.test(lead.title || '')) return false;
  const profileTerms = [profile.major, ...normalizeList(profile.related_majors), ...normalizeList(profile.skills)]
    .filter((term) => String(term).length >= 2);
  if (profileTerms.some((term) => text.toLowerCase().includes(String(term).toLowerCase()))) return true;
  const plan = professionalSearchPlan(profile);
  const planTerms = [...plan.roles, ...plan.industries, ...plan.transfer].filter((term) => String(term).length >= 2);
  if (planTerms.some((term) => text.toLowerCase().includes(String(term).toLowerCase()))) return true;
  return /专业不限|不限专业/.test(text);
}

function searchOnlyJobs(leads, profile) {
  return leads.filter((lead) => isFallbackRelevant(profile, lead)).slice(0, 12).map((lead) => ({
    title: lead.title,
    company: lead.company || '',
    city: lead.city || (/济南/.test(`${lead.title} ${lead.snippet}`) ? '济南' : ''),
    district: '',
    source_url: lead.source_url,
    source_name: sourceName(lead.source_url),
    apply_url: lead.apply_url || lead.source_url,
    application_channels: lead.application_channels || [{ type: '招聘平台', label: '查看公告并投递', url: lead.apply_url || lead.source_url, source_url: lead.source_url }],
    company_type: lead.company_type || '其他',
    company_intro: lead.company_intro || '',
    company_intro_source: lead.company_intro_source || '',
    description: lead.snippet,
    official_benefits: '',
    deadline: '',
    published_at: '',
    graduate_year: 2027,
    employment_type: inferEmploymentType(`${lead.title} ${lead.snippet}`),
    eligibility: '表述模糊',
    fit_score: 50,
    reasons: ['来自公开搜索结果，尚未完成 AI 初审与复核'],
    gaps: ['专业、学历和截止时间尚未由模型从原文确认'],
    historical_evidence: [],
    social_reviews: [],
    ai_summary: ''
  }));
}

function roundRobin(groups) {
  const output = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) if (group[index]) output.push(group[index]);
  }
  return output;
}

async function settleWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = { status: 'fulfilled', value: await task(items[index], index) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

async function fetchSourceJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(25_000)
  });
  const body = await response.json();
  if (!response.ok || body?.success === false) throw new Error(body?.message || `数据源请求失败 (${response.status})`);
  return body?.result;
}

async function collect91JobSource(source) {
  const site = new URL(source.url);
  const schoolCode = site.pathname.match(/\/sub-station\/home\/(\d+)/)?.[1];
  if (!schoolCode) return [];
  const origin = site.origin;
  const websiteId = await fetchSourceJson(`${origin}/web/wsjysc/wzsy/getWzid?xxdm=${encodeURIComponent(schoolCode)}&wzlx=0`);
  const modules = await fetchSourceJson(`${origin}/web/wsjysc/wzsy/getWzmb?wzid=${encodeURIComponent(websiteId)}&mkdm=zpxx`);
  const jobModule = (modules || []).find((item) => item.lmlx === '8' || item.lmmc === '招聘岗位');
  if (!jobModule?.dylm) return [];
  const companies = await fetchSourceJson(`${origin}/web/wsjysc/wzsy/getLbsj?lmid=${encodeURIComponent(jobModule.dylm)}&row=60`);
  const leads = [];
  for (const company of companies || []) {
    const positions = Array.isArray(company.zpzw) ? company.zpzw : [];
    const campaign = positions.find((position) => /2027|27届/.test(position.zwmc || ''));
    if (!campaign) continue;
    const cities = [...new Set(positions.map((position) => position.gzdd).filter(Boolean))];
    const details = positions.slice(0, 18).map((position) => [
      position.zwmc,
      position.xlyq && `学历${position.xlyq}`,
      position.gzdd,
      position.yjnx && `薪酬${position.yjnx}万元/年`
    ].filter(Boolean).join('，'));
    leads.push({
      title: campaign.zwmc || `${company.dwmc || '招聘单位'} 2027届校园招聘`,
      company: company.dwmc || '',
      city: cities.join('、'),
      source_url: `${origin}/sub-station/jobDetails?zpgwid=${encodeURIComponent(campaign.zpgwid)}&xxdm=${encodeURIComponent(schoolCode)}`,
      apply_url: `${origin}/sub-station/jobDetails?zpgwid=${encodeURIComponent(campaign.zpgwid)}&xxdm=${encodeURIComponent(schoolCode)}`,
      application_channels: [{
        type: '招聘平台',
        label: `${source.name || '学校就业网'}申请职位`,
        url: `${origin}/sub-station/jobDetails?zpgwid=${encodeURIComponent(campaign.zpgwid)}&xxdm=${encodeURIComponent(schoolCode)}`,
        source_url: `${origin}/sub-station/jobDetails?zpgwid=${encodeURIComponent(campaign.zpgwid)}&xxdm=${encodeURIComponent(schoolCode)}`
      }],
      source_name: source.name || `${schoolCode} 就业网`,
      snippet: details.join('；').slice(0, 5000),
      date: company.zzshsj || ''
    });
  }
  return leads;
}

async function collectConfiguredSources(sourceSites = []) {
  const enabled = (Array.isArray(sourceSites) ? sourceSites : []).filter((source) => source?.enabled !== false && /^https?:\/\//i.test(source?.url || ''));
  const results = await Promise.allSettled(enabled.map(async (source) => {
    const url = new URL(source.url);
    if (url.hostname.endsWith('91job.org.cn') && /\/sub-station\/home\/\d+/.test(url.pathname)) return collect91JobSource(source);
    return [];
  }));
  return results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
}

function normalizeSchoolName(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[\s·•・，,。．]/g, '')
    .replace(/[（(](?:本部|主校区|徐州校区)[）)]$/g, '')
    .replace(/(?:本部|主校区|徐州校区)$/g, '');
}

function normalizeProvince(value) {
  return String(value || '').trim().replace(/[\s·•・]/g, '')
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/g, '');
}

function sourceAvailableForProfile(source, profile = {}) {
  if (!source || source.enabled === false || !/^https?:\/\//i.test(source.url || '')) return false;
  const scope = ['school', 'province'].includes(source.access_scope) ? source.access_scope : 'public';
  if (scope === 'public') return true;
  if (scope === 'province') {
    return Boolean(normalizeProvince(profile.school_province)
      && normalizeProvince(profile.school_province) === normalizeProvince(source.province));
  }
  const profileSchool = normalizeSchoolName(profile.school);
  const schools = [source.school, ...(Array.isArray(source.school_aliases) ? source.school_aliases : [])]
    .map(normalizeSchoolName).filter(Boolean);
  return Boolean(profileSchool && schools.includes(profileSchool));
}

function getProfileSourceSites(sourceSites = [], profile = {}) {
  return (Array.isArray(sourceSites) ? sourceSites : []).filter((source) => sourceAvailableForProfile(source, profile));
}

function buildPublicSearchQueries(profile, settings = {}) {
  const major = String(profile.major || '').trim();
  const relatedMajors = normalizeList(profile.related_majors).slice(0, 3);
  const industries = normalizeList(profile.preferred_industries).slice(0, 6);
  const skills = normalizeList(profile.skills).slice(0, 6);
  const preferredCities = normalizeList(profile.preferred_cities).slice(0, 5);
  const professionTerms = [major, ...relatedMajors].filter(Boolean);
  const plan = professionalSearchPlan(profile);
  const relevantWatchlist = getSearchWatchlist(profile);
  const employerQueries = [];
  for (const item of relevantWatchlist) employerQueries.push(`${item.name} 2027届 提前批 校园招聘`);
  return [
    `2027年 高校毕业生 招聘简章 ${major}`,
    `2027届 校园招聘 ${major}`,
    `2027届 秋季招聘 ${major}`,
    `2027年 应届毕业生 招聘 ${major}`,
    `2027届 央企 国企 招聘 ${major}`,
    `2027届 设计院 招聘 ${major}`,
    ...preferredCities.map((city) => `2027届 ${city} 校园招聘 ${major}`),
    `2027届 校园招聘 ${major} ${plan.roles.slice(0, 8).join(' ')}`,
    `2027届 校园招聘 ${major} ${plan.industries.slice(0, 7).join(' ')}`,
    `2027届 校园招聘 ${major} ${plan.transfer.slice(0, 6).join(' ')}`,
    ...(skills.length ? [`2027届 校园招聘 ${major} ${skills.join(' ')}`] : []),
    ...employerQueries,
    ...(settings.source_sites || []).filter((site) => site?.enabled !== false && site?.url
      && !/xiaohongshu\.com|douyin\.com|zhihu\.com|nowcoder\.com|yingjiesheng\.com|bilibili\.com/i.test(site.url)).map((site) => {
      try { return `site:${new URL(site.url).hostname} ${site.name || ''} 2027届 校园招聘 ${major} ${plan.roles.slice(0, 3).join(' ')}`; }
      catch { return ''; }
    }).filter(Boolean),
    ...industries.map((term) => `2027届 校园招聘 ${term} ${major}`),
    ...professionTerms.slice(1).map((term) => `2027届 校园招聘 ${term}`)
  ];
}

async function searchJinaBing(query) {
  const cacheKey = `jina-bing-v1:${crypto.createHash('sha256').update(query).digest('hex')}`;
  const cached = getSearchCache(cacheKey, 8 * 60 * 60 * 1000);
  if (Array.isArray(cached)) return cached;
  const target = `http://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(`https://r.jina.ai/${target}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/markdown' },
    signal: AbortSignal.timeout(35_000)
  });
  if (!response.ok) throw new Error(`公开搜索失败 (${response.status})`);
  const results = parseJinaSearchResults(await response.text());
  setSearchCache(cacheKey, results);
  return results;
}

async function searchPublicLeads(profile, settings = {}) {
  const queries = buildPublicSearchQueries(profile, settings);
  const watchlist = getSearchWatchlist(profile);
  async function fetchPage(url, parser) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
        signal: AbortSignal.timeout(18_000)
      });
      return response.ok ? parser(await response.text()) : [];
    } catch { return []; }
  }
  const uniqueQueries = [...new Set(queries)];
  const queryGroups = new Array(uniqueQueries.length).fill(null).map(() => []);
  await settleWithConcurrency(uniqueQueries, 5, async (query, index) => {
    const cacheKey = `public-query-v5:${crypto.createHash('sha256').update(query).digest('hex')}`;
    const cached = getSearchCache(cacheKey, 2 * 60 * 60 * 1000);
    let results = Array.isArray(cached) ? cached : null;
    if (!results) {
      const encoded = encodeURIComponent(query);
      results = await fetchPage(`https://www.sogou.com/web?query=${encoded}`, parseSogouResults);
      if (results.length < 2) {
        try { results.push(...await searchJinaBing(query)); } catch {}
      }
      const byResultUrl = new Map();
      for (const item of results) if (!byResultUrl.has(urlKey(item.source_url))) byResultUrl.set(urlKey(item.source_url), item);
      results = [...byResultUrl.values()];
      setSearchCache(cacheKey, results);
    }
    const queriedCompanies = watchlist.filter((item) => query.includes(item.name));
    queryGroups[index] = results.map((lead) => {
      const text = `${lead.title || ''} ${lead.snippet || ''}`;
      const company = queriedCompanies.find((item) => item.aliases.some((alias) => text.includes(alias)));
      if (!company?.recruitment_url) return lead;
      return {
        ...lead,
        company: company.name,
        watchlist_company: true,
        apply_url: company.recruitment_url,
        company_type: company.company_type,
        application_channels: [{
          type: '官网网申', label: `${company.name}校园招聘官网`, url: company.recruitment_url, source_url: lead.source_url
        }]
      };
    });
  });
  const unique = new Map();
  for (const lead of roundRobin(queryGroups)) {
    const text = `${lead.title} ${lead.snippet}`;
    const relevant = /(?:2027|27届)/.test(text) && /(校招|校园招聘|高校毕业生|应届毕业生|秋季招聘|招聘简章|提前批|全球招聘|正式启动)/i.test(text);
    if (relevant && inferEmploymentType(text) !== '实习') {
      const key = urlKey(lead.source_url);
      unique.set(key, mergeLead(unique.get(key), lead));
    }
  }
  return { leads: [...unique.values()].slice(0, 120), query_count: uniqueQueries.length };
}

function writeDiagnostic(name, content) {
  fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'logs', name), String(content || ''), 'utf8');
}

async function discoverWithPublicSearch(profile, settings) {
  const sourceSites = getProfileSourceSites(settings.source_sites, profile);
  const profileSettings = { ...settings, source_sites: sourceSites };
  const [searchResult, direct] = await Promise.all([
    searchPublicLeads(profile, profileSettings),
    collectConfiguredSources(sourceSites)
  ]);
  const searched = searchResult.leads;
  const unique = new Map();
  for (const lead of roundRobin([direct, searched])) {
    const key = urlKey(lead.source_url);
    unique.set(key, mergeLead(unique.get(key), lead));
  }
  const refreshBefore = Date.now() - 12 * 60 * 60 * 1000;
  const known = new Map(getJobs().map((job) => [urlKey(job.source_url), new Date(job.last_seen_at || 0).getTime()]));
  const leads = [...unique.values()].filter((lead) => (known.get(urlKey(lead.source_url)) || 0) < refreshBefore).slice(0, 60);
  const searchStats = { query_count: searchResult.query_count, searched_count: searched.length, direct_count: direct.length, candidate_count: leads.length };
  if (!leads.length) return { jobs: [], citations: [], response_id: 'no-new-results', search_stats: searchStats };
  return { ...(await structureLeadsWithChat(profile, settings, leads)), search_stats: searchStats };
}

function configuredProvider(settings) {
  return { api_base: settings.api_base, api_key: settings.api_key, model: settings.model };
}

const ELIGIBILITY_ORDER = ['明确不符合', '表述模糊', '优先但不排他', '未限制专业', '宽口径符合', '明确符合'];
const COMPANY_TYPES = ['央企', '地方国企', '事业单位', '大型民企或大厂', '外企', '中小企业', '其他'];

function mergeChannels(primary = [], secondary = [], fallbackUrl = '') {
  const unique = new Map();
  for (const channel of [...primary, ...secondary]) {
    if (!channel || typeof channel !== 'object') continue;
    const url = /^https?:\/\//i.test(channel.url || '') ? channel.url : '';
    const value = String(channel.value || '').trim();
    const key = `${channel.type || ''}|${url}|${value}`;
    if (url || value) unique.set(key, { ...channel, url, value });
  }
  if (!unique.size && fallbackUrl) {
    unique.set(`招聘平台|${fallbackUrl}|`, { type: '招聘平台', label: '查看公告并投递', url: fallbackUrl, source_url: fallbackUrl });
  }
  return [...unique.values()];
}

async function reviewJobsWithSecondary(profile, settings, leads, jobs) {
  if (!settings.api_key || !jobs.length) return jobs;
  const leadFacts = leads.map((lead) => ({
    title: lead.title,
    source_url: lead.source_url,
    source_text: String(lead.source_text || lead.snippet || '').slice(0, 1500)
  }));
  const prompt = `你是校园招聘复核员。请独立核验初审结果，只能依据给定招聘原文和搜索摘录，不得补写摘录中没有的事实。

候选人画像：${profileSummary(profile)}

初审结果：${JSON.stringify(jobs)}
来源摘录：${JSON.stringify(leadFacts)}

逐条复核专业报名口径、适配度、截止日期、公司类型和投递入口。没有明确专业要求时不能称为“专业不限”。apply_url 必须是官方招聘网、网申页，或确实带申请/投递功能的招聘平台详情页。邮箱、内推、线下双选会等放入 application_channels。社交评价只能保留摘录中带原始链接的内容，没有来源则留空。只输出 JSON：
{"reviews":[{"source_url":"","eligibility":"明确符合/宽口径符合/未限制专业/优先但不排他/表述模糊/明确不符合","fit_score":0,"deadline":"YYYY-MM-DD或空","apply_url":"","application_channels":[{"type":"官网网申/招聘平台/邮箱/内推/线下","label":"","url":"","value":"","source_url":""}],"company_type":"央企/地方国企/事业单位/大型民企或大厂/外企/中小企业/其他","social_reviews":[{"topic":"待遇/笔试/面试/工作体验","sentiment":"正面/中性/负面","summary":"","source_name":"平台名","source_url":"原始链接","date":""}],"issues":[""],"summary":""}]}`;
  let rawModelText = '';
  try {
    const response = await fetch(`${normalizeApiBase(settings.api_base)}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: '严格依据来源复核校园招聘信息，只输出 JSON。' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000
      }),
      signal: AbortSignal.timeout(60_000)
    });
    const body = JSON.parse(await response.text());
    if (!response.ok) throw new Error(body?.error?.message || `AI 复核失败 (${response.status})`);
    rawModelText = extractChatText(body);
    const parsed = parseJson(rawModelText);
    const reviews = new Map((parsed.reviews || []).map((review) => [urlKey(review.source_url), review]));
    return jobs.map((job) => {
      const review = reviews.get(urlKey(job.source_url));
      if (!review) return job;
      const primaryRank = ELIGIBILITY_ORDER.indexOf(job.eligibility);
      const reviewRank = ELIGIBILITY_ORDER.indexOf(review.eligibility);
      const eligibility = reviewRank >= 0 && (primaryRank < 0 || reviewRank < primaryRank) ? review.eligibility : job.eligibility;
      const reviewFit = normalizeFitScore(review.fit_score);
      const fitScore = Math.round((normalizeFitScore(job.fit_score) + reviewFit) / 2);
      const applyUrl = /^https?:\/\//i.test(review.apply_url || '') ? review.apply_url : (job.apply_url || job.source_url);
      const issues = Array.isArray(review.issues) ? review.issues.filter(Boolean) : [];
      const socialReviews = [...(job.social_reviews || []), ...(Array.isArray(review.social_reviews) ? review.social_reviews : [])]
        .filter((item) => item && /^https?:\/\//i.test(item.source_url || ''))
        .filter((item, index, all) => all.findIndex((candidate) => candidate.source_url === item.source_url) === index);
      return {
        ...job,
        eligibility,
        fit_score: fitScore,
        deadline: /^20\d{2}-\d{2}-\d{2}$/.test(review.deadline || '') ? review.deadline : job.deadline,
        apply_url: applyUrl,
        application_channels: mergeChannels(job.application_channels, review.application_channels, applyUrl),
        company_type: COMPANY_TYPES.includes(review.company_type) ? review.company_type : job.company_type,
        social_reviews: socialReviews,
        gaps: [...new Set([...(job.gaps || []), ...issues])],
        ai_summary: [job.ai_summary, review.summary && `复审：${review.summary}`].filter(Boolean).join('\n')
      };
    });
  } catch (error) {
    writeDiagnostic('last-secondary-review-error.txt', `${error.stack || error.message}\n\n--- model output ---\n${rawModelText.slice(0, 30_000)}`);
    return jobs;
  }
}

async function attachSourceContent(leads, force = false) {
  const selected = leads.slice(0, 20);
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const index = cursor;
      cursor += 1;
      const lead = selected[index];
      try {
        const page = await readPage(lead.source_url, { force });
        const facts = extractFacts(page.text);
        selected[index] = {
          ...lead,
          ...Object.fromEntries(Object.entries(facts).filter(([, value]) => value)),
          source_text: page.text.slice(0, 2500),
          source_read_at: page.read_at,
          source_excerpt: page.text.slice(0, 20_000)
        };
      } catch (error) {
        selected[index] = { ...lead, source_read_error: error.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, worker));
  return selected;
}

function applySourceFacts(jobs, leads) {
  const byUrl = new Map(leads.map((lead) => [urlKey(lead.source_url), lead]));
  return jobs.map((job) => {
    const lead = byUrl.get(urlKey(job.source_url));
    if (!lead) return job;
    return {
      ...job,
      city: lead.city || job.city,
      deadline: lead.deadline || job.deadline,
      published_at: lead.published_at || job.published_at,
      official_benefits: lead.official_benefits || job.official_benefits,
      description: lead.description || job.description || lead.snippet || '',
      apply_url: lead.apply_url || job.apply_url || lead.source_url,
      application_channels: (job.application_channels || []).length
        ? job.application_channels
        : (lead.application_channels || [{ type: '招聘平台', label: '查看公告并投递', url: lead.apply_url || lead.source_url, source_url: lead.source_url }]),
      historical_evidence: (job.historical_evidence || []).length ? job.historical_evidence : (lead.historical_evidence || []),
      social_reviews: ((job.social_reviews || []).length ? job.social_reviews : (lead.social_reviews || []))
        .filter((review) => review && /^https?:\/\//i.test(review.source_url || '')),
      company_intro: job.company_intro || lead.company_intro || '',
      company_intro_source: job.company_intro_source || lead.company_intro_source || '',
      source_read_at: lead.source_read_at || '',
      source_excerpt: lead.source_excerpt || ''
    };
  });
}

function removeUnsupportedInferences(jobs, leads, profile) {
  const byUrl = new Map(leads.map((lead) => [urlKey(lead.source_url), lead]));
  const excludesLongPosting = /长期驻外|驻外/.test(profile.exclusions || '');
  return jobs.map((job) => {
    const sourceText = byUrl.get(urlKey(job.source_url))?.source_text || '';
    const unsupportedPostingClaim = !/(?:非|无需|不需要|不属于)长期?驻外/.test(sourceText);
    const unsupportedOpenMajor = job.eligibility === '未限制专业'
      && !/(?:专业(?:要求)?(?:为)?不限|不限专业|不限学科|专业不作限制|不限制专业)/.test(sourceText);
    const eligibility = unsupportedOpenMajor ? '表述模糊' : job.eligibility;
    const reasons = (job.reasons || []).filter((reason) => {
      if (unsupportedPostingClaim && /(?:非|不属于|无需|不需要)长期?驻外/.test(reason)) return false;
      if (unsupportedOpenMajor && /专业(?:要求)?(?:为)?不限|不限专业|均可投|可投递/.test(reason)) return false;
      return true;
    });
    const gaps = [...(job.gaps || [])];
    if (unsupportedOpenMajor && !gaps.some((gap) => /专业要求/.test(gap))) {
      gaps.push('当前原文未明确展示专业要求，不能视为专业不限；系统保留原文入口供进一步核验');
    }
    if (excludesLongPosting && /香港|澳门|海外|境外|国外/.test(job.city || '') && unsupportedPostingClaim
      && !gaps.some((gap) => /驻外/.test(gap))) {
      gaps.push('工作地点可能触发画像中的驻外排除条件，但原文未说明派驻性质或期限');
    }
    return { ...job, eligibility, reasons, gaps };
  });
}

async function structureLeadBatchWithChat(profile, settings, leads, sourceAttached = false) {
  const groundedLeads = sourceAttached ? leads : await attachSourceContent(leads);
  const provider = configuredProvider(settings);
  const url = `${normalizeApiBase(provider.api_base)}/chat/completions`;
  let rawModelText = '';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${provider.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: '严格依据用户提供的招聘原文整理岗位，并只输出 JSON。原文明确字段优先于搜索摘要。' },
          { role: 'user', content: buildGroundedPrompt(profile, groundedLeads) }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 6000
      }),
      signal: AbortSignal.timeout(75_000)
    });
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);
    if (!response.ok) throw new Error(body?.error?.message || `兼容接口请求失败 (${response.status})`);
    rawModelText = extractChatText(body);
    const parsed = parseJson(rawModelText);
    const primaryJobs = removeUnsupportedInferences(
      applySourceFacts(normalizeJobs(parsed.jobs, groundedLeads.map((lead) => lead.source_url)), groundedLeads),
      groundedLeads,
      profile
    );
    const represented = new Set(primaryJobs.map((job) => urlKey(job.source_url)));
    const omittedFallbackJobs = removeUnsupportedInferences(
      applySourceFacts(searchOnlyJobs(groundedLeads.filter((lead) => !represented.has(urlKey(lead.source_url))), profile), groundedLeads),
      groundedLeads,
      profile
    );
    const reviewedPrimaryJobs = await reviewJobsWithSecondary(profile, settings, groundedLeads, primaryJobs);
    const combined = new Map();
    for (const job of [...reviewedPrimaryJobs, ...omittedFallbackJobs]) combined.set(urlKey(job.source_url), job);
    const jobs = [...combined.values()];
    if (jobs.length) {
      return { jobs, citations: groundedLeads.map((lead) => ({ url: lead.source_url, title: lead.title })), response_id: body.id || 'public-search' };
    }
  } catch (error) {
    writeDiagnostic('last-ai-fallback-error.txt', `${error.stack || error.message}\n\n--- model output ---\n${rawModelText.slice(0, 30_000)}`);
  }
  const fallbackJobs = removeUnsupportedInferences(applySourceFacts(searchOnlyJobs(groundedLeads, profile), groundedLeads), groundedLeads, profile);
  return {
    // 初审已经失败时不重复发送同一批证据；保留为“表述模糊”，后续可单条补全。
    jobs: fallbackJobs,
    citations: groundedLeads.map((lead) => ({ url: lead.source_url, title: lead.title })),
    response_id: 'search-only'
  };
}

async function structureLeadsWithChat(profile, settings, leads, sourceAttached = false) {
  const selected = leads.slice(0, 60);
  const jobsByUrl = new Map();
  const citationsByUrl = new Map();
  const responseIds = [];
  const batches = [];
  for (let index = 0; index < selected.length; index += 6) batches.push(selected.slice(index, index + 6));
  const settledBatches = await settleWithConcurrency(batches, 2,
    (batch) => structureLeadBatchWithChat(profile, settings, batch, sourceAttached));
  for (const settled of settledBatches) {
    if (settled.status !== 'fulfilled') continue;
    const result = settled.value;
    for (const job of result.jobs || []) jobsByUrl.set(urlKey(job.source_url), job);
    for (const citation of result.citations || []) citationsByUrl.set(urlKey(citation.url), citation);
    if (result.response_id) responseIds.push(result.response_id);
  }
  return {
    jobs: [...jobsByUrl.values()],
    citations: [...citationsByUrl.values()],
    response_id: responseIds.length > 1 ? `batch-${responseIds.length}` : (responseIds[0] || 'search-only')
  };
}

async function enrichJobFromSource(job, profile) {
  if (!job?.source_url) throw new Error('这个岗位没有招聘原文链接');
  const settings = getSettings(true);
  const page = await readPage(job.source_url, { force: true });
  const facts = extractFacts(page.text);
  const lead = {
    title: job.title,
    company: job.company,
    city: facts.city || job.city,
    source_url: job.source_url,
    snippet: job.description,
    ...facts,
    source_text: page.text.slice(0, 12_000),
    source_read_at: page.read_at,
    source_excerpt: page.text.slice(0, 20_000)
  };
  const result = await structureLeadsWithChat(profile, settings, [lead], true);
  const analysed = result.jobs[0] || {};
  return {
    ...job,
    ...analysed,
    title: analysed.title || job.title,
    company: analysed.company || job.company,
    source_url: job.source_url,
    source_name: job.source_name,
    city: facts.city || analysed.city || job.city,
    deadline: facts.deadline || analysed.deadline || job.deadline,
    published_at: facts.published_at || analysed.published_at || job.published_at,
    official_benefits: facts.official_benefits || analysed.official_benefits || job.official_benefits,
    description: pickBestDescription(analysed.title || job.title, facts.description, analysed.description, job.description),
    source_read_at: page.read_at,
    source_excerpt: page.text.slice(0, 20_000)
  };
}

async function discoverJobs(profile) {
  const settings = getSettings(true);
  if (!settings.api_key) throw new Error('请先在采集设置中填写 API Key');
  return discoverWithPublicSearch(profile, settings);
}

module.exports = {
  discoverJobs, parseJson, buildPrompt, normalizeApiBase,
  parseSearchResults, parseSogouResults, normalizeJobs,
  parseJinaSearchResults, decodeBingRedirect, mergeLead,
  attachSourceContent, applySourceFacts, enrichJobFromSource, roundRobin, settleWithConcurrency,
  removeUnsupportedInferences, normalizeFitScore, descriptionQuality, pickBestDescription,
  collect91JobSource, collectConfiguredSources, isFallbackRelevant,
  searchOnlyJobs,
  buildPublicSearchQueries, searchJinaBing, searchPublicLeads,
  normalizeSchoolName, normalizeProvince, sourceAvailableForProfile, getProfileSourceSites,
  professionalSearchPlan
};

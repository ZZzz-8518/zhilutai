const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeApiBase, parseJson, parseSearchResults, parseSogouResults,
  roundRobin, removeUnsupportedInferences, normalizeFitScore, settleWithConcurrency,
  isFallbackRelevant, buildPublicSearchQueries, pickBestDescription, sourceAvailableForProfile, getProfileSourceSites,
  professionalSearchPlan
} = require('../src/ai');

test('自动给第三方接口地址补充 /v1', () => {
  assert.equal(normalizeApiBase('https://laoni.cloud'), 'https://laoni.cloud/v1');
  assert.equal(normalizeApiBase('https://example.com/openai/'), 'https://example.com/openai/v1');
});

test('不会重复添加 /v1', () => {
  assert.equal(normalizeApiBase('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
});

test('兼容代码块包裹的 JSON', () => {
  assert.deepEqual(parseJson('```json\n{"jobs":[]}\n```'), { jobs: [] });
});

test('提取公开搜索结果的原始链接与摘要', () => {
  const html = `<li><h3 class="res-title"><a href="https://www.so.com/link?a=1" data-mdurl="https://career.example.com/job/1">某公司<em>2027届</em>校园招聘</a></h3><span class="g-c-gray">2026年7月</span><span class="res-list-summary">面向应届毕业生招聘研发岗位</span></li>`;
  assert.deepEqual(parseSearchResults(html), [{
    title: '某公司 2027届 校园招聘',
    source_url: 'https://career.example.com/job/1',
    snippet: '面向应届毕业生招聘研发岗位',
    date: '2026年7月'
  }]);
});

test('提取搜狗结果中的直接来源链接', () => {
  const html = `<div class="vrwrap"><h3 class="vr-title"><a href="/link?a=1">某设计院<em>2027届</em>校园招聘</a></h3><div id="cacheresult_summary_1">招聘土木工程毕业生</div><div data-url="https://career.example.com/2027"></div></div><!--STATUS VR OK-->`;
  assert.deepEqual(parseSogouResults(html)[0], {
    title: '某设计院 2027届 校园招聘',
    source_url: 'https://career.example.com/2027',
    snippet: '招聘土木工程毕业生',
    date: ''
  });
});

test('土木画像同时生成电力、汽车、制造业和能力型检索词', () => {
  const queries = buildPublicSearchQueries({
    major: '土木工程', related_majors: '结构工程、岩土工程',
    skills: 'ABAQUS、SAP2000、CAD', preferred_industries: '新能源车企、智能制造、传统电力以及能源行业'
  }).join('\n');
  assert.match(queries, /土木工程师.*结构设计.*岩土工程.*有限元.*CAE/);
  assert.match(queries, /设计院.*轨道交通.*电网.*电力设计院/);
  assert.match(queries, /厂房基建.*业主方工程管理.*设备结构/);
  assert.match(queries, /ABAQUS/);
  assert.match(queries, /新能源车企/);
});

test('电气画像使用电气岗位词且不混入土木固定模板', () => {
  const profile = { major: '电气工程', related_majors: '自动化、电力系统', skills: 'PLC、MATLAB', preferred_industries: '电网、新能源' };
  const plan = professionalSearchPlan(profile);
  const queries = buildPublicSearchQueries(profile).join('\n');
  assert.equal(plan.domain, 'electrical');
  assert.match(queries, /电气工程师.*电力系统.*电力电子.*电气设计/);
  assert.match(queries, /电网.*发电集团.*电力设计院.*电力装备/);
  assert.match(queries, /设备电气.*厂务动力.*新能源电控/);
  assert.doesNotMatch(queries, /土建工程师|岩土工程|厂房基建/);
});

test('公开搜索会定向覆盖重点企业，而不是只依赖行业关键词', () => {
  const queries = buildPublicSearchQueries({ major: '土木工程', related_majors: '', preferred_industries: '' }, { source_sites: [] }).join('\n');
  assert.match(queries, /国家电网/);
  assert.match(queries, /比亚迪/);
  assert.match(queries, /中国航天科技/);
  assert.match(queries, /山东能源集团/);
  assert.match(queries, /2027届 校园招聘 提前批 秋招/);
});

test('不同搜索方向按轮次交错，避免传统行业占满前排', () => {
  assert.deepEqual(roundRobin([['传统1', '传统2'], ['能源1', '能源2'], ['车企1']]), [
    '传统1', '能源1', '车企1', '传统2', '能源2'
  ]);
});

test('来源按画像学校和省份授权，公共及旧来源始终可用', () => {
  const sources = [
    { name: '公共平台', url: 'https://public.example.com' },
    { name: '矿大就业网', url: 'https://cumt.example.com', access_scope: 'school', school: '中国矿业大学' },
    { name: '山大就业网', url: 'https://sdu.example.com', access_scope: 'school', school: '山东大学' },
    { name: '江苏平台', url: 'https://js.example.com', access_scope: 'province', province: '江苏省' },
    { name: '山东平台', url: 'https://sd.example.com', access_scope: 'province', province: '山东' }
  ];
  const available = getProfileSourceSites(sources, { school: '中国矿业大学（徐州校区）', school_province: '江苏' });
  assert.deepEqual(available.map((source) => source.name), ['公共平台', '矿大就业网', '江苏平台']);
  assert.equal(sourceAvailableForProfile(sources[2], { school: '中国矿业大学', school_province: '江苏' }), false);
});

test('未填写学校和省份时不会误用受限来源', () => {
  assert.equal(sourceAvailableForProfile({ url: 'https://school.example.com', access_scope: 'school', school: '某大学' }, {}), false);
  assert.equal(sourceAvailableForProfile({ url: 'https://province.example.com', access_scope: 'province', province: '山东' }, {}), false);
  assert.equal(sourceAvailableForProfile({ url: 'https://legacy.example.com' }, {}), true);
});

test('联网搜索按小批次并发且保留失败结果', async () => {
  let active = 0;
  let peak = 0;
  const results = await settleWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (value === 4) throw new Error('测试失败');
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.equal(results[0].value, 2);
  assert.equal(results[3].status, 'rejected');
});

test('原文未明确写专业不限时降为表述模糊', () => {
  const jobs = removeUnsupportedInferences([{
    source_url: 'https://example.com/job', city: '深圳', eligibility: '未限制专业',
    reasons: ['专业不限，土木工程可投'], gaps: []
  }], [{ source_url: 'https://example.com/job', source_text: '2027届校园招聘，欢迎应届生投递' }], { exclusions: '' });
  assert.equal(jobs[0].eligibility, '表述模糊');
  assert.deepEqual(jobs[0].reasons, []);
  assert.match(jobs[0].gaps[0], /不能视为专业不限/);
});

test('兼容模型返回 0 到 1 的岗位适配度', () => {
  assert.equal(normalizeFitScore(0.8), 80);
  assert.equal(normalizeFitScore(7), 70);
  assert.equal(normalizeFitScore(80), 80);
  assert.equal(normalizeFitScore('bad'), 50);
});

test('旧模板和版权尾巴不能覆盖可靠的本届招聘摘要', () => {
  const existing = '招聘对象为2027届高校毕业生，需求方向包括土木工程、结构工程、智能建造和工程管理。';
  const stale = '岗位要求：2026年高校应届毕业生，专业对口。立即申请 --> 未经51job.com同意，不得转载，版权所有&copy;1999-';
  assert.equal(pickBestDescription('铁四院2027年招聘启事', stale, existing), existing);
});

test('模型超时时只保留相关具体招聘页', () => {
  const profile = { major: '土木工程', related_majors: '结构工程', skills: '有限元' };
  assert.equal(isFallbackRelevant(profile, {
    title: '某设计院2027届结构设计校园招聘', company: '某设计院',
    source_url: 'https://career.example.com/jobs/27', snippet: '招聘结构工程、土木工程专业'
  }), true);
  assert.equal(isFallbackRelevant(profile, {
    title: '同济大学学生就业信息网', company: '', source_url: 'https://example.edu.cn/', snippet: '招聘信息汇总'
  }), false);
  assert.equal(isFallbackRelevant(profile, {
    title: '2027届智能驾驶算法工程师', company: '某科技公司',
    source_url: 'https://career.example.com/ai', snippet: '计算机视觉算法'
  }), false);
});

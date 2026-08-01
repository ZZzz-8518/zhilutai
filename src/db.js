const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { calculateMatch, inferEmploymentType } = require('./scoring');
const { inferCompanyType, getWatchlist } = require('./company');
const { buildApplicationOptions } = require('./channels');

const DEFAULT_DATA_DIR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'Zhilutai')
  : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'zhilutai');
const DATA_DIR = path.resolve(process.env.JOB_FINDER_DATA_DIR || DEFAULT_DATA_DIR);
const TOOLS_DIR = path.resolve(process.env.JOB_FINDER_TOOLS_DIR || path.join(DATA_DIR, 'tools'));
const DEFAULT_SOURCE_SITES = [
  { name: '中国矿业大学就业指导中心', url: 'https://cumt.91job.org.cn/sub-station/home/10290', enabled: true, access_scope: 'school', school: '中国矿业大学', province: '江苏', login_required: true },
  { name: '长春工业大学就业信息网', url: 'https://ccut.hjiuye.com/', enabled: true, access_scope: 'school', school: '长春工业大学', province: '吉林', login_required: true },
  { name: '吉林省高校毕业生就业信息网', url: 'https://24365.jl.smartedu.cn/', enabled: true, access_scope: 'province', school: '', province: '吉林', login_required: false },
  { name: '国家大学生就业服务平台', url: 'https://www.ncss.cn/', enabled: true, access_scope: 'public', school: '', province: '', login_required: false },
  { name: '北京高校大学生就业创业信息网', url: 'https://www.bjbys.net.cn/', enabled: true, access_scope: 'province', school: '', province: '北京', login_required: false },
  { name: '上海学生就业创业服务网', url: 'https://www.firstjob.shec.edu.cn/', enabled: true, access_scope: 'province', school: '', province: '上海', login_required: false },
  { name: '广东学生就业创业智慧服务平台', url: 'https://job.gd.gov.cn/', enabled: true, access_scope: 'province', school: '', province: '广东', login_required: false },
  { name: '浙江24365大学生就业服务平台', url: 'http://www.ejobmart.cn/', enabled: true, access_scope: 'province', school: '', province: '浙江', login_required: false },
  { name: '91job江苏省高校招生就业指导服务平台', url: 'https://www.91job.org.cn/', enabled: true, access_scope: 'province', school: '', province: '江苏', login_required: false },
  { name: '国聘', url: 'https://www.iguopin.com/', enabled: true, access_scope: 'public', school: '', province: '', login_required: false },
  { name: '中国公共招聘网', url: 'http://job.mohrss.gov.cn/', enabled: true, access_scope: 'public', school: '', province: '', login_required: false },
  { name: '小红书（经验线索）', url: 'https://www.xiaohongshu.com/', enabled: true, access_scope: 'public', school: '', province: '', login_required: true },
  { name: '抖音（经验线索）', url: 'https://www.douyin.com/', enabled: true, access_scope: 'public', school: '', province: '', login_required: true },
  { name: '知乎（经验线索）', url: 'https://www.zhihu.com/', enabled: true, access_scope: 'public', school: '', province: '', login_required: false },
  { name: '牛客（求职经验）', url: 'https://www.nowcoder.com/', enabled: true, access_scope: 'public', school: '', province: '', login_required: false },
  { name: '应届生求职网', url: 'https://www.yingjiesheng.com/', enabled: true, access_scope: 'public', school: '', province: '', login_required: false },
  { name: '哔哩哔哩（经验线索）', url: 'https://www.bilibili.com/', enabled: true, access_scope: 'public', school: '', province: '', login_required: false },
  { name: '同济大学就业信息网', url: 'https://tj91.tongji.edu.cn/', enabled: true, access_scope: 'school', school: '同济大学', province: '上海', login_required: true },
  { name: '清华大学学生职业发展指导中心', url: 'https://career.tsinghua.edu.cn/', enabled: true, access_scope: 'school', school: '清华大学', province: '北京', login_required: true },
  { name: '上海交通大学就业信息网', url: 'https://www.job.sjtu.edu.cn/', enabled: true, access_scope: 'school', school: '上海交通大学', province: '上海', login_required: true },
  { name: '山东大学就业信息网', url: 'https://job.sdu.edu.cn/', enabled: true, access_scope: 'school', school: '山东大学', province: '山东', login_required: true },
  { name: '华中科技大学就业信息网', url: 'https://job.hust.edu.cn/', enabled: true, access_scope: 'school', school: '华中科技大学', province: '湖北', login_required: true },
  { name: '重庆大学就业信息网', url: 'https://job.cqu.edu.cn/', enabled: true, access_scope: 'school', school: '重庆大学', province: '重庆', login_required: true },
  { name: '大连理工大学就业网', url: 'https://career.dlut.edu.cn/', enabled: true, access_scope: 'school', school: '大连理工大学', province: '辽宁', login_required: true },
  { name: '哈尔滨工业大学就业网', url: 'https://career.hit.edu.cn/', enabled: true, access_scope: 'school', school: '哈尔滨工业大学', province: '黑龙江', login_required: true },
  { name: '西安交通大学就业信息网', url: 'https://job.xjtu.edu.cn/', enabled: true, access_scope: 'school', school: '西安交通大学', province: '陕西', login_required: true },
  { name: '天津大学就业指导中心', url: 'https://job.tju.edu.cn/', enabled: true, access_scope: 'school', school: '天津大学', province: '天津', login_required: true },
  { name: '华北电力大学就业信息网', url: 'https://job.ncepu.edu.cn/', enabled: true, access_scope: 'school', school: '华北电力大学', province: '北京', login_required: true },
  { name: '国资委招聘信息', url: 'https://www.sasac.gov.cn/n2588035/n2588325/index.html', enabled: true, access_scope: 'public', school: '', province: '', login_required: false }
];
const SOURCE_DEFAULTS_VERSION = 5;
const API_SETTINGS_VERSION = 1;
const KNOWN_SCHOOL_PROVINCES = {
  中国矿业大学: '江苏', 同济大学: '上海', 清华大学: '北京', 上海交通大学: '上海', 山东大学: '山东',
  华中科技大学: '湖北', 重庆大学: '重庆', 大连理工大学: '辽宁', 哈尔滨工业大学: '黑龙江',
  西安交通大学: '陕西', 天津大学: '天津', 华北电力大学: '北京', 长春工业大学: '吉林'
};
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'jobfinder.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    major TEXT NOT NULL DEFAULT '',
    related_majors TEXT NOT NULL DEFAULT '',
    education TEXT NOT NULL DEFAULT '',
    graduation_year INTEGER NOT NULL DEFAULT 2027,
    school TEXT NOT NULL DEFAULT '',
    school_province TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '',
    certificates TEXT NOT NULL DEFAULT '',
    preferred_industries TEXT NOT NULL DEFAULT '',
    preferred_cities TEXT NOT NULL DEFAULT '',
    preferred_employers TEXT NOT NULL DEFAULT '',
    salary_floor TEXT NOT NULL DEFAULT '',
    exclusions TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    district TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    source_name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    official_benefits TEXT NOT NULL DEFAULT '',
    social_reviews TEXT NOT NULL DEFAULT '[]',
    deadline TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL DEFAULT '',
    graduate_year INTEGER NOT NULL DEFAULT 2027,
    employment_type TEXT NOT NULL DEFAULT '待确认',
    apply_url TEXT NOT NULL DEFAULT '',
    application_channels TEXT NOT NULL DEFAULT '[]',
    company_type TEXT NOT NULL DEFAULT '其他',
    company_intro TEXT NOT NULL DEFAULT '',
    company_intro_source TEXT NOT NULL DEFAULT '',
    source_read_at TEXT NOT NULL DEFAULT '',
    source_excerpt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile_matches (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    eligibility TEXT NOT NULL DEFAULT '表述模糊',
    fit_score INTEGER NOT NULL DEFAULT 50,
    location_distance INTEGER,
    location_score INTEGER NOT NULL DEFAULT 35,
    total_score INTEGER NOT NULL DEFAULT 50,
    reasons TEXT NOT NULL DEFAULT '[]',
    gaps TEXT NOT NULL DEFAULT '[]',
    evidence TEXT NOT NULL DEFAULT '[]',
    ai_summary TEXT NOT NULL DEFAULT '',
    review_status TEXT NOT NULL DEFAULT 'not_applied',
    reviewed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, job_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS run_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT,
    trigger_type TEXT NOT NULL,
    status TEXT NOT NULL,
    found_count INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS search_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    cached_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_research (
    company_key TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    official_intro TEXT NOT NULL DEFAULT '',
    intro_source_url TEXT NOT NULL DEFAULT '',
    official_benefits TEXT NOT NULL DEFAULT '',
    benefits_source_url TEXT NOT NULL DEFAULT '',
    social_reviews TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT NOT NULL DEFAULT '',
    researched_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    research_version INTEGER NOT NULL DEFAULT 1
  );
`);

const profileColumns = new Set(db.prepare('PRAGMA table_info(profiles)').all().map((column) => column.name));
if (!profileColumns.has('preferred_cities')) db.exec("ALTER TABLE profiles ADD COLUMN preferred_cities TEXT NOT NULL DEFAULT ''");
if (!profileColumns.has('school_province')) db.exec("ALTER TABLE profiles ADD COLUMN school_province TEXT NOT NULL DEFAULT ''");
for (const profile of db.prepare("SELECT id,school FROM profiles WHERE school_province=''").all()) {
  const province = KNOWN_SCHOOL_PROVINCES[profile.school];
  if (province) db.prepare('UPDATE profiles SET school_province=? WHERE id=?').run(province, profile.id);
}
const jobColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name));
if (!jobColumns.has('employment_type')) {
  db.exec("ALTER TABLE jobs ADD COLUMN employment_type TEXT NOT NULL DEFAULT '待确认'");
}
if (!jobColumns.has('source_read_at')) db.exec("ALTER TABLE jobs ADD COLUMN source_read_at TEXT NOT NULL DEFAULT ''");
if (!jobColumns.has('source_excerpt')) db.exec("ALTER TABLE jobs ADD COLUMN source_excerpt TEXT NOT NULL DEFAULT ''");
if (!jobColumns.has('apply_url')) db.exec("ALTER TABLE jobs ADD COLUMN apply_url TEXT NOT NULL DEFAULT ''");
if (!jobColumns.has('application_channels')) db.exec("ALTER TABLE jobs ADD COLUMN application_channels TEXT NOT NULL DEFAULT '[]'");
if (!jobColumns.has('company_type')) db.exec("ALTER TABLE jobs ADD COLUMN company_type TEXT NOT NULL DEFAULT '其他'");
if (!jobColumns.has('company_intro')) db.exec("ALTER TABLE jobs ADD COLUMN company_intro TEXT NOT NULL DEFAULT ''");
if (!jobColumns.has('company_intro_source')) db.exec("ALTER TABLE jobs ADD COLUMN company_intro_source TEXT NOT NULL DEFAULT ''");
const companyResearchColumns = new Set(db.prepare('PRAGMA table_info(company_research)').all().map((column) => column.name));
if (!companyResearchColumns.has('research_version')) db.exec('ALTER TABLE company_research ADD COLUMN research_version INTEGER NOT NULL DEFAULT 1');
for (const row of db.prepare("SELECT id,title,description FROM jobs WHERE employment_type='待确认'").all()) {
  db.prepare('UPDATE jobs SET employment_type=? WHERE id=?').run(inferEmploymentType(`${row.title} ${row.description}`), row.id);
}
db.exec("DELETE FROM jobs WHERE source_url<>'' AND rowid NOT IN (SELECT MIN(rowid) FROM jobs WHERE source_url<>'' GROUP BY source_url)");
db.exec("UPDATE profile_matches SET review_status='not_applied' WHERE review_status IN ('pending','keep')");
db.exec("UPDATE profile_matches SET review_status='skipped' WHERE review_status='ignore'");
for (const row of db.prepare("SELECT id,company,source_url,apply_url,application_channels,company_type FROM jobs").all()) {
  const applyUrl = row.apply_url || row.source_url;
  let channels = [];
  try { channels = JSON.parse(row.application_channels || '[]'); } catch {}
  db.prepare('UPDATE jobs SET apply_url=?, application_channels=?, company_type=? WHERE id=?').run(
    applyUrl,
    JSON.stringify(channels.length ? channels : (applyUrl ? [{ type: '招聘平台', label: '查看公告并投递', url: applyUrl, source_url: row.source_url }] : [])),
    row.company_type === '其他' ? inferCompanyType(row.company) : row.company_type,
    row.id
  );
}

const now = () => new Date().toISOString();
const chinaToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
const id = () => crypto.randomUUID();
db.prepare("UPDATE run_history SET status='failed', message='服务重启中断', finished_at=? WHERE status='running'").run(now());
const json = (value, fallback = []) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[（）()【】\[\]]/g, '');
}

function fingerprint(job) {
  const key = `${normalizeText(job.company)}|${normalizeText(job.title)}|${normalizeText(job.city)}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

function sourceRank(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (/\.gov\.cn$|\.org\.cn$/.test(host) || host === 'ncss.cn' || host.endsWith('.ncss.cn')) return 95;
    if (/fenbi|gaoxiaojob|zhipin|nowcoder|niuqi|yingjiesheng/.test(host)) return 35;
    if (host === 'mp.weixin.qq.com') return 70;
    if (/\.edu\.cn$/.test(host)) return 65;
    return 85;
  } catch { return 0; }
}

function getProfiles() {
  return db.prepare('SELECT * FROM profiles ORDER BY updated_at DESC').all().map((row) => ({ ...row, active: Boolean(row.active) }));
}

function getProfile(profileId) {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
}

function saveProfile(input) {
  const timestamp = now();
  const profileId = input.id || id();
  const existing = getProfile(profileId);
  const record = {
    id: profileId,
    name: String(input.name || '').trim(),
    major: String(input.major || '').trim(),
    related_majors: String(input.related_majors || '').trim(),
    education: String(input.education || '').trim(),
    graduation_year: Number(input.graduation_year) || 2027,
    school: String(input.school || '').trim(),
    school_province: String(input.school_province || '').trim(),
    skills: String(input.skills || '').trim(),
    certificates: String(input.certificates || '').trim(),
    preferred_industries: String(input.preferred_industries || '').trim(),
    preferred_cities: String(input.preferred_cities || '').trim(),
    preferred_employers: String(input.preferred_employers || '').trim(),
    salary_floor: String(input.salary_floor || '').trim(),
    exclusions: String(input.exclusions || '').trim(),
    notes: String(input.notes || '').trim(),
    active: input.active === false ? 0 : 1,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp
  };
  if (!record.name) throw new Error('请填写画像名称');
  if (!record.major) throw new Error('请填写专业');
  db.prepare(`INSERT INTO profiles (
    id,name,major,related_majors,education,graduation_year,school,school_province,skills,certificates,
    preferred_industries,preferred_employers,salary_floor,exclusions,notes,active,created_at,updated_at,preferred_cities
  ) VALUES (
    @id,@name,@major,@related_majors,@education,@graduation_year,@school,@school_province,@skills,@certificates,
    @preferred_industries,@preferred_employers,@salary_floor,@exclusions,@notes,@active,@created_at,@updated_at,@preferred_cities
  ) ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, major=excluded.major, related_majors=excluded.related_majors,
    education=excluded.education, graduation_year=excluded.graduation_year, school=excluded.school,
    school_province=excluded.school_province,
    skills=excluded.skills, certificates=excluded.certificates, preferred_industries=excluded.preferred_industries,
    preferred_cities=excluded.preferred_cities,
    preferred_employers=excluded.preferred_employers, salary_floor=excluded.salary_floor,
    exclusions=excluded.exclusions, notes=excluded.notes, active=excluded.active, updated_at=excluded.updated_at`).run(record);
  recalculateProfile(profileId);
  return getProfile(profileId);
}

function deleteProfile(profileId) {
  return db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId).changes > 0;
}

function getJob(jobId) {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  return row ? hydrateJob(row) : null;
}

function companyKey(company) {
  return normalizeText(company);
}

function getCompanyResearch(company) {
  const key = companyKey(company);
  if (!key) return null;
  const row = db.prepare('SELECT * FROM company_research WHERE company_key=?').get(key);
  return row ? { ...row, social_reviews: json(row.social_reviews) } : null;
}

function saveCompanyResearch(input) {
  const timestamp = now();
  const record = {
    company_key: companyKey(input.company_name),
    company_name: String(input.company_name || '').trim(),
    official_intro: String(input.official_intro || '').trim(),
    intro_source_url: String(input.intro_source_url || '').trim(),
    official_benefits: String(input.official_benefits || '').trim(),
    benefits_source_url: String(input.benefits_source_url || '').trim(),
    social_reviews: JSON.stringify(Array.isArray(input.social_reviews) ? input.social_reviews : []),
    status: String(input.status || 'partial'),
    error: String(input.error || '').trim(),
    researched_at: String(input.researched_at || timestamp),
    updated_at: timestamp,
    research_version: Math.max(1, Number(input.research_version) || 1)
  };
  if (!record.company_key) throw new Error('公司名称不能为空');
  db.prepare(`INSERT INTO company_research (
    company_key,company_name,official_intro,intro_source_url,official_benefits,benefits_source_url,
    social_reviews,status,error,researched_at,updated_at,research_version
  ) VALUES (
    @company_key,@company_name,@official_intro,@intro_source_url,@official_benefits,@benefits_source_url,
    @social_reviews,@status,@error,@researched_at,@updated_at,@research_version
  ) ON CONFLICT(company_key) DO UPDATE SET
    company_name=excluded.company_name,
    official_intro=CASE WHEN excluded.official_intro='' THEN company_research.official_intro ELSE excluded.official_intro END,
    intro_source_url=CASE WHEN excluded.intro_source_url='' THEN company_research.intro_source_url ELSE excluded.intro_source_url END,
    official_benefits=CASE WHEN excluded.official_benefits='' THEN company_research.official_benefits ELSE excluded.official_benefits END,
    benefits_source_url=CASE WHEN excluded.benefits_source_url='' THEN company_research.benefits_source_url ELSE excluded.benefits_source_url END,
    social_reviews=CASE WHEN excluded.social_reviews='[]' THEN company_research.social_reviews ELSE excluded.social_reviews END,
    status=excluded.status,error=excluded.error,researched_at=excluded.researched_at,
    updated_at=excluded.updated_at,research_version=excluded.research_version`).run(record);
  return getCompanyResearch(record.company_name);
}

function importCompanySocialReviews(companyName, reviews = []) {
  const company = String(companyName || '').trim();
  if (!company) throw new Error('公司名称不能为空');
  const existing = getCompanyResearch(company);
  const incoming = (Array.isArray(reviews) ? reviews : []).filter((review) => review
    && /^https?:\/\//i.test(review.source_url || '') && String(review.summary || '').trim());
  const merged = [...(existing?.social_reviews || []), ...incoming]
    .filter((review, index, all) => all.findIndex((candidate) => candidate.source_url === review.source_url) === index);
  return saveCompanyResearch({
    company_name: company,
    official_intro: existing?.official_intro || '',
    intro_source_url: existing?.intro_source_url || '',
    official_benefits: existing?.official_benefits || '',
    benefits_source_url: existing?.benefits_source_url || '',
    social_reviews: merged,
    status: existing?.status === 'complete' || (existing?.official_intro && existing?.official_benefits && merged.length) ? 'complete' : 'partial',
    error: '',
    researched_at: new Date().toISOString(),
    research_version: Math.max(2, Number(existing?.research_version) || 1)
  });
}

function hydrateJob(row) {
  const research = getCompanyResearch(row.company);
  const blockedOfficialSource = (value) => /(?:^|\.)(?:bing|baidu|so|sogou|wikipedia|zhipin|liepin|kanzhun)\./i.test((() => {
    try { return new URL(value).hostname; } catch { return ''; }
  })());
  const researchIntro = research && !blockedOfficialSource(research.intro_source_url) ? research.official_intro : '';
  const researchIntroSource = research && !blockedOfficialSource(research.intro_source_url) ? research.intro_source_url : '';
  const researchBenefits = research && !blockedOfficialSource(research.benefits_source_url) ? research.official_benefits : '';
  const researchBenefitsSource = research && !blockedOfficialSource(research.benefits_source_url) ? research.benefits_source_url : '';
  const jobReviews = json(row.social_reviews);
  const researchReviews = research?.social_reviews || [];
  const socialReviews = [...jobReviews, ...researchReviews]
    .filter((item, index, all) => item && all.findIndex((candidate) => candidate.source_url === item.source_url) === index);
  const job = {
    ...row,
    deadline_expired: Boolean(row.deadline && /^\d{4}-\d{2}-\d{2}$/.test(String(row.deadline)) && row.deadline < chinaToday()),
    company_intro: row.company_intro || researchIntro || '',
    company_intro_source: row.company_intro_source || (row.company_intro ? row.source_url : '') || researchIntroSource || '',
    official_benefits: row.official_benefits || researchBenefits || '',
    official_benefits_source: row.official_benefits ? row.source_url : researchBenefitsSource,
    social_reviews: socialReviews,
    application_channels: json(row.application_channels),
    company_research_status: research?.status || 'not_started',
    company_researched_at: research?.researched_at || ''
  };
  return { ...job, application_options: buildApplicationOptions(job) };
}

function saveJob(input, matchOverrides = null, profileId = null) {
  const timestamp = now();
  const requestedSourceUrl = String(input.source_url || '').trim();
  const fp = fingerprint(input);
  const sameCampaign = String(input.company || '').trim().length >= 4
    ? db.prepare('SELECT * FROM jobs WHERE graduate_year=?').all(Number(input.graduate_year) || 2027)
      .filter((job) => normalizeText(job.company) === normalizeText(input.company))
      .sort((left, right) => sourceRank(right.source_url) - sourceRank(left.source_url))[0]
    : null;
  const existing = (requestedSourceUrl ? db.prepare('SELECT * FROM jobs WHERE source_url = ?').get(requestedSourceUrl) : null)
    || db.prepare('SELECT * FROM jobs WHERE fingerprint = ?').get(fp)
    || sameCampaign;
  const useNewSource = !existing || sourceRank(requestedSourceUrl) > sourceRank(existing.source_url);
  const jobId = existing?.id || input.id || id();
  const record = {
    id: jobId,
    fingerprint: existing?.fingerprint || fp,
    title: String(useNewSource ? input.title : (existing?.title || input.title) || '').trim(),
    company: String(input.company || '').trim(),
    city: String(input.city || '').trim(),
    district: String(input.district || '').trim(),
    address: String(input.address || '').trim(),
    source_url: useNewSource ? requestedSourceUrl : String(existing?.source_url || requestedSourceUrl),
    source_name: String(useNewSource ? input.source_name : (existing?.source_name || input.source_name) || '').trim(),
    description: String(input.description || '').trim(),
    official_benefits: String(input.official_benefits || '').trim(),
    social_reviews: JSON.stringify(input.social_reviews || []),
    deadline: String(input.deadline || '').trim(),
    published_at: String(input.published_at || '').trim(),
    graduate_year: Number(input.graduate_year) || 2027,
    employment_type: String(input.employment_type === '待确认' && existing && existing.employment_type !== '待确认'
      ? existing.employment_type
      : (input.employment_type || inferEmploymentType(`${input.title || ''} ${input.description || ''}`))),
    apply_url: String(input.apply_url || existing?.apply_url || '').trim(),
    application_channels: JSON.stringify(input.application_channels || (existing ? json(existing.application_channels) : [])),
    company_type: String(input.company_type || existing?.company_type || inferCompanyType(input.company)).trim(),
    company_intro: String(input.company_intro || existing?.company_intro || '').trim(),
    company_intro_source: String(input.company_intro_source || existing?.company_intro_source || '').trim(),
    source_read_at: String(input.source_read_at || existing?.source_read_at || '').trim(),
    source_excerpt: String(input.source_excerpt || existing?.source_excerpt || '').trim(),
    status: String(input.status || existing?.status || 'new'),
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
    last_seen_at: timestamp
  };
  if (!record.title) throw new Error('岗位名称不能为空');
  db.prepare(`INSERT INTO jobs (
    id,fingerprint,title,company,city,district,address,source_url,source_name,description,
    official_benefits,social_reviews,deadline,published_at,graduate_year,employment_type,apply_url,application_channels,company_type,company_intro,company_intro_source,source_read_at,source_excerpt,status,created_at,updated_at,last_seen_at
  ) VALUES (
    @id,@fingerprint,@title,@company,@city,@district,@address,@source_url,@source_name,@description,
    @official_benefits,@social_reviews,@deadline,@published_at,@graduate_year,@employment_type,@apply_url,@application_channels,@company_type,@company_intro,@company_intro_source,@source_read_at,@source_excerpt,@status,@created_at,@updated_at,@last_seen_at
  ) ON CONFLICT(fingerprint) DO UPDATE SET
    source_url=CASE WHEN excluded.source_url='' THEN jobs.source_url ELSE excluded.source_url END,
    source_name=CASE WHEN excluded.source_name='' THEN jobs.source_name ELSE excluded.source_name END,
    description=CASE WHEN excluded.description='' THEN jobs.description ELSE excluded.description END,
    official_benefits=CASE WHEN excluded.official_benefits='' THEN jobs.official_benefits ELSE excluded.official_benefits END,
    social_reviews=CASE WHEN excluded.social_reviews='[]' THEN jobs.social_reviews ELSE excluded.social_reviews END,
    deadline=CASE WHEN excluded.deadline='' THEN jobs.deadline ELSE excluded.deadline END,
    published_at=CASE WHEN excluded.published_at='' THEN jobs.published_at ELSE excluded.published_at END,
    employment_type=excluded.employment_type,
    apply_url=CASE WHEN excluded.apply_url='' THEN jobs.apply_url ELSE excluded.apply_url END,
    application_channels=CASE WHEN excluded.application_channels='[]' THEN jobs.application_channels ELSE excluded.application_channels END,
    company_type=CASE WHEN excluded.company_type='其他' THEN jobs.company_type ELSE excluded.company_type END,
    company_intro=CASE WHEN excluded.company_intro='' THEN jobs.company_intro ELSE excluded.company_intro END,
    company_intro_source=CASE WHEN excluded.company_intro_source='' THEN jobs.company_intro_source ELSE excluded.company_intro_source END,
    source_read_at=CASE WHEN excluded.source_read_at='' THEN jobs.source_read_at ELSE excluded.source_read_at END,
    source_excerpt=CASE WHEN excluded.source_excerpt='' THEN jobs.source_excerpt ELSE excluded.source_excerpt END,
    updated_at=excluded.updated_at, last_seen_at=excluded.last_seen_at`).run(record);
  const actualId = existing?.id || jobId;
  for (const profile of getProfiles()) {
    upsertMatch(profile, getJob(actualId), profile.id === profileId ? matchOverrides : null);
  }
  return getJob(actualId);
}

function deleteJob(jobId) {
  return db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId).changes > 0;
}

function upsertMatch(profile, job, overrides = null) {
  const previous = db.prepare('SELECT * FROM profile_matches WHERE profile_id=? AND job_id=?').get(profile.id, job.id);
  const calculated = calculateMatch(profile, job, overrides || {});
  const record = {
    profile_id: profile.id,
    job_id: job.id,
    eligibility: calculated.eligibility,
    fit_score: calculated.fit_score,
    location_distance: calculated.location_distance,
    location_score: calculated.location_score,
    total_score: calculated.total_score,
    reasons: JSON.stringify(calculated.reasons || []),
    gaps: JSON.stringify(calculated.gaps || []),
    evidence: JSON.stringify(calculated.evidence || []),
    ai_summary: calculated.ai_summary || '',
    review_status: previous?.review_status || 'not_applied',
    reviewed_at: previous?.reviewed_at || null,
    updated_at: now()
  };
  db.prepare(`INSERT INTO profile_matches VALUES (
    @profile_id,@job_id,@eligibility,@fit_score,@location_distance,@location_score,@total_score,
    @reasons,@gaps,@evidence,@ai_summary,@review_status,@reviewed_at,@updated_at
  ) ON CONFLICT(profile_id,job_id) DO UPDATE SET
    eligibility=excluded.eligibility, fit_score=excluded.fit_score,
    location_distance=excluded.location_distance, location_score=excluded.location_score,
    total_score=excluded.total_score, reasons=excluded.reasons, gaps=excluded.gaps,
    evidence=excluded.evidence, ai_summary=excluded.ai_summary, updated_at=excluded.updated_at`).run(record);
}

function recalculateProfile(profileId) {
  const profile = getProfile(profileId);
  if (!profile) return;
  const jobs = db.prepare('SELECT * FROM jobs').all().map(hydrateJob);
  db.exec('BEGIN');
  try {
    jobs.forEach((job) => upsertMatch(profile, job));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getJobs(profileId) {
  if (!profileId) return db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC').all().map(hydrateJob);
  return db.prepare(`SELECT j.*, m.eligibility, m.fit_score, m.location_distance, m.location_score,
      m.total_score, m.reasons, m.gaps, m.evidence, m.ai_summary, m.review_status, m.reviewed_at
    FROM jobs j JOIN profile_matches m ON m.job_id=j.id
    WHERE m.profile_id=?
    ORDER BY CASE WHEN m.review_status='skipped' THEN 1 ELSE 0 END, m.total_score DESC, j.updated_at DESC`).all(profileId)
    .map((row) => ({
      ...hydrateJob(row),
      reasons: json(row.reasons), gaps: json(row.gaps), evidence: json(row.evidence)
    }));
}

function reviewMatch(profileId, jobId, input) {
  const allowed = ['not_applied', 'applied', 'written_test', 'interview', 'offer', 'skipped'];
  if (!allowed.includes(input.review_status)) throw new Error('无效的审核状态');
  db.prepare(`UPDATE profile_matches SET review_status=?, reviewed_at=?, updated_at=?
    WHERE profile_id=? AND job_id=?`).run(input.review_status, now(), now(), profileId, jobId);
  return getJobs(profileId).find((job) => job.id === jobId);
}

function getSearchCache(cacheKey, maxAgeMs = 18 * 60 * 60 * 1000) {
  const row = db.prepare('SELECT * FROM search_cache WHERE cache_key=?').get(cacheKey);
  if (!row || Date.now() - new Date(row.cached_at).getTime() > maxAgeMs) return null;
  return json(row.payload, null);
}

function setSearchCache(cacheKey, payload) {
  db.prepare(`INSERT INTO search_cache(cache_key,payload,cached_at) VALUES(?,?,?)
    ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,cached_at=excluded.cached_at`)
    .run(cacheKey, JSON.stringify(payload), now());
}

function setSetting(key, value) {
  db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(key, JSON.stringify(value), now());
}

function getSettings(includeSecret = false) {
  const settings = {};
  for (const row of db.prepare('SELECT * FROM settings').all()) settings[row.key] = json(row.value, row.value);
  if (Number(settings.api_settings_version || 0) < API_SETTINGS_VERSION) {
    const apiKey = settings.api_key || settings.analysis_api_key || settings.openai_api_key || '';
    const apiBase = settings.analysis_api_base || 'https://api.deepseek.com';
    const model = settings.analysis_model || 'deepseek-v4-pro';
    setSetting('api_key', apiKey);
    setSetting('api_base', apiBase);
    setSetting('model', model);
    setSetting('api_settings_version', API_SETTINGS_VERSION);
    db.prepare("DELETE FROM settings WHERE key IN ('analysis_api_key','analysis_api_base','analysis_model','openai_api_key')").run();
    Object.assign(settings, { api_key: apiKey, api_base: apiBase, model, api_settings_version: API_SETTINGS_VERSION });
  }
  let sourceSites = Array.isArray(settings.source_sites) ? settings.source_sites : DEFAULT_SOURCE_SITES;
  if (Number(settings.source_defaults_version || 0) < SOURCE_DEFAULTS_VERSION) {
    const defaultsByUrl = new Map(DEFAULT_SOURCE_SITES.map((site) => [site.url.replace(/\/+$/, '').toLowerCase(), site]));
    sourceSites = sourceSites.map((site) => {
      const defaults = defaultsByUrl.get(String(site?.url || '').replace(/\/+$/, '').toLowerCase());
      return defaults ? { ...defaults, ...site, access_scope: defaults.access_scope, school: defaults.school, province: defaults.province, login_required: defaults.login_required } : site;
    });
    const configuredUrls = new Set(sourceSites.map((site) => String(site?.url || '').replace(/\/+$/, '').toLowerCase()));
    sourceSites.push(...DEFAULT_SOURCE_SITES.filter((site) => !configuredUrls.has(site.url.replace(/\/+$/, '').toLowerCase())));
    setSetting('source_sites', sourceSites);
    setSetting('source_defaults_version', SOURCE_DEFAULTS_VERSION);
  }
  const result = {
    model: settings.model || 'deepseek-v4-pro',
    api_base: settings.api_base || 'https://api.deepseek.com',
    source_sites: sourceSites,
    scheduler_enabled: Boolean(settings.scheduler_enabled),
    schedule_times: settings.schedule_times || ['08:30', '13:00', '20:30'],
    has_api_key: Boolean(settings.api_key || process.env.DEEPSEEK_API_KEY)
  };
  if (includeSecret) {
    result.api_key = settings.api_key || process.env.DEEPSEEK_API_KEY || '';
  }
  return result;
}

function saveSettings(input) {
  const allowed = ['model', 'api_base', 'source_sites', 'scheduler_enabled', 'schedule_times'];
  for (const key of allowed) if (Object.hasOwn(input, key)) setSetting(key, input[key]);
  if (input.api_key) setSetting('api_key', String(input.api_key).trim());
  if (input.clear_api_key) setSetting('api_key', '');
  return getSettings();
}

function createRun(profileId, triggerType) {
  const run = { id: id(), profile_id: profileId || null, trigger_type: triggerType, status: 'running', started_at: now() };
  db.prepare(`INSERT INTO run_history(id,profile_id,trigger_type,status,started_at) VALUES(@id,@profile_id,@trigger_type,@status,@started_at)`).run(run);
  return run.id;
}

function finishRun(runId, status, count, message) {
  db.prepare('UPDATE run_history SET status=?, found_count=?, message=?, finished_at=? WHERE id=?')
    .run(status, count, String(message || ''), now(), runId);
}

function getRuns() {
  return db.prepare(`SELECT r.*, p.name AS profile_name FROM run_history r
    LEFT JOIN profiles p ON p.id=r.profile_id ORDER BY r.started_at DESC LIMIT 20`).all();
}

function getBootstrap(profileId) {
  const profiles = getProfiles();
  const selected = profiles.find((profile) => profile.id === profileId) || profiles[0] || null;
  const jobs = getJobs(selected?.id);
  return { profiles, selected_profile_id: selected?.id || null, jobs, watchlist: getWatchlist(selected, jobs), settings: getSettings(), runs: getRuns() };
}

const MATCH_SCORING_VERSION = 2;
const scoringVersionRow = db.prepare("SELECT value FROM settings WHERE key='match_scoring_version'").get();
if (Number(json(scoringVersionRow?.value, 0)) < MATCH_SCORING_VERSION) {
  for (const profile of getProfiles()) recalculateProfile(profile.id);
  setSetting('match_scoring_version', MATCH_SCORING_VERSION);
}

module.exports = {
  DATA_DIR, TOOLS_DIR, getProfiles, getProfile, saveProfile, deleteProfile, getJob, saveJob, deleteJob,
  getJobs, reviewMatch, getSettings, saveSettings, createRun, finishRun, getRuns, getBootstrap,
  getSearchCache, setSearchCache, getCompanyResearch, saveCompanyResearch, importCompanySocialReviews
};

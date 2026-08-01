const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  DATA_DIR, getProfiles, getProfile, saveProfile, deleteProfile, getJob, saveJob, deleteJob,
  getJobs, reviewMatch, saveSettings, getSettings, createRun, finishRun, getBootstrap, importCompanySocialReviews
} = require('./src/db');
const { discoverJobs, enrichJobFromSource } = require('./src/ai');
const { researchCompanies } = require('./src/research');
const VERIFIED_SOCIAL_REVIEWS = require('./src/verified-social-reviews');

const PORT = Number(process.env.PORT) || 4177;
const HOST = '127.0.0.1';
const APP_VERSION = 6;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const collectingProfiles = new Set();
const enrichingJobs = new Set();

for (const item of VERIFIED_SOCIAL_REVIEWS) {
  try { importCompanySocialReviews(item.company, item.reviews); }
  catch (error) { console.error(`[社交资料导入] ${item.company}: ${error.message}`); }
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error('请求内容过大'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON 格式无效')); }
    });
    req.on('error', reject);
  });
}

async function collectForProfile(profileId, triggerType = 'manual') {
  const profile = getProfile(profileId);
  if (!profile) throw new Error('画像不存在');
  if (collectingProfiles.has(profileId)) throw new Error('这个画像正在采集，请等待本轮完成');
  collectingProfiles.add(profileId);
  const runId = createRun(profileId, triggerType);
  try {
    const result = await discoverJobs(profile);
    for (const job of result.jobs) {
      saveJob(job, {
        eligibility: job.eligibility,
        fit_score: job.fit_score,
        reasons: job.reasons,
        gaps: job.gaps,
        evidence: job.historical_evidence,
        ai_summary: job.ai_summary
      }, profileId);
    }
    finishRun(runId, 'success', result.jobs.length, result.response_id ? `响应 ${result.response_id}` : '采集完成');
    return { count: result.jobs.length, citations: result.citations };
  } catch (error) {
    finishRun(runId, 'failed', 0, error.message);
    throw error;
  } finally {
    collectingProfiles.delete(profileId);
  }
}

async function enrichOneJob(jobId, profileId) {
  const job = getJob(jobId);
  if (!job) throw new Error('岗位不存在');
  const profile = getProfile(profileId) || getProfiles()[0];
  if (!profile) throw new Error('请先创建求职画像');
  if (enrichingJobs.has(jobId)) throw new Error('这个岗位正在读取原文');
  enrichingJobs.add(jobId);
  try {
    const enriched = await enrichJobFromSource(job, profile);
    const saved = saveJob(enriched, {
      eligibility: enriched.eligibility,
      fit_score: enriched.fit_score,
      reasons: enriched.reasons,
      gaps: enriched.gaps,
      evidence: enriched.historical_evidence || enriched.evidence,
      ai_summary: enriched.ai_summary
    }, profile.id);
    await researchCompanies([saved], { limit: 1, force: true });
    return getJob(saved.id);
  } finally {
    enrichingJobs.delete(jobId);
  }
}

async function handleApi(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean);

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    return send(res, 200, getBootstrap(url.searchParams.get('profileId')));
  }
  if (method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, { ok: true, app_version: APP_VERSION, data_dir: DATA_DIR, time: new Date().toISOString() });
  }
  if (method === 'POST' && url.pathname === '/api/profiles') {
    return send(res, 201, saveProfile(await readJson(req)));
  }
  if (method === 'PUT' && parts[1] === 'profiles' && parts[2]) {
    return send(res, 200, saveProfile({ ...(await readJson(req)), id: parts[2] }));
  }
  if (method === 'DELETE' && parts[1] === 'profiles' && parts[2]) {
    return send(res, 200, { deleted: deleteProfile(parts[2]) });
  }
  if (method === 'POST' && url.pathname === '/api/jobs') {
    return send(res, 201, saveJob(await readJson(req)));
  }
  if (method === 'POST' && parts[1] === 'jobs' && parts[2] && parts[3] === 'enrich') {
    const input = await readJson(req);
    return send(res, 200, await enrichOneJob(parts[2], input.profileId));
  }
  if (method === 'PUT' && parts[1] === 'jobs' && parts[2]) {
    const existing = getJob(parts[2]);
    if (!existing) return send(res, 404, { error: '岗位不存在' });
    return send(res, 200, saveJob({ ...existing, ...(await readJson(req)), id: parts[2] }));
  }
  if (method === 'DELETE' && parts[1] === 'jobs' && parts[2]) {
    return send(res, 200, { deleted: deleteJob(parts[2]) });
  }
  if (method === 'POST' && parts[1] === 'matches' && parts[2] && parts[3]) {
    return send(res, 200, reviewMatch(parts[2], parts[3], await readJson(req)));
  }
  if (method === 'POST' && url.pathname === '/api/settings') {
    return send(res, 200, saveSettings(await readJson(req)));
  }
  if (method === 'POST' && url.pathname === '/api/collect') {
    const input = await readJson(req);
    if (!input.profileId) throw new Error('请先选择一个画像');
    return send(res, 200, await collectForProfile(input.profileId));
  }
  if (method === 'POST' && url.pathname === '/api/enrich') {
    const input = await readJson(req);
    const candidates = getJobs().filter((job) => job.source_url && !job.source_read_at)
      .sort((left, right) => Number(Boolean(left.source_read_at)) - Number(Boolean(right.source_read_at)))
      .slice(0, Math.min(Number(input.limit) || 20, 30));
    const results = [];
    for (const job of candidates) {
      try { results.push({ id: job.id, ok: true, job: await enrichOneJob(job.id, input.profileId) }); }
      catch (error) { results.push({ id: job.id, ok: false, error: error.message }); }
    }
    const research = await researchCompanies(getJobs(input.profileId), { limit: Number(input.researchLimit) || 12 });
    return send(res, 200, { count: results.filter((item) => item.ok).length, total: results.length, results, research });
  }
  if (method === 'POST' && url.pathname === '/api/research') {
    const input = await readJson(req);
    return send(res, 200, await researchCompanies(getJobs(input.profileId), {
      limit: Number(input.limit) || 12,
      force: input.force === true
    }));
  }
  if (method === 'POST' && url.pathname === '/api/research/social') {
    const input = await readJson(req);
    return send(res, 200, importCompanySocialReviews(input.company, input.reviews));
  }
  return send(res, 404, { error: '接口不存在' });
}

function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`) && file !== path.join(PUBLIC_DIR, 'index.html')) return send(res, 403, 'Forbidden', 'text/plain');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    return send(res, 400, { error: error.message || '请求失败' });
  }
});

const schedulerState = new Set();
async function schedulerTick() {
  const settings = getSettings();
  if (!settings.scheduler_enabled || !settings.has_api_key) return;
  const local = new Date();
  const hhmm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
  if (!settings.schedule_times.includes(hhmm)) return;
  const stamp = `${local.toLocaleDateString('sv-SE')}-${hhmm}`;
  if (schedulerState.has(stamp)) return;
  schedulerState.add(stamp);
  for (const profile of getProfiles().filter((item) => item.active)) {
    try { await collectForProfile(profile.id, 'scheduled'); }
    catch (error) { console.error(`[定时采集] ${profile.name}: ${error.message}`); }
  }
  if (schedulerState.size > 20) schedulerState.delete(schedulerState.values().next().value);
}

setInterval(schedulerTick, 30_000).unref();
schedulerTick();

server.listen(PORT, HOST, () => {
  console.log(`职路台已启动：http://${HOST}:${PORT}`);
  console.log(`数据目录：${DATA_DIR}`);
});

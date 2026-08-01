const state = {
  profiles: [], jobs: [], watchlist: [], settings: {}, runs: [], selectedProfileId: null,
  selectedJobId: null, view: 'jobs', watchFilter: '全部'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const safeUrl = (value = '') => /^https?:\/\//i.test(String(value)) ? String(value) : '';
const list = (value) => Array.isArray(value) ? value : [];
const fmtDate = (value, full = false) => {
  if (!value) return '未注明';
  const year = String(value).slice(0, 4);
  const currentYear = today().slice(0, 4);
  const options = full || year !== currentYear
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat('zh-CN', options).format(new Date(`${value}T00:00:00`));
};
const fmtTime = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';
// Deadline status follows the user's China calendar, independent of the browser machine timezone.
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());

const reviewLabels = {
  not_applied: '未投递', applied: '已投递', written_test: '笔试', interview: '面试', offer: 'Offer', skipped: '放弃'
};
const watchStatusClass = { '已开始': 'started', '未开始': 'upcoming', '尚未发现本届公告': 'unknown', '已截止': 'ended' };
const schoolProvinceMap = {
  中国矿业大学: '江苏', 同济大学: '上海', 清华大学: '北京', 上海交通大学: '上海', 山东大学: '山东',
  华中科技大学: '湖北', 重庆大学: '重庆', 大连理工大学: '辽宁', 哈尔滨工业大学: '黑龙江',
  西安交通大学: '陕西', 天津大学: '天津', 华北电力大学: '北京', 长春工业大学: '吉林'
};
const scopeLabels = { public: '公共', school: '学校', province: '省份' };

function normalizeSchoolName(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s·•・，,。．]/g, '')
    .replace(/[（(](?:本部|主校区|徐州校区)[）)]$/g, '').replace(/(?:本部|主校区|徐州校区)$/g, '');
}

function normalizeProvince(value) {
  return String(value || '').trim().replace(/[\s·•・]/g, '')
    .replace(/(?:壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/g, '');
}

function sourceAvailableForProfile(source, profile) {
  if (!source || source.enabled === false || !source.url) return false;
  const scope = ['school', 'province'].includes(source.access_scope) ? source.access_scope : 'public';
  if (scope === 'public') return true;
  if (scope === 'province') return Boolean(normalizeProvince(profile?.school_province)
    && normalizeProvince(profile.school_province) === normalizeProvince(source.province));
  const profileSchool = normalizeSchoolName(profile?.school);
  const schools = [source.school, ...list(source.school_aliases)].map(normalizeSchoolName).filter(Boolean);
  return Boolean(profileSchool && schools.includes(profileSchool));
}

function applicableSources(profile) {
  return list(state.settings.source_sites).filter((source) => sourceAvailableForProfile(source, profile));
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`);
  return body;
}

function toast(message, type = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3600);
}

function selectedProfile() {
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) || null;
}

async function load(profileId = state.selectedProfileId) {
  const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
  const data = await api(`/api/bootstrap${query}`);
  Object.assign(state, {
    profiles: data.profiles, jobs: data.jobs, watchlist: data.watchlist || [], settings: data.settings,
    runs: data.runs, selectedProfileId: data.selected_profile_id
  });
  if (!state.jobs.some((job) => job.id === state.selectedJobId)) state.selectedJobId = null;
  render();
}

function eligibilityClass(value) {
  if (value === '明确符合') return 'match';
  if (['宽口径符合', '未限制专业'].includes(value)) return 'broad';
  if (value === '明确不符合') return 'reject';
  return 'unclear';
}

function renderProfiles() {
  $('#profileSwitcher').innerHTML = state.profiles.length ? state.profiles.map((profile) => `
    <button class="profile-button ${profile.id === state.selectedProfileId ? 'active' : ''}" data-profile-id="${profile.id}">
      <span class="profile-avatar">${escapeHtml(profile.name.slice(0, 1))}</span>
      <span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.major)}</small></span>
    </button>`).join('') : '<div class="storage-note">尚未创建画像</div>';

  $('#profileGrid').innerHTML = state.profiles.length ? state.profiles.map((profile) => `
    <article class="profile-card">
      <div class="profile-card-head">
        <span class="profile-avatar">${escapeHtml(profile.name.slice(0, 1))}</span>
        <div><h3>${escapeHtml(profile.name)}</h3><span>${escapeHtml(profile.education || '学历未填')} · ${profile.graduation_year} 届</span></div>
        <span class="badge ${profile.active ? '' : 'off'}">${profile.active ? '参与采集' : '暂停采集'}</span>
      </div>
      <div class="profile-facts">
        <div><span>专业</span><strong>${escapeHtml(profile.major)}</strong></div>
        <div><span>学校</span><span>${escapeHtml(profile.school || '未填写')}${profile.school_province ? ` · ${escapeHtml(profile.school_province)}` : ''}</span></div>
        <div><span>来源</span><span>${applicableSources(profile).length} 个可用来源</span></div>
        <div><span>城市</span><span>${escapeHtml(profile.preferred_cities || '不限制地点')}</span></div>
        <div><span>行业</span><span>${escapeHtml(profile.preferred_industries || '不限行业')}</span></div>
        <div><span>技能</span><span>${escapeHtml(profile.skills || '未填写')}</span></div>
      </div>
      <div class="profile-actions">
        <button class="button secondary edit-profile" data-id="${profile.id}"><i data-lucide="pencil"></i><span>编辑</span></button>
        <button class="button danger delete-profile" data-id="${profile.id}"><i data-lucide="trash-2"></i><span>删除</span></button>
      </div>
    </article>`).join('') : emptyHtml('users', '还没有求职画像', '先添加一个人，再开始匹配岗位', '新增画像', 'empty-add-profile');
}

function deadlineGroup(job) {
  if (!job.deadline) return 1;
  if (job.deadline_expired === true) return 2;
  return job.deadline < today() ? 2 : 0;
}

function applicationPriority(job) {
  return list(job.application_options)[0]?.rank ?? 9;
}

function compareDeadlines(a, b) {
  const group = deadlineGroup(a) - deadlineGroup(b);
  if (group) return group;
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    || applicationPriority(a) - applicationPriority(b) || b.total_score - a.total_score;
  return applicationPriority(a) - applicationPriority(b) || b.total_score - a.total_score;
}

function getFilteredJobs() {
  const keyword = $('#jobSearch')?.value.trim().toLowerCase() || '';
  const employment = $('#employmentFilter')?.value || 'non-intern';
  const eligibility = $('#eligibilityFilter')?.value || 'relevant';
  const companyType = $('#companyTypeFilter')?.value || 'all';
  const review = $('#reviewFilter')?.value || 'active';
  const sort = $('#sortJobs')?.value || 'deadline';
  const jobs = state.jobs.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.city} ${job.description} ${job.company_type}`.toLowerCase();
    if (keyword && !haystack.includes(keyword)) return false;
    if (employment === 'non-intern' && job.employment_type === '实习') return false;
    if (!['non-intern', 'all'].includes(employment) && job.employment_type !== employment) return false;
    if (eligibility === 'relevant' && (Number(job.fit_score) < 50 || job.eligibility === '明确不符合')) return false;
    if (!['all', 'relevant'].includes(eligibility) && job.eligibility !== eligibility) return false;
    if (companyType !== 'all' && job.company_type !== companyType) return false;
    if (review === 'active' && (job.review_status === 'skipped' || deadlineGroup(job) === 2)) return false;
    if (!['active', 'all'].includes(review) && job.review_status !== review) return false;
    return true;
  });
  jobs.sort((a, b) => {
    if (sort === 'distance') return (a.location_distance ?? 99999) - (b.location_distance ?? 99999) || compareDeadlines(a, b);
    if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (sort === 'score') return b.total_score - a.total_score || compareDeadlines(a, b);
    return compareDeadlines(a, b);
  });
  return jobs;
}

function locationPreferenceText(job, compact = false) {
  const profile = selectedProfile();
  if (!profile?.preferred_cities) return '';
  if (job.location_distance === 0) return '意向城市';
  if (job.location_distance === null) return compact ? '' : '与意向城市距离未知';
  return `距意向城市约 ${job.location_distance}km`;
}

function renderCompanyTypeOptions() {
  const select = $('#companyTypeFilter');
  const current = select.value || 'all';
  const types = [...new Set(state.jobs.map((job) => job.company_type).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">全部公司类型</option>' + types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
  select.value = types.includes(current) ? current : 'all';
  $('#sortJobs').querySelector('[value="distance"]').hidden = !selectedProfile()?.preferred_cities;
  if ($('#sortJobs').value === 'distance' && !selectedProfile()?.preferred_cities) $('#sortJobs').value = 'deadline';
}

function renderStats(jobs = state.jobs) {
  const stats = [
    ['当前结果', jobs.length],
    ['待投递', jobs.filter((job) => job.review_status === 'not_applied' && deadlineGroup(job) !== 2).length],
    ['即将截止', jobs.filter((job) => job.deadline && deadlineGroup(job) === 0 && (new Date(job.deadline) - new Date(today())) / 86400000 <= 7).length],
    ['已投递', jobs.filter((job) => ['applied', 'written_test', 'interview'].includes(job.review_status)).length],
    ['Offer', jobs.filter((job) => job.review_status === 'offer').length]
  ];
  $('#statsStrip').innerHTML = stats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

function renderJobs() {
  const jobs = getFilteredJobs();
  renderStats(jobs);
  if (!state.selectedProfileId) {
    $('#jobList').innerHTML = emptyHtml('user-plus', '请先创建画像', '岗位会按照当前画像分别计算', '新增画像', 'empty-add-profile');
    $('#jobDetail').innerHTML = detailEmpty();
    return;
  }
  if (!jobs.some((job) => job.id === state.selectedJobId)) state.selectedJobId = jobs[0]?.id || null;
  $('#jobList').innerHTML = jobs.length ? jobs.map((job) => {
    const locationPref = locationPreferenceText(job, true);
    const expired = deadlineGroup(job) === 2;
    const preferredEntry = list(job.application_options)[0];
    return `<button class="job-card ${job.id === state.selectedJobId ? 'active' : ''} ${expired ? 'expired' : ''}" data-job-id="${job.id}">
      <div class="job-card-top"><h3>${escapeHtml(job.title)}</h3><span class="score">${job.total_score}</span></div>
      <p class="company">${escapeHtml(job.company || '公司未注明')}</p>
      <div class="job-meta">
        <span><i data-lucide="map-pin"></i>${escapeHtml(job.city || '地点未注明')}</span>
        ${locationPref ? `<span><i data-lucide="navigation"></i>${escapeHtml(locationPref)}</span>` : ''}
        <span class="${expired ? 'deadline-expired' : ''}"><i data-lucide="calendar-clock"></i>${expired ? '已截止 ' : '截止 '}${fmtDate(job.deadline)}</span>
      </div>
      <div class="job-tags">
        <span class="tag ${eligibilityClass(job.eligibility)}">${escapeHtml(job.eligibility)}</span>
        <span class="tag">${escapeHtml(job.company_type || '其他')}</span>
        <span class="tag">${escapeHtml(job.employment_type || '待确认')}</span>
        ${preferredEntry ? `<span class="tag apply-source">${escapeHtml(preferredEntry.category_label)}</span>` : ''}
        <span class="tag status">${reviewLabels[job.review_status] || '未投递'}</span>
      </div>
    </button>`;
  }).join('') : emptyHtml('inbox', '当前筛选下没有岗位', '调整筛选，或新增一条岗位', '新增岗位', 'empty-add-job');

  renderDetail(state.jobs.find((job) => job.id === state.selectedJobId));
}

function renderChannel(channel) {
  const url = safeUrl(channel.url || channel.source_url || '');
  const label = channel.label || channel.value || channel.type || '投递渠道';
  return `<div class="channel-row"><span><b>${escapeHtml(channel.type || '其他方式')}</b>${escapeHtml(label)}</span>${url ? `<a class="button secondary compact" href="${escapeHtml(url)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i><span>打开</span></a>` : ''}</div>`;
}

function renderDetail(job) {
  const el = $('#jobDetail');
  if (!job) { el.innerHTML = detailEmpty(); return; }
  const source = safeUrl(job.source_url);
  const applicationOptions = list(job.application_options);
  const preferredEntry = applicationOptions[0] || null;
  const applyUrl = safeUrl(preferredEntry?.url || job.apply_url) || source;
  const evidence = list(job.evidence);
  const reviews = list(job.social_reviews);
  const currentEvidence = source ? `<div class="evidence-item"><strong>2027届招聘原文证据</strong><span>${escapeHtml(job.description || '本届招聘原文已收录，具体专业要求请查看来源。')}</span><br><a href="${escapeHtml(source)}" target="_blank" rel="noreferrer">查看本届原文</a></div>` : '';
  const noReviewsText = job.company_researched_at
    ? `已于 ${fmtTime(job.company_researched_at)} 检索公开社交平台，暂未找到可核验的原始评价。`
    : '尚未检索公开社交平台评价。';
  const locationPref = locationPreferenceText(job);
  const channels = list(job.application_channels);
  el.innerHTML = `
    <button class="icon-button detail-back" style="display:none" aria-label="返回岗位列表"><i data-lucide="arrow-left"></i></button>
    <div class="detail-head">
      <div><div class="detail-eyebrow">${escapeHtml(job.company_type || '其他')}</div><h2>${escapeHtml(job.title)}</h2><p>${escapeHtml(job.company || '公司未注明')}</p></div>
      <div class="detail-score" title="综合推荐分">${job.total_score}</div>
    </div>
    <div class="detail-metadata">
      <span><i data-lucide="map-pin"></i>${escapeHtml([job.city, job.district].filter(Boolean).join(' ') || '地点未注明')}</span>
      ${locationPref ? `<span><i data-lucide="navigation"></i>${escapeHtml(locationPref)}</span>` : ''}
      <span><i data-lucide="calendar-clock"></i>截止 ${fmtDate(job.deadline, true)}</span>
      <span><i data-lucide="briefcase"></i>${escapeHtml(job.employment_type || '待确认')}</span>
      <span class="tag ${eligibilityClass(job.eligibility)}">${escapeHtml(job.eligibility)}</span>
    </div>
    <div class="apply-panel">
      <div class="apply-copy"><strong>投递入口</strong><span id="applySourceNote">${preferredEntry ? `${escapeHtml(preferredEntry.category_label)}${preferredEntry.category === 'official' ? ' · 默认使用官网' : ' · 暂未找到企业招聘官网'}` : '暂未核验到可操作的投递入口'}</span></div>
      ${applicationOptions.length ? `<div class="apply-controls">
        <select id="applyChannelSelect" aria-label="选择投递入口">${applicationOptions.map((option) => `<option value="${escapeHtml(option.url)}" data-category="${escapeHtml(option.category)}" data-category-label="${escapeHtml(option.category_label)}">${escapeHtml(option.category_label)} · ${escapeHtml(option.label)}</option>`).join('')}</select>
        <a class="button primary" id="applyButton" href="${escapeHtml(applyUrl)}" target="_blank" rel="noreferrer"><i data-lucide="send"></i><span>打开投递入口</span></a>
      </div>` : ''}
    </div>
    <div class="decision-bar" aria-label="投递进度">
      <div class="decision-heading"><strong>投递进度</strong><span>手动记录，按当前画像独立保存</span></div>
      ${Object.keys(reviewLabels).map((status) => `<button class="button secondary review-button ${job.review_status === status ? 'selected' : ''}" data-status="${status}">${reviewLabels[status]}</button>`).join('')}
    </div>
    ${channels.length ? detailSection('其他投递方式', `<div class="channel-list">${channels.map(renderChannel).join('')}</div>`) : ''}
    ${source ? `<div class="source-actions"><button class="button secondary enrich-job"><i data-lucide="scan-text"></i><span>重新读取原文</span></button>${job.source_read_at ? `<small>上次读取 ${fmtTime(job.source_read_at)}</small>` : '<small>尚未读取完整原文</small>'}</div>` : ''}
    ${job.ai_summary ? detailSection('AI 初审与复核结论', `<p>${escapeHtml(job.ai_summary)}</p>`) : ''}
    ${detailSection('报名判断', `<div class="reason-list">
      <span><i data-lucide="badge-check"></i><b>${escapeHtml(job.eligibility)}</b>，岗位适配度 ${job.fit_score}/100</span>
      ${list(job.reasons).map((item) => `<span><i data-lucide="check"></i>${escapeHtml(item)}</span>`).join('') || '<p>暂无明确匹配理由。</p>'}
      ${list(job.gaps).map((item) => `<span><i data-lucide="triangle-alert"></i>${escapeHtml(item)}</span>`).join('')}
    </div>`)}
    ${detailSection('招聘信息', `<p>${escapeHtml(job.description || '尚未录入岗位要求')}</p>`)}
    ${detailSection('公司介绍', `<p>${escapeHtml(job.company_intro || (job.company_researched_at ? '已检索公开官网，暂未提取到可核验的公司介绍。' : '尚未检索公司介绍'))}</p>${sourceLine(job.company_intro_source, '公司介绍来源')}${job.company_researched_at ? `<small class="research-time">资料检索于 ${fmtTime(job.company_researched_at)}</small>` : ''}`)}
    ${detailSection('官方待遇', `<p>${escapeHtml(job.official_benefits || '尚未检索官方待遇')}</p>${sourceLine(job.official_benefits_source, '官方待遇来源')}`)}
    ${detailSection('专业与历史证据', `<div class="evidence-list">${currentEvidence}${evidence.map((item) => `
      <div class="evidence-item"><strong>${escapeHtml(item.claim || '往届案例')}</strong><span>${escapeHtml([item.year, item.source_name, item.confidence && `可信度 ${item.confidence}`].filter(Boolean).join(' · '))}</span>${safeUrl(item.source_url) ? `<br><a href="${escapeHtml(item.source_url)}" target="_blank" rel="noreferrer">查看证据</a>` : ''}</div>`).join('')}</div>${evidence.length ? '' : '<p class="research-time">暂未找到可核验的往届同专业录用案例；以上为本届明确要求。</p>'}`)}
    ${detailSection('外部舆论与评价', reviews.length ? `<div class="review-list">${reviews.map((item) => `
      <div class="review-item"><strong>${escapeHtml([item.topic, item.sentiment].filter(Boolean).join(' · ') || '评价')}</strong><span>${escapeHtml(item.summary || '')}</span><small>${escapeHtml(item.source_name || '来源未注明')}</small>${safeUrl(item.source_url) ? `<br><a href="${escapeHtml(item.source_url)}" target="_blank" rel="noreferrer">查看来源</a>` : ''}</div>`).join('')}</div>` : `<p>${escapeHtml(noReviewsText)}</p>`)}
    ${source ? `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>打开招聘原文 · ${escapeHtml(job.source_name || '原始来源')}</a>` : ''}`;
  refreshIcons();
}

function sourceLine(value, label) {
  if (!value) return '';
  const url = safeUrl(value);
  return url ? `<a class="inline-source" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>` : `<small class="inline-source">${escapeHtml(value)}</small>`;
}

function detailSection(title, content) { return `<section class="detail-section"><h3>${title}</h3>${content}</section>`; }
function detailEmpty() { return '<div class="detail-empty"><i data-lucide="panel-right"></i><h3>选择一个岗位</h3><p>这里会显示投递入口、要求、待遇和来源证据</p></div>'; }
function emptyHtml(icon, title, text, button, buttonClass) { return `<div class="empty-state"><i data-lucide="${icon}"></i><h3>${title}</h3><p>${text}</p><button class="button primary ${buttonClass}">${button}</button></div>`; }

function renderWatchlist() {
  const statuses = ['全部', '已开始', '未开始', '尚未发现本届公告', '已截止'];
  $('#watchFilters').innerHTML = statuses.map((status) => `<button class="segment ${state.watchFilter === status ? 'active' : ''}" data-watch-filter="${status}">${status}</button>`).join('');
  const items = state.watchlist.filter((item) => state.watchFilter === '全部' || item.status === state.watchFilter);
  $('#watchlist').innerHTML = items.length ? `<div class="watch-table">
    <div class="watch-row watch-head"><span>企业</span><span>预计节奏</span><span>当前状态</span><span>招聘入口</span></div>
    ${items.map((item) => `<article class="watch-row">
      <div class="watch-company"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.company_type)} · ${escapeHtml(item.tags.join('、'))}</span></div>
      <div><strong>${escapeHtml(item.expected_start)}</strong><span>${escapeHtml(item.process)}</span></div>
      <div><span class="watch-status ${watchStatusClass[item.status] || ''}">${escapeHtml(item.status)}</span><small>${escapeHtml(item.evidence_note)}</small></div>
      <div class="watch-actions">
        <a class="button secondary compact" href="${escapeHtml(item.recruitment_url)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i><span>招聘官网</span></a>
        ${item.current_jobs.map((job) => `<button class="text-button watch-job" data-watch-job-id="${job.id}">${escapeHtml(job.title)}${job.deadline ? ` · ${fmtDate(job.deadline)}` : ''}</button>`).join('')}
      </div>
    </article>`).join('')}
  </div>` : '<div class="empty-state"><i data-lucide="calendar-search"></i><h3>暂无对应企业</h3><p>完善画像中的专业、行业和技能后会自动筛选</p></div>';
}

function renderSettings() {
  const form = $('#settingsForm');
  form.elements.model.value = state.settings.model || 'deepseek-v4-pro';
  form.elements.api_base.value = state.settings.api_base || 'https://api.deepseek.com';
  const sourceSites = list(state.settings.source_sites).filter((site) => site.enabled !== false && site.url);
  form.elements.source_sites.value = sourceSites.map((site) => {
    const scope = ['school', 'province'].includes(site.access_scope) ? site.access_scope : 'public';
    const owner = scope === 'school' ? (site.school || '') : scope === 'province' ? (site.province || '') : '';
    return `${site.name || '未命名来源'} | ${site.url} | ${scopeLabels[scope]} | ${owner} | ${site.login_required ? '需登录' : '免登录'}`;
  }).join('\n');
  form.elements.scheduler_enabled.checked = Boolean(state.settings.scheduler_enabled);
  const times = state.settings.schedule_times || ['08:30', '13:00', '20:30'];
  ['schedule_1', 'schedule_2', 'schedule_3'].forEach((name, index) => { form.elements[name].value = times[index] || ''; });
  $('#keyStatus').textContent = state.settings.has_api_key ? '已保存，同一接口负责岗位整理、初审与复核' : '尚未配置，无法使用 AI 采集与补全';
  const profile = selectedProfile();
  const available = applicableSources(profile);
  const publicCount = available.filter((site) => !['school', 'province'].includes(site.access_scope)).length;
  const schoolCount = available.filter((site) => site.access_scope === 'school').length;
  const provinceCount = available.filter((site) => site.access_scope === 'province').length;
  $('#sourceSiteStatus').textContent = `共 ${sourceSites.length} 个来源，系统会按当前画像自动授权`;
  $('#profileSourceSummary').innerHTML = profile
    ? `<strong>${escapeHtml(profile.name)}当前可用 ${available.length} 个来源</strong><span class="source-badge">公共 ${publicCount}</span><span class="source-badge">本校 ${schoolCount}</span><span class="source-badge">本省 ${provinceCount}</span><small>${profile.school || profile.school_province ? `${escapeHtml(profile.school || '学校未填')}${profile.school_province ? ` · ${escapeHtml(profile.school_province)}` : ''}` : '学校和省份未填，只使用公共来源'}</small>`
    : '<strong>先创建画像后查看可用来源</strong>';
  $('#runsList').innerHTML = state.runs.length ? state.runs.map((run) => `
    <div class="run-item"><strong>${escapeHtml(run.profile_name || '未知画像')} · ${run.trigger_type === 'scheduled' ? '定时' : '手动'}</strong><span class="run-status ${run.status}">${run.status === 'success' ? `新增或更新 ${run.found_count} 条` : run.status === 'running' ? '进行中' : '失败'}</span><small>${fmtTime(run.started_at)} · ${escapeHtml(run.message || '')}</small></div>`).join('') : '<div class="empty-state"><p>暂无采集记录</p></div>';
}

function render() {
  renderProfiles();
  renderCompanyTypeOptions();
  renderJobs();
  renderWatchlist();
  renderSettings();
  switchView(state.view, false);
  refreshIcons();
}

function switchView(view, rerender = true) {
  state.view = view;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === `${view}View`));
  $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  const cities = selectedProfile()?.preferred_cities;
  const titles = {
    jobs: ['岗位池', cities ? `意向城市：${cities} · 按截止日期排列` : '地点不限 · 按截止日期排列'],
    watchlist: ['校招日历', '往年节奏与本届招聘状态'], profiles: ['画像', '多人独立匹配'], settings: ['采集设置', 'AI 接口、数据源与每日定时任务']
  };
  $('#pageTitle').textContent = titles[view][0];
  $('#pageSubtitle').textContent = titles[view][1];
  $('.top-actions').classList.toggle('hidden', view !== 'jobs');
  $('#mobileJobsActions').classList.toggle('hidden', view !== 'jobs');
  $('.sidebar').classList.remove('open');
  if (rerender && view === 'jobs') renderJobs();
  if (rerender && view === 'watchlist') renderWatchlist();
  refreshIcons();
}

function openProfileDialog(profile = null) {
  const form = $('#profileForm');
  form.reset(); form.elements.graduation_year.value = 2027; form.elements.active.checked = true;
  $('#profileDialogTitle').textContent = profile ? '编辑画像' : '新增画像';
  if (profile) Object.entries(profile).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input) return;
    if (input.type === 'checkbox') input.checked = Boolean(value); else input.value = value ?? '';
  });
  $('#profileDialog').showModal();
}

async function submitProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form)); body.active = form.elements.active.checked;
  const profileId = body.id;
  try {
    await api(profileId ? `/api/profiles/${profileId}` : '/api/profiles', { method: profileId ? 'PUT' : 'POST', body: JSON.stringify(body) });
    form.closest('dialog').close(); await load(profileId || null); toast('画像已保存');
  } catch (error) { toast(error.message, 'error'); }
}

async function submitJob(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget));
  if (body.apply_url) body.application_channels = [{ type: '网申', label: '直接投递', url: body.apply_url, source_url: body.source_url }];
  try {
    const job = await api('/api/jobs', { method: 'POST', body: JSON.stringify(body) });
    event.currentTarget.reset(); event.currentTarget.closest('dialog').close(); await load();
    state.selectedJobId = job.id; renderJobs(); toast('岗位已收录');
  } catch (error) { toast(error.message, 'error'); }
}

async function collectJobs() {
  if (!state.selectedProfileId) return openProfileDialog();
  if (!state.settings.has_api_key) { switchView('settings'); toast('请先配置 AI 接口', 'error'); return; }
  const buttons = $$('#collectBtn, .mobile-collect');
  buttons.forEach((button) => { button.disabled = true; button.querySelector('span').textContent = '正在搜索'; });
  try {
    const result = await api('/api/collect', { method: 'POST', body: JSON.stringify({ profileId: state.selectedProfileId }) });
    await load(); toast(result.count ? `采集完成，新增或更新 ${result.count} 条岗位` : '没有发现新的岗位，已跳过缓存和重复链接');
  } catch (error) { toast(error.message, 'error'); }
  finally { buttons.forEach((button) => { button.disabled = false; button.querySelector('span').textContent = 'AI 搜岗位'; }); refreshIcons(); }
}

async function enrichCurrentJob() {
  const job = state.jobs.find((item) => item.id === state.selectedJobId); if (!job) return;
  const button = $('.enrich-job'); button.disabled = true; button.querySelector('span').textContent = '正在读取并补全';
  try {
    await api(`/api/jobs/${job.id}/enrich`, { method: 'POST', body: JSON.stringify({ profileId: state.selectedProfileId }) });
    await load(); state.selectedJobId = job.id; renderJobs(); toast('已更新招聘原文和公司资料');
  } catch (error) { toast(error.message, 'error'); }
  finally { if (document.body.contains(button)) button.disabled = false; }
}

async function enrichAllJobs() {
  const buttons = $$('#enrichAllBtn, .mobile-enrich-all');
  buttons.forEach((button) => { button.disabled = true; button.querySelector('span').textContent = '正在补全'; });
  try {
    const result = await api('/api/enrich', { method: 'POST', body: JSON.stringify({ profileId: state.selectedProfileId, limit: 20 }) });
    await load();
    const research = result.research || {};
    const jobText = result.total ? `读取原文 ${result.count}/${result.total} 条` : '岗位原文无需重复读取';
    const companyText = research.total ? `，公司资料 ${research.saved}/${research.total} 家` : '，公司资料均已检索';
    toast(`${jobText}${companyText}`);
  } catch (error) { toast(error.message, 'error'); }
  finally { buttons.forEach((button) => { button.disabled = false; button.querySelector('span').textContent = button.classList.contains('mobile-enrich-all') ? '补全信息' : '补全缺失信息'; }); refreshIcons(); }
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
  const sourceSites = String(data.source_sites || '').split('\n').map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    const name = parts.length > 1 ? parts[0] : '';
    const url = parts.length > 1 ? parts[1] : parts[0];
    if (!/^https?:\/\//i.test(url)) return null;
    const scope = ({ 学校: 'school', 省份: 'province', 公共: 'public', school: 'school', province: 'province', public: 'public' })[parts[2]] || 'public';
    return {
      name: name || new URL(url).hostname, url, enabled: true, access_scope: scope,
      school: scope === 'school' ? (parts[3] || '') : '', province: scope === 'province' ? (parts[3] || '') : '',
      login_required: /需登录|是|true/i.test(parts[4] || '')
    };
  }).filter(Boolean);
  const body = {
    api_key: data.api_key, clear_api_key: form.elements.clear_api_key.checked, model: data.model, api_base: data.api_base,
    source_sites: sourceSites,
    scheduler_enabled: form.elements.scheduler_enabled.checked,
    schedule_times: [data.schedule_1, data.schedule_2, data.schedule_3].filter(Boolean)
  };
  try {
    await api('/api/settings', { method: 'POST', body: JSON.stringify(body) });
    form.elements.api_key.value = ''; form.elements.clear_api_key.checked = false;
    await load(); toast('采集设置已保存');
  } catch (error) { toast(error.message, 'error'); }
}

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('.nav-item'); if (nav) return switchView(nav.dataset.view);
  if (event.target.closest('#mobileMenu')) return $('.sidebar').classList.toggle('open');
  if (event.target.closest('#addProfileBtn, #addProfileSide, .empty-add-profile')) return openProfileDialog();
  if (event.target.closest('#addJobBtn, .mobile-add-job, .empty-add-job')) return $('#jobDialog').showModal();
  if (event.target.closest('#enrichAllBtn, .mobile-enrich-all')) return enrichAllJobs();
  if (event.target.closest('#collectBtn, .mobile-collect')) return collectJobs();
  if (event.target.closest('.retry-load')) return load();
  const close = event.target.closest('.close-dialog'); if (close) return close.closest('dialog').close();
  const profileButton = event.target.closest('[data-profile-id]');
  if (profileButton) { state.selectedProfileId = profileButton.dataset.profileId; state.selectedJobId = null; await load(state.selectedProfileId); return; }
  const edit = event.target.closest('.edit-profile'); if (edit) return openProfileDialog(state.profiles.find((item) => item.id === edit.dataset.id));
  const remove = event.target.closest('.delete-profile');
  if (remove && confirm('确定删除这个画像？岗位库不会被删除。')) {
    try { await api(`/api/profiles/${remove.dataset.id}`, { method: 'DELETE' }); await load(); toast('画像已删除'); } catch (error) { toast(error.message, 'error'); }
    return;
  }
  const watchFilter = event.target.closest('[data-watch-filter]');
  if (watchFilter) { state.watchFilter = watchFilter.dataset.watchFilter; renderWatchlist(); refreshIcons(); return; }
  const watchJob = event.target.closest('[data-watch-job-id]');
  if (watchJob) { state.selectedJobId = watchJob.dataset.watchJobId; switchView('jobs'); renderJobs(); $('#jobDetail').classList.add('open'); return; }
  const jobCard = event.target.closest('[data-job-id]');
  if (jobCard) { state.selectedJobId = jobCard.dataset.jobId; renderJobs(); $('#jobDetail').classList.add('open'); $('#mobileJobsActions').classList.add('detail-hidden'); return; }
  if (event.target.closest('.detail-back')) { $('#jobDetail').classList.remove('open'); $('#mobileJobsActions').classList.remove('detail-hidden'); return; }
  if (event.target.closest('.enrich-job')) return enrichCurrentJob();
  const review = event.target.closest('.review-button');
  if (review) {
    try {
      await api(`/api/matches/${state.selectedProfileId}/${state.selectedJobId}`, { method: 'POST', body: JSON.stringify({ review_status: review.dataset.status }) });
      await load(); toast(`投递进度已更新为：${reviewLabels[review.dataset.status]}`);
    } catch (error) { toast(error.message, 'error'); }
  }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('#profileForm [name="school"]')) {
    const province = schoolProvinceMap[event.target.value.trim()];
    const provinceInput = $('#profileForm [name="school_province"]');
    if (province && provinceInput && !provinceInput.value) provinceInput.value = province;
    return;
  }
  if (event.target.id === 'applyChannelSelect') {
    const selected = event.target.selectedOptions[0];
    const button = $('#applyButton');
    const note = $('#applySourceNote');
    if (button) button.href = selected.value;
    if (note) note.textContent = `${selected.dataset.categoryLabel}${selected.dataset.category === 'official' ? ' · 企业招聘官网' : ' · 非企业官网入口'}`;
  }
});

['jobSearch', 'employmentFilter', 'eligibilityFilter', 'companyTypeFilter', 'reviewFilter', 'sortJobs'].forEach((id) => {
  $(`#${id}`).addEventListener(id === 'jobSearch' ? 'input' : 'change', renderJobs);
});
$('#profileForm').addEventListener('submit', submitProfile);
$('#jobForm').addEventListener('submit', submitJob);
$('#settingsForm').addEventListener('submit', saveSettings);

load().catch((error) => {
  toast(error.message, 'error');
  $('#jobList').innerHTML = emptyHtml('circle-alert', '服务连接失败', error.message, '重试', 'retry-load');
});

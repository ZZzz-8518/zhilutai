const $ = (selector) => document.querySelector(selector);
const apiBase = $('#apiBase');
const profiles = $('#profiles');
const fill = $('#fill');
const status = $('#status');

chrome.storage.local.get(['apiBase', 'profileId'], (saved) => {
  if (saved.apiBase) apiBase.value = saved.apiBase;
  loadProfiles(saved.profileId);
});

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function loadProfiles(selectedId = '') {
  fill.disabled = true;
  profiles.innerHTML = '<option>正在读取...</option>';
  const base = apiBase.value.replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/api/bootstrap`);
    if (!response.ok) throw new Error('职路台服务未响应');
    const data = await response.json();
    const list = Array.isArray(data.profiles) ? data.profiles : [];
    profiles.innerHTML = list.length ? list.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.name)} · ${escapeHtml(profile.major)}</option>`).join('') : '<option value="">暂无画像</option>';
    profiles.value = selectedId && list.some((item) => item.id === selectedId) ? selectedId : (data.selected_profile_id || list[0]?.id || '');
    fill.disabled = !profiles.value;
    showStatus(list.length ? `已读取 ${list.length} 个画像` : '请先在职路台创建画像');
  } catch (error) {
    profiles.innerHTML = '<option value="">读取失败</option>';
    showStatus(`${error.message}。请先启动职路台`, true);
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function fillCurrentPage() {
  const base = apiBase.value.replace(/\/+$/, '');
  const profileId = profiles.value;
  if (!profileId) return;
  try {
    const response = await fetch(`${base}/api/profiles/${encodeURIComponent(profileId)}`);
    if (!response.ok) throw new Error('画像读取失败');
    const profile = await response.json();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('未找到当前网页');
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillFormFields, args: [profile] });
    const summary = result?.[0]?.result || { filled: 0, skipped: 0 };
    await chrome.storage.local.set({ apiBase: base, profileId });
    showStatus(`已填写 ${summary.filled} 项，跳过 ${summary.skipped} 项。请检查后手动提交。`);
  } catch (error) { showStatus(error.message, true); }
}

function fillFormFields(profile) {
  const values = {
    name: profile.name,
    realname: profile.name,
    idnumber: profile.id_number,
    id_number: profile.id_number,
    gender: profile.gender,
    sex: profile.gender,
    ethnicity: profile.ethnicity,
    nation: profile.ethnicity,
    nationality: profile.ethnicity,
    nativeplace: profile.native_place,
    native_place: profile.native_place,
    politicalstatus: profile.political_status,
    politics: profile.political_status,
    political: profile.political_status,
    foreignlanguage: profile.foreign_language,
    language: profile.foreign_language,
    overseasstudent: profile.overseas_student,
    overseas: profile.overseas_student,
    healthstatus: profile.health_status,
    health: profile.health_status,
    phone: profile.phone,
    mobile: profile.phone,
    telephone: profile.phone,
    email: profile.email,
    school: profile.school,
    university: profile.school,
    college: profile.school,
    major: profile.major,
    specialty: profile.major,
    education: profile.education,
    degree: profile.education,
    graduationyear: profile.graduation_year,
    graduation_year: profile.graduation_year,
    skills: profile.skills,
    certificates: profile.certificates,
    city: profile.preferred_cities,
    address: profile.current_residence
  };
  const aliases = {
    name: ['姓名', '真实姓名', '应聘者姓名'], idnumber: ['身份证号', '身份证号码', '证件号码'], gender: ['性别'],
    ethnicity: ['民族'], nativeplace: ['籍贯'], politicalstatus: ['政治面貌'], foreignlanguage: ['外语水平', '英语水平'],
    overseasstudent: ['是否留学生', '留学生'], healthstatus: ['健康状况', '身体状况'],
    phone: ['手机', '手机号', '联系电话', '移动电话'], email: ['邮箱', '电子邮箱', 'Email'],
    school: ['学校', '毕业院校', '院校'], major: ['专业', '所学专业'], education: ['学历', '最高学历'], degree: ['学位'],
    graduationyear: ['毕业年份', '预计毕业时间', '毕业时间'], skills: ['技能', '个人特长'], certificates: ['证书', '资格证书'],
    city: ['期望工作地点', '意向工作地点'], address: ['现居住地', '居住地']
  };
  const normalize = (value) => String(value || '').toLowerCase().replace(/[\s_\-（）()]/g, '');
  const elements = [...document.querySelectorAll('input, textarea, select, [contenteditable="true"]')].filter((element) => !element.disabled && element.type !== 'hidden' && element.type !== 'file' && element.type !== 'password');
  let filled = 0;
  for (const element of elements) {
    const label = normalize(`${element.name} ${element.id} ${element.placeholder} ${element.getAttribute('aria-label') || ''} ${element.labels?.[0]?.textContent || ''}`);
    const key = Object.keys(values).find((candidate) => label.includes(normalize(candidate)) || (aliases[candidate] || []).some((alias) => label.includes(normalize(alias))));
    const value = key ? values[key] : '';
    if (!value || !key || element.value) continue;
    if (element.tagName === 'SELECT') {
      const option = [...element.options].find((item) => normalize(item.textContent).includes(normalize(value)) || normalize(value).includes(normalize(item.textContent)));
      if (!option) continue;
      element.value = option.value;
    } else if (element.isContentEditable) {
      element.textContent = String(value);
    } else {
      const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set;
      setter?.call(element, String(value));
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    filled += 1;
  }
  const experiences = String(profile.experience_text || '').split(/\n+/).map((line) => line.split('|').map((item) => item.trim())).filter((parts) => parts.length >= 5 && parts.some(Boolean));
  if (experiences.length) {
    const experienceFields = [
      { terms: ['开始日期', '起始日期', '开始时间'], value: experiences[0][0] },
      { terms: ['结束日期', '终止日期', '结束时间'], value: experiences[0][1] },
      { terms: ['单位名称', '实习单位', '公司名称'], value: experiences[0][2] },
      { terms: ['岗位名称', '职位名称', '实习岗位'], value: experiences[0][3] },
      { terms: ['工作内容', '工作内容描述', '实习内容'], value: experiences[0].slice(4).join(' | ') }
    ];
    for (const field of experienceFields) {
      if (!field.value) continue;
      const target = elements.find((element) => {
        if (element.value || element.textContent?.trim()) return false;
        const label = normalize(`${element.name} ${element.id} ${element.placeholder} ${element.getAttribute('aria-label') || ''} ${element.labels?.[0]?.textContent || ''}`);
        return field.terms.some((term) => label.includes(normalize(term)));
      });
      if (!target) continue;
      if (target.tagName === 'TEXTAREA' || target.isContentEditable) target.value = field.value;
      else target.value = field.value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      filled += 1;
    }
  }
  return { filled, skipped: Math.max(0, elements.length - filled) };
}

$('#fill').addEventListener('click', fillCurrentPage);
$('#reload').addEventListener('click', () => loadProfiles(profiles.value));

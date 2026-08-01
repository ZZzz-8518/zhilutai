const CITY_COORDS = {
  '济南': [36.6512, 117.1201], '泰安': [36.2003, 117.0876], '淄博': [36.8135, 118.0548],
  '聊城': [36.4570, 115.9854], '德州': [37.4355, 116.3593], '滨州': [37.3827, 117.9707],
  '济宁': [35.4149, 116.5871], '东营': [37.4346, 118.6747], '潍坊': [36.7069, 119.1618],
  '临沂': [35.1047, 118.3564], '菏泽': [35.2338, 115.4807], '青岛': [36.0671, 120.3826],
  '日照': [35.4164, 119.5269], '烟台': [37.4638, 121.4479], '威海': [37.5131, 122.1204],
  '枣庄': [34.8105, 117.3237], '北京': [39.9042, 116.4074], '天津': [39.0842, 117.2009],
  '石家庄': [38.0428, 114.5149], '保定': [38.8740, 115.4646], '郑州': [34.7466, 113.6254],
  '南京': [32.0603, 118.7969], '苏州': [31.2989, 120.5853], '上海': [31.2304, 121.4737],
  '杭州': [30.2741, 120.1551], '合肥': [31.8206, 117.2272], '武汉': [30.5928, 114.3055],
  '西安': [34.3416, 108.9398], '成都': [30.5728, 104.0668], '重庆': [29.4316, 106.9123],
  '长沙': [28.2282, 112.9388], '广州': [23.1291, 113.2644], '深圳': [22.5431, 114.0579],
  '厦门': [24.4798, 118.0894], '福州': [26.0745, 119.2965], '沈阳': [41.8057, 123.4315],
  '大连': [38.9140, 121.6147], '哈尔滨': [45.8038, 126.5349], '长春': [43.8171, 125.3235]
};

const ELIGIBILITY_SCORES = {
  '明确符合': 100,
  '宽口径符合': 84,
  '未限制专业': 76,
  '优先但不排他': 66,
  '表述模糊': 56,
  '明确不符合': 0
};

function toRadians(value) {
  return value * Math.PI / 180;
}

function findCity(value = '') {
  const text = String(value);
  return Object.keys(CITY_COORDS).find((city) => text.includes(city)) || '';
}

function cityDistance(leftCity, rightCity) {
  if (!leftCity || !rightCity || !CITY_COORDS[leftCity] || !CITY_COORDS[rightCity]) return null;
  if (leftCity === rightCity) return 0;
  const [leftLat, leftLon] = CITY_COORDS[leftCity];
  const [rightLat, rightLon] = CITY_COORDS[rightCity];
  const earthRadius = 6371;
  const dLat = toRadians(leftLat - rightLat);
  const dLon = toRadians(leftLon - rightLon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(rightLat)) * Math.cos(toRadians(leftLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function distanceToPreferredCities(jobLocation = '', preferredCities = '') {
  const preferences = normalizeList(preferredCities).map(findCity).filter(Boolean);
  if (!preferences.length) return null;
  if (preferences.some((city) => String(jobLocation).includes(city))) return 0;
  const jobCity = findCity(jobLocation);
  if (!jobCity) return null;
  const distances = preferences.map((city) => cityDistance(jobCity, city)).filter((value) => value !== null);
  return distances.length ? Math.min(...distances) : null;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value || '').split(/[，,、;；\n]/).map((item) => item.trim()).filter(Boolean);
}

function inferEmploymentType(value = '') {
  const text = String(value);
  const hasInternship = /实习|暑期项目|暑期生|实训生/.test(text);
  const hasCampusJob = /高校毕业生招聘|校园招聘|校招|应届毕业生招聘|正式岗|秋季招聘|春季招聘/.test(text);
  if (hasInternship && hasCampusJob) return '校招+实习';
  if (hasInternship) return '实习';
  if (hasCampusJob) return '正式校招';
  return '待确认';
}

function inferEligibility(profile, job) {
  const text = `${job.title || ''} ${job.description || ''}`;
  if (/专业不限|不限专业|不限学科/.test(text)) return '未限制专业';
  const majors = [profile.major, ...normalizeList(profile.related_majors)].filter(Boolean);
  if (majors.some((major) => text.toLowerCase().includes(major.toLowerCase()))) return '明确符合';
  if (/相关专业|相近专业|理工类|工学类|经管类|计算机类|电子信息类|大类/.test(text)) return '宽口径符合';
  if (/优先/.test(text)) return '优先但不排他';
  return '表述模糊';
}

function inferFit(profile, job) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${job.description || ''} ${job.company || ''}`.toLowerCase();
  const terms = [profile.major, ...normalizeList(profile.skills), ...normalizeList(profile.certificates)]
    .filter(Boolean).map((item) => item.toLowerCase());
  const profileText = `${profile.major || ''} ${profile.related_majors || ''}`.toLowerCase();
  const directHits = terms.filter((item) => text.includes(item)).length;

  if (/电气|电力系统|电力电子|自动化|控制工程|电机/.test(profileText)) {
    const strong = /电气|电力|电网|电控|自动化|控制工程|电机|变电|输配电|继电保护|电力电子/;
    const related = /电子|能源|新能源|储能|光伏|风电|电池|充电|半导体|芯片|电力装备|智能制造|设备工程|工艺工程/;
    const conflictingTitle = /土建|土木|建筑|施工|结构设计|机械工程|算法|软件|数据运营|市场|管培|财务|法务|人力/;
    if (strong.test(title)) return 88;
    if (conflictingTitle.test(title)) return 24;
    if (strong.test(text)) return 72;
    if (related.test(title)) return 68;
    if (related.test(text)) return 56;
    if (directHits) return 66;
    return 28;
  }

  if (/土木|结构|建筑|岩土|道路|桥梁|工程管理/.test(profileText)) {
    const strong = /土木|土建|结构|建筑|岩土|道路|桥梁|施工|工程管理|项目管理|基建|房建|工程设计/;
    const related = /有限元|仿真|工程咨询|设计院|轨道|交通|EPC|厂房|可靠性|力学/;
    const conflictingTitle = /电气|电控|算法|软件|数据运营|财务|法务|人力/;
    if (strong.test(title)) return 88;
    if (conflictingTitle.test(title)) return 24;
    if (strong.test(text)) return 72;
    if (related.test(title)) return 68;
    if (related.test(text)) return 56;
    if (directHits) return 66;
    return 28;
  }

  if (!terms.length) return 50;
  return Math.min(100, 42 + Math.round((directHits / terms.length) * 58));
}

function calculateMatch(profile, job, overrides = {}) {
  const eligibility = overrides.eligibility || inferEligibility(profile, job);
  const fitScore = Number.isFinite(Number(overrides.fit_score)) ? Number(overrides.fit_score) : inferFit(profile, job);
  const hasLocationPreference = normalizeList(profile.preferred_cities).length > 0;
  const distance = hasLocationPreference
    ? distanceToPreferredCities(`${job.city || ''}${job.district || ''}${job.address || ''}`, profile.preferred_cities)
    : null;
  const locationScore = distance === null ? 50 : Math.max(10, Math.round(100 - distance / 12));
  const eligibilityScore = ELIGIBILITY_SCORES[eligibility] ?? 50;
  const totalScore = hasLocationPreference
    ? Math.round(eligibilityScore * 0.5 + fitScore * 0.3 + locationScore * 0.2)
    : Math.round(eligibilityScore * 0.6 + fitScore * 0.4);
  return {
    eligibility,
    fit_score: fitScore,
    location_distance: distance,
    location_score: locationScore,
    total_score: eligibility === '明确不符合' ? Math.min(totalScore, 20) : totalScore,
    reasons: overrides.reasons || [],
    gaps: overrides.gaps || [],
    evidence: overrides.evidence || [],
    ai_summary: overrides.ai_summary || ''
  };
}

module.exports = { CITY_COORDS, ELIGIBILITY_SCORES, cityDistance, distanceToPreferredCities, calculateMatch, normalizeList, inferEmploymentType };

const CATEGORY_META = {
  official: { label: '企业招聘官网', rank: 0 },
  school: { label: '学校就业网', rank: 1 },
  public: { label: '公共招聘平台', rank: 2 },
  other: { label: '其他入口', rank: 3 }
};

function hostname(value = '') {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function classifyApplicationUrl(url, context = {}) {
  const host = hostname(url);
  const text = `${context.type || ''} ${context.label || ''} ${context.source_name || ''}`;
  if (!host) return 'other';

  if (/ncss\.cn$|bjbys\.net\.cn$|job\.gd\.gov\.cn$|ejobmart\.cn$|iguopin\.com$|job\.mohrss\.gov\.cn$|yingjiesheng\.com$|gaoxiaojob\.com$|firstjob\.shec\.edu\.cn$/i.test(host)
    || /^(?:www\.)?91job\.org\.cn$/i.test(host)) return 'public';
  if (/\.edu\.cn$/i.test(host) || (/\.91job\.org\.cn$/i.test(host) && !/^(?:www\.)?91job\.org\.cn$/i.test(host))
    || /学校|大学|学院|就业网/.test(text)) return 'school';
  if (/zhipin\.com$|nowcoder\.com$|weixin\.qq\.com$|xiaohongshu\.com$|douyin\.com$|zhihu\.com$|bilibili\.com$|51job\.com$/.test(host)
    && !/^campus\.51job\.com$/i.test(host)) return 'other';
  if (/官网|官方|企业网申/.test(text)
    || /(^|\.)(?:job|jobs|campus|career|careers|hr|recruit|zhaopin)\./i.test(host)
    || /\/(?:campus|career|careers|recruit|recruitment|jobs?)(?:\/|$)/i.test(new URL(url).pathname)
    || (/\.zhiye\.com$|\.hotjob\.cn$|\.jobs\.feishu\.cn$/i.test(host) && !/^www\./i.test(host))) return 'official';
  return 'other';
}

function buildApplicationOptions(job = {}) {
  const candidates = [];
  for (const channel of Array.isArray(job.application_channels) ? job.application_channels : []) {
    const url = String(channel?.url || channel?.source_url || '').trim();
    if (/^https?:\/\//i.test(url)) candidates.push({ ...channel, url });
  }
  if (/^https?:\/\//i.test(job.apply_url || '')) {
    candidates.push({ type: '投递入口', label: '主要投递入口', url: job.apply_url });
  }
  if (/^https?:\/\//i.test(job.source_url || '')) {
    candidates.push({ type: '招聘原文', label: job.source_name || '招聘原文', url: job.source_url, source_name: job.source_name });
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const key = candidate.url.replace(/\/+$/, '').toLowerCase();
    const category = classifyApplicationUrl(candidate.url, candidate);
    const meta = CATEGORY_META[category];
    const option = {
      url: candidate.url,
      type: candidate.type || '投递入口',
      label: candidate.label || candidate.value || meta.label,
      category,
      category_label: meta.label,
      rank: meta.rank
    };
    const existing = unique.get(key);
    if (!existing || option.rank < existing.rank) unique.set(key, option);
  }
  return [...unique.values()].sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label, 'zh-CN'));
}

module.exports = { CATEGORY_META, classifyApplicationUrl, buildApplicationOptions };

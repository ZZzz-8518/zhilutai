const WATCHLIST = [
  ['国家电网', ['国家电网'], '央企', ['电力', '能源', '土木', '结构', '工程'], 9, '9-11月分批招聘', '网申、资格审查、笔试、面试', 'https://zhaopin.sgcc.com.cn/'],
  ['南方电网', ['南方电网'], '央企', ['电力', '能源', '土木', '结构', '工程'], 9, '9-11月提前批及秋招', '网申、统一笔试、面试', 'https://zhaopin.csg.cn/'],
  ['中国华能', ['中国华能', '华能集团'], '央企', ['电力', '能源', '土木', '工程'], 8, '8-10月陆续启动', '网申、测评或笔试、面试', 'https://zhaopin.chng.com.cn/'],
  ['中国大唐', ['中国大唐', '大唐集团'], '央企', ['电力', '能源', '土木', '工程'], 8, '8-10月陆续启动', '网申、笔试、面试', 'https://www.cdtrczp.com/'],
  ['中国华电', ['中国华电', '华电集团'], '央企', ['电力', '能源', '土木', '工程'], 8, '8-10月陆续启动', '网申、测评、面试', 'https://chd.zhiye.com/'],
  ['国家电投', ['国家电投', '国家电力投资'], '央企', ['电力', '能源', '新能源', '土木', '工程'], 7, '7-10月提前批及秋招', '网申、测评、面试', 'https://zhaopin.spic.com.cn/'],
  ['国家能源集团', ['国家能源集团', '国家能源投资'], '央企', ['电力', '能源', '新能源', '土木', '工程'], 9, '9-11月集中招聘', '网申、全国统考、面试', 'https://zhaopin.chnenergy.com.cn/'],
  ['中国电建', ['中国电建', '电建集团'], '央企', ['电力', '能源', '土木', '结构', '工程'], 7, '7-10月成员单位陆续招聘', '网申或成员单位投递、测评、面试', 'https://zhaopin.powerchina.cn/'],
  ['中国能建', ['中国能建', '能源建设集团'], '央企', ['电力', '能源', '土木', '结构', '工程'], 7, '7-10月成员单位陆续招聘', '网申或成员单位投递、面试', 'https://zhaopin.ceec.net.cn/'],
  ['中广核', ['中广核', '中国广核'], '央企', ['核电', '能源', '土木', '结构', '工程'], 7, '7-9月提前批及秋招', '网申、测评、面试', 'https://cgn.hotjob.cn/'],
  ['中国建筑', ['中国建筑', '中建'], '央企', ['土木', '结构', '建筑', '工程'], 6, '6-10月提前批及秋招', '网申、统一测评、面试', 'https://job.cscec.com/'],
  ['中国中铁', ['中国中铁', '中铁'], '央企', ['土木', '结构', '轨道', '工程'], 7, '7-10月成员单位陆续招聘', '网申或现场投递、面试', 'https://zhaopin.crec.cn/'],
  ['中国铁建', ['中国铁建', '中铁建'], '央企', ['土木', '结构', '轨道', '工程'], 7, '7-10月成员单位陆续招聘', '网申或现场投递、面试', 'https://crcc.zhiye.com/'],
  ['中交集团', ['中交集团', '中国交建'], '央企', ['土木', '结构', '交通', '工程'], 7, '7-10月提前批及秋招', '网申、测评、面试', 'https://ccccltd.zhiye.com/'],
  ['比亚迪', ['比亚迪'], '大型民企或大厂', ['汽车', '新能源', '制造', '结构', '工程'], 6, '6-9月提前批及秋招', '网申、测评、面试', 'https://job.byd.com/'],
  ['吉利汽车', ['吉利', '极氪'], '大型民企或大厂', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://campus.geely.com/'],
  ['上汽集团', ['上汽集团', '上海汽车'], '地方国企', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-10月秋招', '网申、测评、面试', 'https://campus.saicmotor.com/'],
  ['小鹏汽车', ['小鹏', '橙鹏汽车'], '大型民企或大厂', ['汽车', '新能源', '制造', '结构', '工程'], 6, '6-9月提前批及秋招', '网申、测评、面试', 'https://campus.xiaopeng.com/'],
  ['蔚来', ['蔚来'], '大型民企或大厂', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://nio.jobs.feishu.cn/campus'],
  ['理想汽车', ['理想汽车'], '大型民企或大厂', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://www.lixiang.com/careers'],
  ['小米集团', ['小米', '小米汽车'], '大型民企或大厂', ['汽车', '智能制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://hr.xiaomi.com/campus'],
  ['宁德时代', ['宁德时代'], '大型民企或大厂', ['新能源', '电池', '制造', '结构', '工程'], 6, '6-9月提前批及秋招', '网申、测评、面试', 'https://career.catl.com/'],
  ['京东方', ['京东方'], '地方国企', ['智能制造', '显示', '结构', '工程'], 6, '6-9月提前批及秋招', '网申、测评、面试', 'https://boe.zhiye.com/'],
  ['中国中车', ['中国中车', '中车'], '央企', ['轨道', '制造', '结构', '工程'], 7, '7-10月成员单位招聘', '网申、测评或笔试、面试', 'https://crrc.zhiye.com/'],
  ['三一集团', ['三一'], '大型民企或大厂', ['装备制造', '智能制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://sany.zhiye.com/'],
  ['徐工集团', ['徐工'], '地方国企', ['装备制造', '智能制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://xcmg.zhiye.com/'],
  ['中国三峡集团', ['中国三峡', '三峡集团'], '央企', ['水电', '新能源', '能源', '土木', '工程'], 8, '8-10月秋招', '网申、统一笔试、面试', 'https://hr.ctg.com.cn/'],
  ['中国核工业集团', ['中核集团', '中国核工业'], '央企', ['核电', '能源', '土木', '结构', '工程'], 8, '8-10月秋招', '网申、测评或笔试、面试', 'https://cnnc.chinahr.com/'],
  ['中国石油', ['中国石油', '中石油'], '央企', ['能源', '石化', '土木', '工程'], 9, '9-10月秋招', '网申、统一考试、面试', 'https://zhaopin.cnpc.com.cn/'],
  ['中国石化', ['中国石化', '中石化'], '央企', ['能源', '石化', '土木', '工程'], 9, '9-10月秋招', '网申、统一考试、面试', 'https://job.sinopec.com/'],
  ['中国海油', ['中国海油', '中海油'], '央企', ['海洋工程', '能源', '土木', '结构', '工程'], 9, '9-10月秋招', '网申、统一考试、面试', 'https://cnooc.zhaopin.com/'],
  ['中国中煤', ['中国中煤', '中煤集团'], '央企', ['矿业', '能源', '土木', '工程'], 9, '9-11月秋招', '网申、笔试、面试', 'https://zhaopin.chinacoal.com/'],
  ['华润集团', ['华润集团', '华润电力'], '央企', ['电力', '能源', '基建', '工程'], 8, '8-10月秋招', '网申、测评、面试', 'https://career.crc.com.cn/'],
  ['中国五矿', ['中国五矿', '五矿集团', '中冶集团'], '央企', ['冶金', '矿业', '土木', '结构', '工程'], 8, '8-10月秋招', '网申、测评、面试', 'https://campus.51job.com/minmetals/'],
  ['中国一汽', ['中国一汽', '一汽集团'], '央企', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://fawcampus.zhiye.com/'],
  ['东风汽车', ['东风汽车', '东风集团'], '央企', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-10月秋招', '网申、测评、面试', 'https://dfmc.zhiye.com/'],
  ['长安汽车', ['长安汽车'], '央企', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://changan.zhiye.com/'],
  ['广汽集团', ['广汽集团', '广州汽车'], '地方国企', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-10月秋招', '网申、测评、面试', 'https://campus.gac.com.cn/'],
  ['长城汽车', ['长城汽车'], '大型民企或大厂', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://career.gwm.cn/'],
  ['奇瑞汽车', ['奇瑞汽车', '奇瑞集团'], '地方国企', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://chery.zhiye.com/'],
  ['零跑汽车', ['零跑汽车'], '大型民企或大厂', ['汽车', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://leapmotor.zhiye.com/'],
  ['中国商飞', ['中国商飞', '商飞集团'], '央企', ['航空', '制造', '结构', '力学', '工程'], 8, '8-10月秋招', '网申、测评、面试', 'https://campus.comac.cc/'],
  ['中国航空工业', ['中国航空工业', '航空工业集团', '中航工业'], '央企', ['航空', '制造', '结构', '力学', '工程'], 8, '8-10月秋招', '网申、测评或笔试、面试', 'https://avic.zhiye.com/'],
  ['中国船舶集团', ['中国船舶', '中船集团'], '央企', ['船舶', '海洋工程', '制造', '结构', '工程'], 8, '8-10月秋招', '网申、测评、面试', 'https://cssc.zhiye.com/'],
  ['华为', ['华为'], '大型民企或大厂', ['智能制造', '数字能源', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://career.huawei.com/reccampportal/portal5/campus-recruitment.html'],
  ['美的集团', ['美的集团', '美的'], '大型民企或大厂', ['智能制造', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://careers.midea.com/schoolOut'],
  ['海尔集团', ['海尔集团', '海尔智家'], '大型民企或大厂', ['智能制造', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://maker.haier.net/client/campus'],
  ['金风科技', ['金风科技'], '大型民企或大厂', ['风电', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://goldwind.zhiye.com/'],
  ['远景能源', ['远景能源', '远景科技'], '大型民企或大厂', ['风电', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://envision-group.zhiye.com/'],
  ['阳光电源', ['阳光电源'], '大型民企或大厂', ['光伏', '储能', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://sungrow.zhiye.com/'],
  ['隆基绿能', ['隆基绿能', '隆基股份'], '大型民企或大厂', ['光伏', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://longi.zhiye.com/'],
  ['中联重科', ['中联重科'], '地方国企', ['装备制造', '智能制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://zoomlion.zhiye.com/'],
  ['山东能源集团', ['山东能源集团', '山东能源'], '地方国企', ['能源', '矿业', '电力', '土木', '工程'], 8, '8-10月秋招', '网申、笔试、面试', 'https://snjt.iguopin.com/'],
  ['山东高速集团', ['山东高速集团', '山东高速'], '地方国企', ['交通', '基建', '土木', '工程'], 8, '8-10月秋招', '网申、笔试、面试', 'http://zhaopin.sdhsg.com/'],
  ['中国重汽', ['中国重汽', '重汽集团'], '地方国企', ['汽车', '装备制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://sinotruk.zhiye.com/'],
  ['潍柴动力', ['潍柴动力', '潍柴集团'], '地方国企', ['动力装备', '汽车', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://weichai.zhiye.com/'],
  ['海信集团', ['海信集团', '海信'], '地方国企', ['智能制造', '显示', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://hisense.zhiye.com/'],
  ['浪潮集团', ['浪潮集团', '浪潮'], '地方国企', ['数据中心', '数字基建', '智能制造', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://inspur.zhiye.com/'],
  ['山东电工电气', ['山东电工电气'], '央企', ['电网装备', '电力', '制造', '结构', '工程'], 8, '8-10月秋招', '网申、笔试、面试', 'https://zhaopin.sgcc.com.cn/'],
  ['山东泰开', ['山东泰开', '泰开集团'], '大型民企或大厂', ['电力装备', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://taikai.zhiye.com/'],
  ['杰瑞集团', ['杰瑞集团', '杰瑞石油'], '大型民企或大厂', ['能源装备', '油气', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://jereh.zhiye.com/'],
  ['歌尔股份', ['歌尔股份', '歌尔集团'], '大型民企或大厂', ['智能制造', '消费电子', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://goertek.zhiye.com/'],
  ['中国铁塔', ['中国铁塔', '铁塔公司'], '央企', ['通信基建', '结构', '工程管理', '工程'], 8, '8-10月秋招', '网申、笔试、面试', 'https://zhaopin.chinatowercom.cn/'],
  ['中国移动', ['中国移动'], '央企', ['通信基建', '数据中心', '工程管理', '工程'], 8, '8-10月秋招', '网申、统一笔试、面试', 'https://job.10086.cn/'],
  ['中国电信', ['中国电信'], '央企', ['通信基建', '数据中心', '工程管理', '工程'], 8, '8-10月秋招', '网申、统一笔试、面试', 'https://job.chinatelecom.com.cn/'],
  ['中国联通', ['中国联通'], '央企', ['通信基建', '数据中心', '工程管理', '工程'], 8, '8-10月秋招', '网申、统一笔试、面试', 'https://zglt2026.zhaopin.com/'],
  ['中国航天科技', ['中国航天科技', '航天科技集团'], '央企', ['航天', '制造', '结构', '力学', '工程'], 8, '8-10月秋招', '网申、测评或笔试、面试', 'https://www.spacetalent.com.cn/'],
  ['中国航天科工', ['中国航天科工', '航天科工集团'], '央企', ['航天', '制造', '结构', '力学', '工程'], 8, '8-10月秋招', '网申、测评或笔试、面试', 'https://casic.zhiye.com/'],
  ['中国铝业集团', ['中国铝业集团', '中铝集团'], '央企', ['材料', '矿业', '工业工程', '土木', '工程'], 8, '8-10月秋招', '网申、笔试、面试', 'https://chinalco.zhiye.com/'],
  ['中国化学工程', ['中国化学工程', '中国化学'], '央企', ['EPC', '化工', '土木', '结构', '工程'], 7, '7-10月成员单位招聘', '网申、测评、面试', 'https://cncec.zhiye.com/'],
  ['东方电气', ['东方电气'], '央企', ['电力装备', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://dongfang.zhiye.com/'],
  ['上海电气', ['上海电气'], '地方国企', ['电力装备', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://shanghai-electric.zhiye.com/'],
  ['哈尔滨电气集团', ['哈尔滨电气', '哈电集团'], '央企', ['电力装备', '能源', '制造', '结构', '工程'], 8, '8-10月秋招', '网申、测评、面试', 'https://harbin-electric.zhiye.com/'],
  ['特变电工', ['特变电工'], '大型民企或大厂', ['电力装备', '新能源', '制造', '结构', '工程'], 7, '7-9月秋招', '网申、测评、面试', 'https://tbea.zhiye.com/']
].map(([name, aliases, company_type, tags, start_month, expected_start, process, recruitment_url]) => ({
  name, aliases, company_type, tags, start_month, expected_start, process, recruitment_url
}));

function inferCompanyType(company = '') {
  const item = WATCHLIST.find((entry) => entry.aliases.some((alias) => String(company).includes(alias)));
  if (item) return item.company_type;
  if (/大学|学院|研究所|事业单位|委员会|政府|中心/.test(company)) return '事业单位';
  if (/中国建筑|中国中铁|中国铁建|中国交建|中建|中铁|中交|国家电网|南方电网|中国电建|中国能建/.test(company)) return '央企';
  if (/集团有限公司$/.test(company)) return '其他';
  return '其他';
}

function profileWatchlistKeywords(profile = {}) {
  const text = `${profile.major || ''} ${profile.related_majors || ''} ${profile.preferred_industries || ''} ${profile.skills || ''}`.toLowerCase();
  const explicit = text.split(/[\s，,、;；/]+/).map((term) => term.trim()).filter((term) => term.length >= 2);
  if (/电气|电力系统|电力电子|自动化|控制工程|电机/.test(text)) {
    return [...new Set([...explicit, '电力', '电网', '电网装备', '电力装备', '能源', '新能源', '风电', '光伏', '核电', '储能', '电池', '数字能源', '自动化', '智能制造', '半导体', '数据中心', '轨道', '汽车'])];
  }
  if (/土木|结构|建筑|岩土|道路|桥梁|工程管理/.test(text)) {
    return [...new Set([...explicit, '土木', '结构', '建筑', '基建', '轨道', '交通', '工程管理', '工程咨询', 'EPC', '水电', '能源'])];
  }
  if (/机械|机电|车辆|材料|力学/.test(text)) {
    return [...new Set([...explicit, '机械', '机电', '汽车', '制造', '装备制造', '智能制造', '结构', '力学', '新能源', '航空', '航天', '船舶'])];
  }
  if (/计算机|软件|人工智能|电子信息|通信|数据科学/.test(text)) {
    return [...new Set([...explicit, '计算机', '软件', '人工智能', '通信', '数据中心', '数字基建', '智能制造', '半导体', '消费电子'])];
  }
  return explicit;
}

function profileDomain(profile = {}) {
  const text = `${profile.major || ''} ${profile.related_majors || ''}`.toLowerCase();
  if (/电气|电力系统|电力电子|自动化|控制工程|电机/.test(text)) return 'electrical';
  if (/土木|结构|建筑|岩土|道路|桥梁|工程管理/.test(text)) return 'civil';
  if (/机械|机电|车辆|材料|力学/.test(text)) return 'mechanical';
  if (/计算机|软件|人工智能|电子信息|通信|数据科学/.test(text)) return 'digital';
  return 'general';
}

const DOMAIN_CORE_TAGS = {
  electrical: ['电力', '电网装备', '电力装备', '新能源', '风电', '光伏', '核电', '水电', '储能', '电池', '数字能源', '数据中心'],
  civil: ['土木', '建筑', '基建', '交通', '工程管理', '工程咨询', 'EPC', '水电', '海洋工程'],
  mechanical: ['机械', '机电', '汽车', '制造', '装备制造', '智能制造', '动力装备', '航空', '航天', '船舶'],
  digital: ['计算机', '软件', '人工智能', '通信基建', '数据中心', '数字基建', '智能制造', '半导体', '消费电子']
};

const DOMAIN_SEARCH_EXPANSIONS = {
  electrical: ['京东方', '中国中车', '美的集团', '海尔集团', '中国商飞'],
  civil: ['比亚迪', '京东方', '中国商飞', '中国航天科技', '三一集团', '徐工集团'],
  mechanical: ['国家电网', '中广核', '华为', '京东方'],
  digital: ['国家电网', '比亚迪', '中国中车', '中国航天科技']
};

function tagMatchesTerms(tag, terms) {
  const normalizedTag = String(tag || '').toLowerCase();
  return terms.some((term) => term.includes(normalizedTag) || normalizedTag.includes(term));
}

function getRelevantWatchlist(profile) {
  if (!profile) return [];
  const domain = profileDomain(profile);
  const coreTags = DOMAIN_CORE_TAGS[domain] || [];
  const preferredIndustries = String(profile.preferred_industries || '').toLowerCase()
    .split(/[\s，,、;；/]+/).map((term) => term.trim()).filter((term) => term.length >= 2);
  if (coreTags.length) {
    return WATCHLIST.filter((item) => item.tags.some((tag) => tag !== '工程'
      && (coreTags.includes(tag) || tagMatchesTerms(tag, preferredIndustries))));
  }
  const keywords = profileWatchlistKeywords(profile);
  return WATCHLIST.filter((item) => item.tags.some((tag) => tag !== '工程' && tagMatchesTerms(tag, keywords)));
}

function getSearchWatchlist(profile) {
  const core = getRelevantWatchlist(profile);
  const expansionNames = new Set(DOMAIN_SEARCH_EXPANSIONS[profileDomain(profile)] || []);
  const combined = [...core, ...WATCHLIST.filter((item) => expansionNames.has(item.name))];
  return combined.filter((item, index) => combined.findIndex((candidate) => candidate.name === item.name) === index);
}

function getWatchlist(profile, jobs) {
  if (!profile) return [];
  const today = new Date();
  return getRelevantWatchlist(profile)
    .map((item) => {
      const relatedJobs = jobs.filter((job) => item.aliases.some((alias) => `${job.company || ''} ${job.title || ''}`.includes(alias)));
      const activeJobs = relatedJobs.filter((job) => !job.deadline || new Date(`${job.deadline}T23:59:59`) >= today);
      const status = activeJobs.length ? '已开始'
        : relatedJobs.length ? '已截止'
          : today.getMonth() + 1 < item.start_month ? '未开始' : '尚未发现本届公告';
      return {
        ...item,
        status,
        current_jobs: activeJobs.map((job) => ({ id: job.id, title: job.title, deadline: job.deadline, apply_url: job.apply_url || job.source_url })),
        evidence_note: `往年通常${item.expected_start}，实际安排以官方招聘网站为准`
      };
    })
    .sort((left, right) => {
      const order = { '已开始': 0, '未开始': 1, '尚未发现本届公告': 2, '已截止': 3 };
      return order[left.status] - order[right.status] || left.start_month - right.start_month;
    });
}

module.exports = {
  WATCHLIST, inferCompanyType, getWatchlist, profileWatchlistKeywords, profileDomain,
  getRelevantWatchlist, getSearchWatchlist
};

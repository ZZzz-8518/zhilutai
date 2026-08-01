const test = require('node:test');
const assert = require('node:assert/strict');
const { cityDistance, distanceToPreferredCities, calculateMatch, inferEmploymentType } = require('../src/scoring');

test('岗位命中画像意向城市时距离为 0', () => {
  assert.equal(distanceToPreferredCities('上海市浦东新区', '上海、杭州'), 0);
});

test('城市距离可用于意向城市排序', () => {
  assert.ok(cityDistance('苏州', '上海') < cityDistance('西安', '上海'));
});

test('画像未填写城市时不计入地点权重', () => {
  const profile = { major: '土木工程', preferred_cities: '', skills: '', certificates: '' };
  const local = calculateMatch(profile, { title: '土木岗', city: '济南', description: '土木工程' });
  const remote = calculateMatch(profile, { title: '土木岗', city: '深圳', description: '土木工程' });
  assert.equal(local.total_score, remote.total_score);
});

test('专业不限不会被误判为不符合', () => {
  const result = calculateMatch(
    { major: '材料科学', skills: '', certificates: '' },
    { title: '管理培训生', city: '济南', description: '2027届毕业生，专业不限' }
  );
  assert.equal(result.eligibility, '未限制专业');
  assert.ok(result.total_score > 50);
});

test('明确不符合会限制总分', () => {
  const result = calculateMatch(
    { major: '材料科学', skills: '', certificates: '' },
    { title: '财务岗', city: '济南', description: '' },
    { eligibility: '明确不符合', fit_score: 100 }
  );
  assert.ok(result.total_score <= 20);
});

test('电气画像会压低结构、算法等非电气岗位', () => {
  const profile = { major: '电气工程', related_majors: '自动化', preferred_cities: '' };
  const electrical = calculateMatch(profile, { title: '电气控制工程师', description: '新能源设备电控设计', company: '某能源公司' });
  const structural = calculateMatch(profile, { title: '结构设计研究员', description: '负责机械结构仿真', company: '某制造企业' });
  const algorithm = calculateMatch(profile, { title: '智能驾驶算法工程师', description: '负责规控算法开发', company: '某车企' });
  assert.ok(electrical.fit_score >= 70);
  assert.ok(structural.fit_score < 50);
  assert.ok(algorithm.fit_score < 50);
});

test('电气画像仍保留宽口径能源和制造岗位', () => {
  const profile = { major: '电气工程', related_majors: '', preferred_cities: '' };
  const broad = calculateMatch(profile, { title: '2027届校园招聘', description: '新能源、储能及智能制造多方向招聘', company: '麦田能源' });
  assert.ok(broad.fit_score >= 50);
});

test('区分正式校招、实习和混合公告', () => {
  assert.equal(inferEmploymentType('2027年高校毕业生招聘简章'), '正式校招');
  assert.equal(inferEmploymentType('2027届暑期实习生招募'), '实习');
  assert.equal(inferEmploymentType('2027届暑期实习生及高校毕业生招聘'), '校招+实习');
});

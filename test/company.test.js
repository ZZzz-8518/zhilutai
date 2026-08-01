const test = require('node:test');
const assert = require('node:assert/strict');
const { inferCompanyType, getWatchlist, getRelevantWatchlist } = require('../src/company');

test('识别重点企业类型', () => {
  assert.equal(inferCompanyType('国家电网有限公司'), '央企');
  assert.equal(inferCompanyType('比亚迪股份有限公司'), '大型民企或大厂');
});

test('校招日历只返回与工程画像相关的企业并关联在招岗位', () => {
  const items = getWatchlist(
    { major: '土木工程', related_majors: '结构工程', preferred_industries: '电力、汽车', skills: '有限元' },
    [{ id: 'job-1', company: '国家电网', title: '2027届土建岗', deadline: '2099-10-01', apply_url: 'https://example.com/apply' }]
  );
  const stateGrid = items.find((item) => item.name === '国家电网');
  assert.equal(stateGrid.status, '已开始');
  assert.equal(stateGrid.current_jobs[0].id, 'job-1');
});

test('电气画像的校招日历聚焦电力能源与电气可迁移行业', () => {
  const items = getRelevantWatchlist({ major: '电气工程', related_majors: '自动化、电力系统', preferred_industries: '新能源' });
  const names = items.map((item) => item.name);
  assert.ok(names.includes('国家电网'));
  assert.ok(names.includes('山东电工电气'));
  assert.ok(names.includes('东方电气'));
  assert.ok(names.includes('比亚迪'));
  assert.ok(!names.includes('中国建筑'));
  assert.ok(!names.includes('中交集团'));
});

test('不同专业的重点企业池保持明显差异', () => {
  const electrical = getRelevantWatchlist({ major: '电气工程' }).map((item) => item.name);
  const civil = getRelevantWatchlist({ major: '土木工程' }).map((item) => item.name);
  const overlap = electrical.filter((name) => civil.includes(name));
  assert.ok(electrical.length <= 50);
  assert.ok(overlap.length < electrical.length * 0.75);
  assert.ok(electrical.includes('山东电工电气'));
  assert.ok(civil.includes('中国建筑'));
});

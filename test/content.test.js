const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFacts, normalizeDate } = require('../src/content');

test('从招聘原文提取地点、日期、要求和官方待遇', () => {
  const text = `协兴建筑2027秋季校园招聘 过期时间：2026-09-28
发布时间：2026-06-30
招聘对象：2027届本科及以上应届毕业生
●工作地点：香港
●任职要求：
本科以上学历，有土木、结构工程或相关专业
英语专业达到六级，懂粤语优先考虑
●薪酬福利：
港币20K/月
弹性上班时间
搬迁补贴及住宿安排
有薪年假、生日假、家庭友善假、进修假
医疗福利
招聘流程
面试环节：包括初试、复试`;
  assert.deepEqual(extractFacts(text), {
    city: '香港',
    deadline: '2026-09-28',
    published_at: '2026-06-30',
    description: '招聘对象：2027届本科及以上应届毕业生\n●工作地点：香港\n●任职要求：\n本科以上学历，有土木、结构工程或相关专业\n英语专业达到六级，懂粤语优先考虑',
    official_benefits: '●薪酬福利：\n港币20K/月\n弹性上班时间\n搬迁补贴及住宿安排\n有薪年假、生日假、家庭友善假、进修假\n医疗福利'
  });
});

test('拒绝无效日期', () => {
  assert.equal(normalizeDate('2026', '2', '31'), '');
});

test('网申时间为日期范围时使用结束日期作为截止日期', () => {
  const result = extractFacts('网申时间：2026-07-28 ~ 2026-10-31\n发布日期：2026-07-28');
  assert.equal(result.deadline, '2026-10-31');
});

test('不会把聚合页相似职位的截止日期记到当前岗位', () => {
  const result = extractFacts('网申时间：2026-07-28 ~ 2026-10-31\n免责声明：以下为其他内容\n12月后截止\n2026-08-01 ~ 2027-08-03');
  assert.equal(result.deadline, '2026-10-31');
});

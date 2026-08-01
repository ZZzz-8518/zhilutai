const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyApplicationUrl, buildApplicationOptions } = require('../src/channels');

test('区分企业官网、学校就业网和公共招聘平台', () => {
  assert.equal(classifyApplicationUrl('https://career.catl.com/campus'), 'official');
  assert.equal(classifyApplicationUrl('https://cumt.91job.org.cn/sub-station/jobDetails?id=1'), 'school');
  assert.equal(classifyApplicationUrl('https://www.ncss.cn/student/jobs/123'), 'public');
});

test('投递入口默认把企业招聘官网排在学校来源之前', () => {
  const options = buildApplicationOptions({
    source_name: '中国矿业大学就业指导中心',
    source_url: 'https://cumt.91job.org.cn/sub-station/jobDetails?id=1',
    apply_url: 'https://example.zhiye.com/campus/jobs',
    application_channels: []
  });
  assert.deepEqual(options.map((option) => option.category), ['official', 'school']);
  assert.equal(options[0].url, 'https://example.zhiye.com/campus/jobs');
});

test('同一链接只保留一个入口', () => {
  const options = buildApplicationOptions({
    source_url: 'https://www.iguopin.com/job/1',
    apply_url: 'https://www.iguopin.com/job/1',
    application_channels: [{ type: '招聘平台', url: 'https://www.iguopin.com/job/1' }]
  });
  assert.equal(options.length, 1);
  assert.equal(options[0].category, 'public');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { companyStem, relevantToCompany } = require('../src/research');

test('公司检索使用去除企业后缀后的稳定名称', () => {
  assert.equal(companyStem('中铁第四勘察设计院集团有限公司'), '中铁第四勘察设计院');
  assert.equal(companyStem('宝时得科技（中国）有限公司（Positec）'), '宝时得科技');
});

test('公司资料检索拒绝与公司名无关的搜索结果', () => {
  const company = '中铁第四勘察设计院集团有限公司';
  assert.equal(relevantToCompany({
    title: '铁四院2027年校园招聘',
    summary: '中铁第四勘察设计院发布招聘公告'
  }, company), true);
  assert.equal(relevantToCompany({
    title: 'Coronavirus - World Health Organization',
    summary: 'Global public health information'
  }, company), false);
});

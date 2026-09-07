import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { updateTutorSkillUrl } from '../scripts/syncSkillCatalog.mjs';

const baseHref = 'https://cdn.keepwork.com/maisi/hellolearner/release/abcdef123456/';

test('updates only the tutor URL in the real catalog and is idempotent', () => {
  const source = fs.readFileSync(new URL('../../AIChat/AIChat_skills.json', import.meta.url), 'utf8');
  const before = JSON.parse(source);
  const oldUrl = before.skills.find((entry) => entry.id === 'local-language-learner').url;
  const updated = updateTutorSkillUrl(source, baseHref);
  assert.equal(updated, source.replace(JSON.stringify(oldUrl), JSON.stringify(`${baseHref}SKILL.md`)));
  before.skills.find((entry) => entry.id === 'local-language-learner').url = `${baseHref}SKILL.md`;
  assert.deepEqual(JSON.parse(updated), before);
  assert.equal(updateTutorSkillUrl(updated, baseHref), updated);
  const nextBase = baseHref.replace('abcdef123456', '123456abcdef');
  assert.equal(JSON.parse(updateTutorSkillUrl(updated, nextBase)).skills.find((entry) => entry.id === 'local-language-learner').url, `${nextBase}SKILL.md`);
});

test('rejects missing, duplicate, or ambiguous tutor entries', () => {
  assert.throws(() => updateTutorSkillUrl('{"skills":[]}', baseHref));
  const tutor = { id: 'local-language-learner', url: '../HelloLearner/SKILL.md' };
  assert.throws(() => updateTutorSkillUrl(JSON.stringify({ skills: [tutor, tutor] }), baseHref));
  assert.throws(() => updateTutorSkillUrl(JSON.stringify({ skills: [tutor, { id: 'other', url: tutor.url }] }), baseHref));
});
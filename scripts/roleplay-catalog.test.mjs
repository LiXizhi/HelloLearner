import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRoleplayCatalog } from '../js/roleplay-catalog.js';

const catalog = JSON.parse(await readFile(new URL('../data/roleplay-data.json', import.meta.url), 'utf8'));
test('all authored JSON scenarios and regexes validate', () => {
  assert.equal(Object.keys(validateRoleplayCatalog(catalog).scenarios).length, 15);
  assert.equal(catalog.scenarios.airport.titleZh, '机场值机');
  assert.equal(catalog.scenarios.coffee.allowMultiGoalFromOneTurn, true);
});
test('invalid versions, IDs and regular expressions fail validation', () => {
  assert.throws(() => validateRoleplayCatalog({ ...catalog, version: 2 }));
  const invalid = structuredClone(catalog);
  invalid.scenarios.airport.id = 'other';
  assert.throws(() => validateRoleplayCatalog(invalid));
  invalid.scenarios.airport.id = 'airport';
  invalid.scenarios.airport.goals[0].patterns = ['['];
  assert.throws(() => validateRoleplayCatalog(invalid));
});
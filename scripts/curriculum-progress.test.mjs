import test from 'node:test';
import assert from 'node:assert/strict';
import { projectUnitProgress, projectSpeakingWeek } from '../js/curriculum-progress.js';

const lessons = [{ id: 'first' }, { id: 'last' }];
test('speaking chart uses calendar days and excludes older activity', () => {
  const week = projectSpeakingWeek({ '2026-08-01': 80, '2026-09-05': 2.55 }, new Date('2026-09-05T12:00:00Z'));
  assert.equal(week.length, 7);
  assert.equal(week[0].date, '8/30');
  assert.equal(week[0].minutes, 0);
  assert.equal(week[6].minutes, 2.6);
  assert.equal(week[6].today, true);
});
test('empty progress has no demo completions', () => {
  assert.deepEqual(projectUnitProgress(lessons), { completed: 0, total: 2, percent: 0, nextLessonId: 'first' });
});
test('only this unit counts and next incomplete lesson is selected', () => {
  assert.deepEqual(projectUnitProgress(lessons, { first: {}, other: {} }), { completed: 1, total: 2, percent: 50, nextLessonId: 'last' });
});
test('completed and empty units have no recommended lesson', () => {
  assert.equal(projectUnitProgress(lessons, { first: {}, last: {} }).nextLessonId, '');
  assert.equal(projectUnitProgress([]).percent, 0);
});
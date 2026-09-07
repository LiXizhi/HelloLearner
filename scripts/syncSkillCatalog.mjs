export function updateTutorSkillUrl(source, baseHref) {
  const catalog = JSON.parse(source);
  const entries = catalog.skills.filter((entry) => entry.id === 'local-language-learner');
  if (entries.length !== 1) throw new Error('Expected exactly one local-language-learner skill in AIChat catalog.');
  const oldUrl = entries[0].url;
  if (typeof oldUrl !== 'string') throw new Error('Tutor skill URL must be a string.');
  const newUrl = new URL('SKILL.md', baseHref).href;
  if (oldUrl === newUrl) return source;
  const matches = [...source.matchAll(/"url"\s*:\s*("(?:[^"\\]|\\.)*")/g)]
    .filter((match) => JSON.parse(match[1]) === oldUrl);
  if (matches.length !== 1) throw new Error('Tutor skill URL must occur exactly once in AIChat catalog.');
  const match = matches[0];
  const offset = match.index + match[0].length - match[1].length;
  return source.slice(0, offset) + JSON.stringify(newUrl) + source.slice(offset + match[1].length);
}
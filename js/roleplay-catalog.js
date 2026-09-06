export function validateRoleplayCatalog(catalog) {
  if (catalog?.version !== 1 || !catalog.scenarios || typeof catalog.scenarios !== 'object' || Array.isArray(catalog.scenarios)) {
    throw new Error('Invalid roleplay catalog: expected version 1 and scenarios');
  }
  for (const [id, scenario] of Object.entries(catalog.scenarios)) {
    if (scenario?.id !== id || !Array.isArray(scenario.goals) || !scenario.goals.length) throw new Error(`Invalid roleplay scenario: ${id}`);
    const goalIds = new Set();
    for (const goal of scenario.goals) {
      if (!goal?.id || goalIds.has(goal.id)) throw new Error(`Invalid or duplicate goal in ${id}`);
      goalIds.add(goal.id);
      if (!Array.isArray(goal.patterns)) throw new Error(`Missing patterns: ${id}/${goal.id}`);
      for (const pattern of goal.patterns) {
        if (typeof pattern !== 'string') throw new Error(`Invalid pattern: ${id}/${goal.id}`);
        new RegExp(pattern, 'i');
      }
    }
  }
  return catalog;
}

export async function loadRoleplayCatalog() {
  const response = await fetch(new URL('../data/roleplay-data.json?v=20260905a', import.meta.url));
  if (!response.ok) throw new Error(`Unable to load roleplay catalog (${response.status})`);
  return validateRoleplayCatalog(await response.json());
}
// Source-only browser integration tests. Set NODE_PATH to a Playwright installation.
// Uses fixture SDK/AI replies; no real credentials, LLM, microphone, or cloud writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { examplePlan, exampleLesson } from './plan-fixtures.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..', '..');
const files = new Map(), requests = [], errors = [];
let holdGeneration = false, releaseGeneration, malformed = false, rejectWrite = false, loggedIn = true;
const engine = `<!doctype html><script>
const channel='aichat.external-tool.v1';
addEventListener('message',async e=>{const m=e.data;if(m.channel!==channel)return;
const reply=(type,extra={})=>parent.postMessage({channel,type,requestId:m.requestId,...extra},'*');
if(m.type==='host:init')reply('tool:ready');
if(m.type==='tool:models:list')reply('host:models',{models:['keepwork-pro','test-model']});
if(m.type==='host:voice')reply('host:voice-result',{ok:true});
if(m.type==='tool:llm-request'){
reply('host:llm-stream',{text:JSON.stringify({kind:'preview',message:'本课将练习：A coffee, please.'})+'\\n',reasoning:'DO NOT SHOW THIS'});
try{reply('host:llm-result',{text:await parent.__generateFixture(m)});}catch(error){reply('host:llm-error',{error:error.message});}}
}); parent.postMessage({channel,type:'host:ready'},'*');
</script>`;
const embeddedHost = `<!doctype html><html><body style="margin:0"><iframe id="learner" style="width:100%;height:100vh;border:0" src="/HelloLearner/HelloLearner.html"></iframe><script>
const channel='aichat.external-tool.v1';let ready=false;window.fixtureSpace={id:'embedded-a',name:'EmbeddedA',workspace:'EmbeddedA',type:'project'};
const pending=new Map();
window.setFixtureSpace=space=>{window.fixtureSpace=space;document.querySelector('iframe').contentWindow.postMessage({channel,type:'host:init',workspace:space},'*')};
window.commandFixture=(command,args={})=>new Promise(resolve=>{const requestId=crypto.randomUUID();pending.set(requestId,resolve);document.querySelector('iframe').contentWindow.postMessage({channel,type:'host:tool-command',requestId,command,args},'*')});
window.promptFixture=text=>{document.querySelector('iframe').contentWindow.postMessage({channel,type:'host:prompt',requestId:crypto.randomUUID(),text},'*')};
addEventListener('message',async e=>{const m=e.data;if(m.channel!==channel||e.source!==document.querySelector('iframe').contentWindow)return;
const reply=(type,extra={})=>e.source.postMessage({channel,type,requestId:m.requestId,...extra},'*');
if(m.type==='tool:ready'&&!ready){ready=true;reply('host:init',{workspace:window.fixtureSpace});}
if(m.type==='tool:tool-command-result'){pending.get(m.requestId)?.(m);pending.delete(m.requestId);}
if(m.type==='host:voice')reply('host:voice-result',{ok:true});
if(m.type==='tool:models:list')reply('host:models',{models:['keepwork-pro']});
if(m.type.startsWith('tool:workspace:')){try{
if(m.expectedWorkspaceId!==undefined&&m.expectedWorkspaceId!==window.fixtureSpace.id)throw Error('工作空间已切换');
const name=window.fixtureSpace.name;
if(m.type==='tool:workspace:read')reply('host:workspace',{ok:true,content:await window.__fixtureRead(name,m.path)});
else if(m.type==='tool:workspace:list')reply('host:workspace',{ok:true,entries:await window.__fixtureList(name,m.path)});
else{await window.__fixtureWrite(name,m.path,m.content);reply('host:workspace',{ok:true});}
}catch(error){reply('host:workspace',{ok:false,error:error.message});}}
if(m.type==='tool:llm-request'){
reply('host:llm-stream',{text:JSON.stringify({kind:'preview',message:'本课将练习：A coffee, please.'})+'\\n'});
try{reply('host:llm-result',{text:await window.__generateFixture(m)});}catch(error){reply('host:llm-error',{error:error.message});}}
});</script></body></html>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/AIChat/AIChat.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(engine); return; }
  if (url.pathname === '/embedded.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(embeddedHost); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.md': 'text/plain' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('__fixtureUser', () => loggedIn ? { id: 1, nickname: 'Test learner' } : null);
  await page.exposeFunction('__fixtureRead', (workspace, file) => files.get(`${workspace}/${file}`) || (file.endsWith('profile.json') ? JSON.stringify({ displayName: 'Test learner', englishLevel: 'A1' }) : ''));
  await page.exposeFunction('__fixtureWrite', (workspace, file, text) => { if (rejectWrite && file.includes('/plans/')) throw new Error('fixture save failed'); files.set(`${workspace}/${file}`, text); });
  await page.exposeFunction('__fixtureList', (workspace, directory) => [...new Set([...files.keys()].filter(key => key.startsWith(`${workspace}/${directory}/`)).map(key => key.slice(`${workspace}/${directory}/`.length).split('/')[0] + '/'))]);
  await page.exposeFunction('__generateFixture', async request => {
    requests.push(request);
    const system = request.messages?.[0]?.content || '';
    if (system.includes('Classify the user turn')) return JSON.stringify({ action: /list|列出/.test(request.messages.at(-1).content) ? 'list' : 'create' });
    if (system.includes('Operation: outline')) return JSON.stringify({ kind: 'plan', value: examplePlan() });
    if (system.includes('Operation: daily')) {
      if (holdGeneration) await new Promise(resolve => { releaseGeneration = resolve; });
      if (malformed) return '{"kind":"lesson","value":';
      const data = JSON.parse(request.messages.at(-1).content);
      return JSON.stringify({ kind: 'lesson', value: exampleLesson(data.plan, data.requestedLesson) });
    }
    return 'Here is your coffee. Thank you!';
  });
  await page.addInitScript(() => {
    window.__engineStartup = [];
    const observed = new WeakSet();
    new MutationObserver(() => {
      for (const frame of document.querySelectorAll('iframe[title="HelloLearner AIChat engine"]')) {
        if (observed.has(frame)) continue;
        observed.add(frame);
        window.__engineStartup.push({ account: document.querySelector('#accountButton')?.textContent,
          runtimeReady: Boolean(window.helloLearnerRuntime), profileLoaded: Boolean(window.__profileLoaded) });
      }
    }).observe(document, { childList: true, subtree: true });
    window.KeepworkSDK = class {
      constructor() {
        this.personalPageStore = { withWorkspace: name => ({ readFile: file => window.__fixtureRead(name, file), createFile: (file, text) => window.__fixtureWrite(name, file, text) }) };
        this.apiKeySettings = { listLiveAPIs: () => [] };
      }
      async getUserProfile() { const user = await window.__fixtureUser(); window.__profileLoaded = true; return user; }
      async showLoginWindow() {}
      onAuthStateChange() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: { cancel() {}, getVoices() { return []; }, speak(utterance) { queueMicrotask(() => utterance.onend?.()); } } });
  });
  await page.route('**/*', route => {
    const url = route.request().url();
    // Keep Tailwind available for responsive QA; optional media/SDK calls fail soft.
    if (url.startsWith(origin) || /tailwind/i.test(url)) return route.continue();
    return route.abort();
  });
  await page.goto(`${origin}/HelloLearner/HelloLearner.html`);
  await page.locator('#lessonPlanLibrary').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#learningPath #lessonPlanLibrary').count(), 0);
  assert.equal(await page.locator('#lessonPlanLibrary').isVisible(), false);
  await page.waitForFunction(() => window.__engineStartup.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__engineStartup[0]), {
    account: 'Test learner ▾', runtimeReady: true, profileLoaded: true,
  }, 'standalone engine mounts only after authenticated learner view is ready');

  await page.locator('#learningPath .journey-header h2').press('Enter');
  const builtinTab = page.getByRole('tab', { name: '系统内置课程', exact: true });
  await page.waitForFunction(() => document.querySelector('#course-tab-builtin')?.getAttribute('aria-selected') === 'true');
  assert.equal(await builtinTab.getAttribute('aria-selected'), 'true', 'empty workspace defaults to built-in courses');
  await page.getByRole('tab', { name: '我的学习计划', exact: true }).click();
  await page.getByText('为你的目标，定制一份学习计划', { exact: true }).waitFor();
  assert.equal(await page.locator('#course-tab-plans').getAttribute('aria-selected'), 'true', 'explicit empty plans tab stays selected');
  await builtinTab.click();
  const libraryQaDir = path.join(tmpdir(), 'hellolearner-plan-qa'); await mkdir(libraryQaDir, { recursive: true });
  await page.screenshot({ path: path.join(libraryQaDir, 'library-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(libraryQaDir, 'library-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  const builtinPanel = page.getByRole('tabpanel', { name: '系统内置课程', exact: true });
  assert.equal(await builtinPanel.getByRole('button').count(), 54);
  await builtinPanel.getByRole('button').first().click();
  await page.locator('#introPracticeRoom').waitFor();
  await page.locator('#closePracticeRoom').click();

  await page.locator('[data-tab="progress"]').click();
  await page.locator('#progressPage #lessonPlanLibrary').waitFor();
  await page.locator('[data-tab="progress"]').click();
  await page.locator('#lessonPlanLibrary').getByRole('button', { name: '新建计划', exact: true }).click();
  const dialog = page.locator('#lessonPlansDialog');
  await dialog.getByLabel('与 AI 讨论学习计划').fill('帮我制定旅行英语计划');
  await dialog.getByRole('button', { name: '与 AI 制定计划', exact: true }).click();
  await dialog.getByRole('button', { name: '保存计划', exact: true }).waitFor();
  const qaDir = path.join(tmpdir(), 'hellolearner-plan-qa'); await mkdir(qaDir, { recursive: true });
  await page.screenshot({ path: path.join(qaDir, 'desktop.png') });
  assert.equal([...files.keys()].filter(key => key.includes('/plans/')).length, 0, 'preview must not save');
  await dialog.getByLabel('与 AI 讨论学习计划').fill('保持十四天，多一点礼貌表达');
  await dialog.getByRole('button', { name: '修改计划', exact: true }).click();
  await dialog.locator('[data-plan-status]').filter({ hasText: '请检查' }).waitFor();
  rejectWrite = true;
  await dialog.getByRole('button', { name: '保存计划', exact: true }).click();
  await dialog.locator('[data-plan-status]').filter({ hasText: 'fixture save failed' }).waitFor();
  rejectWrite = false;
  await dialog.getByRole('button', { name: '重试', exact: true }).click();
  await dialog.getByRole('button', { name: '继续学习', exact: true }).waitFor();
  const planPath = [...files.keys()].find(key => key.endsWith('/plan.json'));
  assert.ok(planPath);
  const plan = JSON.parse(files.get(planPath));
  holdGeneration = true;
  await dialog.getByRole('button', { name: '继续学习', exact: true }).click();
  await dialog.getByText('本课将练习：A coffee, please.', { exact: true }).waitFor();
  assert.equal(await dialog.getByText('DO NOT SHOW THIS', { exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: '开始本课', exact: true }).count(), 0);
  await dialog.getByRole('button', { name: '取消生成', exact: true }).click();
  holdGeneration = false; releaseGeneration();
  await dialog.getByRole('button', { name: '重试', exact: true }).click();
  await dialog.getByRole('button', { name: '开始本课', exact: true }).waitFor();
  const dailyRequests = () => requests.filter(r => r.messages?.[0]?.content.includes('Operation: daily')).length;
  const generatedCount = dailyRequests();
  await dialog.getByRole('button', { name: '开始本课', exact: true }).click();
  for (const answer of ['coffee', 'coffee', '正确', 'coffee', 'a coffee please', 'coffee']) {
    await dialog.getByLabel('练习回答').fill(answer);
    await dialog.getByRole('button', { name: '提交', exact: true }).click();
    const next = answer === 'coffee' && (await dialog.getByRole('button', { name: '完成本课', exact: true }).isVisible())
      ? dialog.getByRole('button', { name: '完成本课', exact: true }) : dialog.getByRole('button', { name: /下一步骤|完成本课/ });
    await next.waitFor({ state: 'visible' }); await next.click();
  }
  await dialog.getByRole('button', { name: '返回计划', exact: true }).click();
  await dialog.getByRole('button', { name: /第 1 天.*已完成/ }).waitFor();
  assert.ok(JSON.parse(files.get(planPath.replace('plan.json', 'progress.json'))).lessons['day-01'].completedAt);
  await dialog.getByRole('button', { name: /第 1 天.*已完成/ }).click();
  await dialog.getByRole('button', { name: '开始本课', exact: true }).waitFor();
  assert.equal(dailyRequests(), generatedCount, 'cached lesson must not regenerate');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'mobile dialog must not overflow');
  await page.screenshot({ path: path.join(qaDir, 'mobile.png') });
  await dialog.getByRole('button', { name: '返回练习', exact: true }).click();
  await page.reload(); await page.locator('#lessonPlanLibrary').waitFor({ state: 'attached' }); await page.locator('[data-tab="progress"]').click(); await page.locator('#lessonPlanLibrary').getByRole('button', { name: plan.title, exact: true }).waitFor();
  await page.locator('#accountButton').click();
  await page.getByRole('menuitem', { name: /系统设置/ }).click();
  await page.locator('[name="lessonWorkspace"]').fill('TravelTwo');
  await page.locator('[name="createWorkspace"]').check();
  await page.locator('[name="coursewareModel"] option[value="test-model"]').waitFor({ state: 'attached' });
  await page.locator('[name="coursewareModel"]').selectOption('test-model');
  await page.locator('#systemSettingsDialog').getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('#systemSettingsDialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#lessonPlanLibrary').getByRole('button', { name: plan.title, exact: true }).count(), 0);
  await page.locator('#saveStatus').filter({ hasText: '学习进度已保存' }).waitFor();
  assert.ok(files.has('HelloLearner/.hellolearner/settings.json'));
  assert.equal(JSON.parse(files.get('HelloLearner/.hellolearner/settings.json')).lessonWorkspace, 'TravelTwo');
  assert.equal([...files.keys()].some(key => key.startsWith('TravelTwo/.hellolearner/profile')), false);
  assert.ok(files.has('TravelTwo/.hellolearner/workspace.json'), 'explicit creation creates cloud workspace');
  assert.equal(JSON.parse(files.get('HelloLearner/.hellolearner/settings.json')).coursewareModel, 'test-model');
  await page.locator('[data-tab="path"]').click();
  await page.locator('#quickTalk').click();
  await page.locator('#practiceTextInput').fill('帮我再制定一个英语计划');
  await page.locator('#practiceTextForm').evaluate(form => form.requestSubmit());
  await dialog.getByRole('button', { name: '保存计划', exact: true }).waitFor();
  assert.equal(requests.filter(r => r.messages?.[0]?.content.includes('Operation: outline')).at(-1).model, 'test-model');
  await dialog.getByRole('button', { name: '返回练习', exact: true }).click();
  assert.equal(await page.evaluate(() => window.helloLearnerRuntime.getContext().exercise), 'free-talk');
  await page.locator('#closePracticeRoom').click();
  const firstLesson = await page.evaluate(() => {
    const id = window.HELLO_LEARNER_CURRICULUM.lessons[0].id;
    window.helloLearnerRuntime.openLessonById(id); return id;
  });
  await page.locator('#introPracticeRoom').getByRole('button', { name: '学习计划', exact: true }).click();
  await dialog.getByRole('button', { name: '返回练习', exact: true }).click();
  assert.equal(await page.evaluate(() => window.helloLearnerRuntime.getContext().activeLessonId), firstLesson);
  // Real iframe bridge with a controlled host, including composer and audited commands.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin}/embedded.html`);
  const frame = page.frameLocator('#learner');
  await frame.locator('#lessonPlanLibrary').waitFor({ state: 'attached' });
  await frame.locator('[data-tab="progress"]').click();
  await frame.locator('#lessonPlanLibrary').waitFor();
  await frame.locator('#accountButton').click();
  await frame.getByRole('menuitem', { name: /系统设置/ }).click();
  assert.equal(await frame.locator('[name="lessonWorkspace"]').inputValue(), 'EmbeddedA');
  assert.equal(await frame.locator('[name="lessonWorkspace"]').getAttribute('readonly'), '');
  await frame.getByRole('button', { name: '关闭系统设置' }).click();
  await page.evaluate(() => window.promptFixture('帮我制定旅行英语计划'));
  const embeddedDialog = frame.locator('#lessonPlansDialog');
  await embeddedDialog.getByRole('button', { name: '保存计划', exact: true }).waitFor();
  await embeddedDialog.getByRole('button', { name: '保存计划', exact: true }).click();
  await embeddedDialog.getByRole('button', { name: '继续学习', exact: true }).waitFor();
  const listed = await page.evaluate(() => window.commandFixture('list_lesson_plans'));
  assert.equal(listed.result.plans.length, 1);
  const embeddedPlanId = listed.result.plans[0].id;
  holdGeneration = true;
  await page.evaluate(id => window.commandFixture('open_plan_lesson', { planId: id, lessonId: 'day-01' }), embeddedPlanId);
  await embeddedDialog.getByText('本课将练习：A coffee, please.', { exact: true }).waitFor();
  await page.evaluate(() => window.setFixtureSpace({ id: 'embedded-b', name: 'EmbeddedB', workspace: 'EmbeddedB', type: 'project' }));
  await embeddedDialog.waitFor({ state: 'detached' });
  holdGeneration = false; releaseGeneration();
  await frame.locator('#lessonPlanLibrary').getByRole('button', { name: '全部计划', exact: true }).click();
  await embeddedDialog.getByRole('tab', { name: '系统内置课程', selected: true }).waitFor();
  assert.equal([...files.keys()].some(key => key.startsWith('EmbeddedB/') && key.includes('/plans/')), false);
  assert.equal([...files.keys()].some(key => key.startsWith('EmbeddedA/') && key.includes('/lessons/')), false, 'stale generation must not save');
  await page.evaluate(() => window.setFixtureSpace({ id: 'embedded-a', name: 'EmbeddedA', workspace: 'EmbeddedA', type: 'project' }));
  await frame.locator('#lessonPlanLibrary').getByRole('button', { name: plan.title, exact: true }).waitFor();
  const snapshot = await page.evaluate(id => window.commandFixture('open_lesson_plan', { planId: id }), embeddedPlanId);
  assert.equal(snapshot.ok, true);
  await embeddedDialog.getByRole('button', { name: '继续学习', exact: true }).waitFor();
  malformed = true;
  await embeddedDialog.getByRole('button', { name: '继续学习', exact: true }).click();
  await embeddedDialog.locator('[data-plan-status]').filter({ hasText: '内容不完整' }).waitFor();
  assert.equal(await embeddedDialog.getByRole('button', { name: '开始本课', exact: true }).count(), 0);
  malformed = false;
  await embeddedDialog.getByRole('button', { name: '重试', exact: true }).click();
  await embeddedDialog.getByRole('button', { name: '开始本课', exact: true }).waitFor();
  loggedIn = false;
  await page.goto(`${origin}/HelloLearner/HelloLearner.html`);
  await page.locator('#lessonPlanLibrary').waitFor({ state: 'attached' });
  await page.locator('[data-tab="progress"]').click();
  await page.locator('#lessonPlanLibrary').getByRole('button', { name: '新建计划', exact: true }).click();
  await dialog.getByLabel('与 AI 讨论学习计划').fill('旅行英语');
  await dialog.getByRole('button', { name: '与 AI 制定计划', exact: true }).click();
  await dialog.getByRole('button', { name: '保存计划', exact: true }).waitFor();
  const savedFiles = files.size;
  await dialog.getByRole('button', { name: '保存计划', exact: true }).click();
  await dialog.locator('[data-plan-status]').filter({ hasText: '请登录后保存' }).waitFor();
  assert.equal(files.size, savedFiles, 'anonymous save must not write a persistent artifact');
  assert.equal(await dialog.getByRole('button', { name: '保存计划', exact: true }).isVisible(), true, 'cancelled login must retain the draft');
  assert.deepEqual(errors, []);
  console.log('PASS: planner preview/revision/save retry, streamed cancellation, six step types, completion, cache, reload, mobile layout, standalone workspace isolation, free-talk routing and practice resume, embedded composer/commands/binding changes, malformed-generation retry, anonymous draft/login cancellation');
  console.log('Screenshots:', qaDir);
} catch (error) {
  console.error('Browser state:', { errors, requests: requests.map(r => r.displayPrompt), dialog: await page?.locator('#lessonPlansDialog').textContent({ timeout: 100 }).catch(() => ''), embedded: await page?.frameLocator('#learner').locator('#lessonPlansDialog').textContent({ timeout: 100 }).catch(() => '') });
  throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

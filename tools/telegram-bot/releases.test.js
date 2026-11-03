import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
const { buildReleaseTasks, tasksToRemind, createReleasePlan, reminderHour, runReminderTick } = await import('./releases.js');

test('tasks count back from the release and late ones move to today', () => {
  const far = buildReleaseTasks('2027-03-01', '2026-11-03');
  assert.equal(far[0].due_date, '2027-02-01');
  assert.equal(far.at(-1).due_date, '2027-03-08');
  const close = buildReleaseTasks('2026-11-10', '2026-11-03');
  assert.equal(close[0].due_date, '2026-11-03');
  assert.equal(close.find(task => task.title.startsWith('Publicar el lanzamiento')).due_date, '2026-11-10');
});

test('invalid dates and titles never reach the database', async () => {
  const native = fetch;
  globalThis.fetch = async () => { throw Error('Database reached'); };
  try {
    assert.match((await createReleasePlan(7, 'Single', '2026-02-31', '2026-01-01')).error, /válida/);
    assert.match((await createReleasePlan(7, 'Single', '2026-01-01', '2026-01-01')).error, /futura/);
    assert.match((await createReleasePlan(7, 'Single', '2028-01-01', '2026-01-01')).error, /próximo año/);
    assert.match((await createReleasePlan(7, ' ', '2026-02-01', '2026-01-01')).error, /título/);
  } finally { globalThis.fetch = native; }
});

test('only due, unfinished tasks are reminded, and not again for two days', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const tasks = [
    { id: 1, due_date: '2026-11-03' },
    { id: 2, due_date: '2026-11-04' },
    { id: 3, due_date: '2026-11-01', done_at: '2026-11-01T10:00:00Z' },
    { id: 4, due_date: '2026-11-01', reminded_at: '2026-11-02T12:00:00Z' },
    { id: 5, due_date: '2026-11-01', reminded_at: '2026-11-01T11:00:00Z' },
  ];
  assert.deepEqual(tasksToRemind(tasks, '2026-11-03', now).map(task => task.id), [1, 5]);
});

test('reminders stay inside daytime hours in Madrid', () => {
  assert.equal(reminderHour(Date.parse('2026-11-03T12:00:00Z')), true);
  assert.equal(reminderHour(Date.parse('2026-11-03T23:00:00Z')), false);
});

test('a failed delivery is not marked as reminded', async () => {
  const native = fetch; let patched = false;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/sendMessage')) return new Response('blocked', { status: 403 });
    if (options.method === 'PATCH') { patched = true; return new Response(''); }
    return Response.json([{ id: 1, telegram_id: 7, title: 'Portada', due_date: '2026-11-03', sb_release_plans: { title: 'Single' } }]);
  };
  const error = console.error; console.error = () => {};
  try { await runReminderTick(Date.parse('2026-11-03T12:00:00Z')); assert.equal(patched, false); }
  finally { globalThis.fetch = native; console.error = error; }
});

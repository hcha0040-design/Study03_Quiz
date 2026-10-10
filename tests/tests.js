const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, msg: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert 실패'); }
function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} 기대 ${b}, 실제 ${a}`);
}
function makeRng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function makeQuestion(id, category, overrides = {}) {
  return { id, category, question: `${id} 문제`, choices: [`${id}-A`, `${id}-B`, `${id}-C`, `${id}-D`], answer: 0,
    explanation: '해설', source: { title: '출처', url: 'https://example.org', checkedAt: '2026-10-08' }, ...overrides };
}

// ===== 1단계: 섞기 =====
test('shuffle: 원소 보존, 입력 불변', () => {
  const input = [1, 2, 3, 4, 5];
  const out = QuizCore.shuffle(input, makeRng(1));
  assertEqual(input, [1, 2, 3, 4, 5]);
  assertEqual([...out].sort(), [1, 2, 3, 4, 5]);
});
test('shuffle: 피셔-예이츠 순서', () => {
  assertEqual(QuizCore.shuffle([1, 2, 3, 4], () => 0), [2, 3, 4, 1]);
  assertEqual(QuizCore.shuffle([1, 2, 3, 4], () => 0.999), [1, 2, 3, 4]);
});
test('questionsByCategory: 해당 카테고리만', () => {
  const qs = [makeQuestion('kh-01', 'korean-history'), makeQuestion('sc-01', 'science'), makeQuestion('kh-02', 'korean-history')];
  assertEqual(QuizCore.questionsByCategory(qs, 'korean-history').map(q => q.id), ['kh-01', 'kh-02']);
});
test('prepareItems: 섞은 뒤에도 정답 유지, 입력 불변', () => {
  const list = [0, 1, 2, 3].map(a => makeQuestion(`kh-0${a + 1}`, 'korean-history', { answer: a }));
  const before = JSON.stringify(list);
  for (let seed = 1; seed <= 20; seed++) {
    const items = QuizCore.prepareItems(list, makeRng(seed));
    assertEqual(items.map(i => i.id).sort(), ['kh-01', 'kh-02', 'kh-03', 'kh-04']);
    for (const item of items) {
      const orig = list.find(q => q.id === item.id);
      assertEqual(item.choices[item.answerIndex], orig.choices[orig.answer], item.id);
      assertEqual(Object.keys(item).sort(), ['answerIndex', 'choices', 'explanation', 'id', 'question', 'source']);
    }
  }
  assertEqual(JSON.stringify(list), before);
});

// ===== 결과 표시 =====
window.addEventListener('load', () => {
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  document.getElementById('summary').textContent = `통과 ${passed} · 실패 ${failed}`;
  const list = document.getElementById('results');
  for (const r of results) {
    const li = document.createElement('li');
    li.textContent = r.ok ? `통과: ${r.name}` : `실패: ${r.name} — ${r.msg}`;
    if (!r.ok) { li.className = 'fail'; li.style.color = '#c00'; }
    list.appendChild(li);
  }
});

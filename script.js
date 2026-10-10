// 순수 로직: DOM과 localStorage에 손대지 않고, 입력을 바꾸지 않는다.
const QuizCore = {
  // 피셔-예이츠: 사본을 만들어 뒤에서부터 바꾼다. rng는 0 이상 1 미만 값을 돌려준다.
  shuffle(arr, rng) {
    const out = arr.slice();
    for (let i = out.length - 1; i >= 1; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  },

  questionsByCategory(questions, categoryId) {
    return questions.filter(q => q.category === categoryId);
  },

  // 문항 순서와 보기 순서를 섞고, 원래 정답이 옮겨 간 위치를 answerIndex로 돌려준다.
  prepareItems(questionList, rng) {
    return QuizCore.shuffle(questionList, rng).map(q => {
      const order = QuizCore.shuffle([0, 1, 2, 3], rng);
      return {
        id: q.id,
        question: q.question,
        choices: order.map(i => q.choices[i]),
        answerIndex: order.indexOf(q.answer),
        explanation: q.explanation,
        source: { ...q.source },
      };
    });
  },

  // 반점 단위 점수: 정답 2, 힌트를 쓴 정답 1, 오답 0.
  scoreAnswer({ correct, usedHint }) {
    if (!correct) return 0;
    return usedHint ? 1 : 2;
  },

  // 반점 정수를 화면용 문자열로 바꾼다(15 -> "7.5"). 단독 함수로 넘겨도 되도록 this를 쓰지 않는다.
  formatScore(halfPoints) {
    return String(halfPoints / 2);
  },

  // 문항 데이터 검사(PRD 5.2, 7.1). 오류 메시지 배열을 돌려주고, 문제가 없으면 빈 배열이다.
  // 잘못된 모양의 항목이 있어도 던지지 않고 메시지로 알린다.
  validateQuestions(questions, categories) {
    const errors = [];
    const SUPERLATIVES = ['가장', '최대', '최소', '최고', '최저', '최장', '최단', '최초', '제일'];
    const isText = v => typeof v === 'string' && v.trim() !== '';

    if (!Array.isArray(categories)) {
      return ['전체: categories가 배열이 아님'];
    }
    if (!Array.isArray(questions)) {
      return ['전체: questions가 배열이 아님'];
    }
    if (categories.length !== 4) errors.push(`전체: 카테고리 ${categories.length}개 (4개여야 함)`);

    const catById = new Map();
    for (const c of categories) {
      if (c && typeof c.id === 'string') catById.set(c.id, c);
    }

    // 카테고리마다 정확히 10문항
    for (const c of categories) {
      if (!c) continue;
      const n = questions.filter(q => q && q.category === c.id).length;
      if (n !== 10) errors.push(`${c.id}: 문항 ${n}개`);
    }

    const seenIds = new Set();
    questions.forEach((q, index) => {
      if (q === null || typeof q !== 'object') {
        errors.push(`문항 #${index + 1}: 객체가 아님`);
        return;
      }
      const label = isText(q.id) ? q.id : `문항 #${index + 1}`;
      const err = msg => errors.push(`${label}: ${msg}`);

      // id
      if (!isText(q.id)) {
        err('id가 없음');
      } else if (seenIds.has(q.id)) {
        err('id가 겹침');
      } else {
        seenIds.add(q.id);
      }

      // category, id 접두어
      const cat = catById.get(q.category);
      if (!cat) {
        err(`카테고리 "${q.category}"가 목록에 없음`);
      } else if (isText(q.id)) {
        const head = `${cat.prefix}-`;
        if (!(q.id.startsWith(head) && /^\d{2}$/.test(q.id.slice(head.length)))) {
          err(`id가 "${head}NN" 형식이 아님`);
        }
      }

      // 문제
      if (!isText(q.question)) {
        err('문제가 비어 있음');
      } else if (SUPERLATIVES.some(w => q.question.includes(w)) && !q.question.includes('기준')) {
        err('최상급 표현이 있는데 "기준"이 없음');
      }

      // 보기
      if (!Array.isArray(q.choices) || q.choices.length !== 4) {
        err('보기가 4개가 아님');
      } else if (!q.choices.every(isText)) {
        err('비어 있는 보기가 있음');
      } else if (new Set(q.choices.map(s => s.trim())).size !== 4) {
        err('겹치는 보기가 있음');
      }

      // 정답 위치
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
        err('answer가 0~3 정수가 아님');
      }

      // 해설
      if (!isText(q.explanation)) {
        err('해설이 비어 있음');
      } else if (q.explanation.length > 80) {
        err('해설이 80자를 넘음');
      }

      // 출처
      const s = q.source;
      if (s === null || typeof s !== 'object') {
        err('출처(source)가 없음');
      } else {
        if (!isText(s.title)) err('source.title이 없음');
        if (!isText(s.url)) err('source.url이 없음');
        else if (!s.url.startsWith('https://')) err('source.url이 https://로 시작하지 않음');
        if (!isText(s.checkedAt)) err('source.checkedAt이 없음');
        else if (!/^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt)) err('source.checkedAt이 YYYY-MM-DD 형식이 아님');
      }
    });

    return errors;
  },
};

// ===================================================================
// 화면 처리 (DOM 사용). #app이 있을 때만 시작한다.
// ===================================================================

const MODES = {
  practice: { name: '연습', rule: '시간 제한과 힌트 없음, 맞히면 1점' },
  speed: { name: '스피드', rule: '문항마다 15초, 시간이 지나면 오답' },
  hint: { name: '힌트', rule: '문항마다 힌트 1번(오답 2개 제거), 힌트를 쓰고 맞히면 0.5점' },
};

let selectedMode = 'practice';
let game = null;

function el(id) {
  return document.getElementById(id);
}

// name: 'mode' | 'start' | 'question' | 'result' | 'board'
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => {
    s.hidden = s.id !== 'screen-' + name;
  });
  const screen = document.getElementById('screen-' + name);
  if (!screen) return;
  const title = screen.querySelector('[tabindex="-1"]');
  if (title) title.focus();
}

function goHome() {
  game = null;
  renderStart();
  showScreen('start');
}

function renderStart() {
  el('start-rule').textContent = MODES[selectedMode].rule;
  el('start-norecord').hidden = selectedMode !== 'practice';

  const list = el('category-list');
  list.textContent = '';
  CATEGORIES.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.category = c.id;
    btn.textContent = c.name;
    list.appendChild(btn);
  });
}

// ---- 문제 화면 ----

function startGame({ mode, categoryId, questionList, isRetry }) {
  game = {
    mode,
    categoryId,
    isRetry,
    items: QuizCore.prepareItems(questionList, Math.random),
    index: 0,
    phase: 'answering',
    usedHint: false,
    startMs: 0,
    results: [],
  };
  showScreen('question');
  renderQuestion();
}

function currentScoreText() {
  const total = game.results.reduce((sum, r) => sum + r.halfPoints, 0);
  return QuizCore.formatScore(total);
}

function renderQuestion() {
  const item = game.items[game.index];
  const category = CATEGORIES.find((c) => c.id === game.categoryId);

  el('q-category').textContent = category ? category.name : '';
  el('q-progress').textContent = `${game.index + 1} / ${game.items.length}`;
  el('q-score').textContent = currentScoreText();
  el('q-text').textContent = item.question;

  const list = el('choice-list');
  list.textContent = '';
  item.choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.dataset.index = String(i);
    btn.textContent = text;
    list.appendChild(btn);
  });

  el('feedback').hidden = true;
  el('btn-next').hidden = true;
  el('q-text').focus();
}

function finishQuestion({ chosenIndex, timedOut }) {
  if (game.phase !== 'answering') return;
  const item = game.items[game.index];
  const correct = !timedOut && chosenIndex === item.answerIndex;
  const halfPoints = QuizCore.scoreAnswer({ correct, usedHint: game.usedHint });

  game.results.push({
    questionId: item.id,
    chosenIndex: timedOut ? null : chosenIndex,
    correct,
    usedHint: game.usedHint,
    timedOut: !!timedOut,
    halfPoints,
  });
  game.phase = 'feedback';

  el('choice-list').querySelectorAll('.choice').forEach((btn) => {
    const i = Number(btn.dataset.index);
    btn.disabled = true;
    if (i === item.answerIndex) {
      btn.classList.add('is-correct');
      btn.textContent = '✓ ' + item.choices[i];
    } else if (i === chosenIndex && !timedOut) {
      btn.classList.add('is-wrong');
      btn.textContent = '✗ ' + item.choices[i];
    }
  });

  el('q-score').textContent = currentScoreText();
  el('feedback-verdict').textContent = timedOut ? '시간 초과' : correct ? '정답입니다' : '오답입니다';
  el('feedback-explanation').textContent = item.explanation;

  const src = el('feedback-source');
  src.textContent = '';
  const link = document.createElement('a');
  link.href = item.source.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = item.source.title;
  src.appendChild(link);

  el('feedback').hidden = false;
  const isLast = game.index === game.items.length - 1;
  el('btn-next').textContent = isLast ? '결과 보기' : '다음';
  el('btn-next').hidden = false;
}

function nextQuestion() {
  if (game.phase !== 'feedback') return;
  if (game.index === game.items.length - 1) {
    showResult();
    return;
  }
  game.index++;
  game.usedHint = false;
  game.phase = 'answering';
  renderQuestion();
}

function quitGame() {
  game = null;
  goHome();
}

function init() {
  el('category-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    const categoryId = btn.dataset.category;
    startGame({
      mode: selectedMode,
      categoryId,
      questionList: QuizCore.questionsByCategory(QUESTIONS, categoryId),
      isRetry: false,
    });
  });
  el('choice-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice');
    if (!btn || !game || game.phase !== 'answering') return;
    finishQuestion({ chosenIndex: Number(btn.dataset.index), timedOut: false });
  });
  el('btn-next').addEventListener('click', () => {
    if (game) nextQuestion();
  });
  el('btn-quit').addEventListener('click', quitGame);
  goHome();
}

if (document.getElementById('app')) init();

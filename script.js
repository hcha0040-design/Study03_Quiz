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

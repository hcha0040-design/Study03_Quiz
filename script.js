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
};

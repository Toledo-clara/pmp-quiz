const QUESTIONS_PER_PAGE = 5;
const DATA_URL = "pmp_2026_june_itpe_review_based_200_questions_en_ko.json";
const STORAGE_KEY = "pmp-quiz-state-v2-itpe-review";

const state = {
  questions: [],
  page: 0,
  selected: {},
  revealed: {},
};

const nodes = {
  quizList: document.querySelector("#quizList"),
  template: document.querySelector("#questionTemplate"),
  pageLabel: document.querySelector("#pageLabel"),
  rangeLabel: document.querySelector("#rangeLabel"),
  progressBar: document.querySelector("#progressBar"),
  answeredCount: document.querySelector("#answeredCount"),
  checkedCount: document.querySelector("#checkedCount"),
  correctCount: document.querySelector("#correctCount"),
  prevButtons: [document.querySelector("#prevPage"), document.querySelector("#prevPageBottom")],
  nextButtons: [document.querySelector("#nextPage"), document.querySelector("#nextPageBottom")],
  resetButton: document.querySelector("#resetQuiz"),
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bilingualBlock(en, ko, className = "bilingual") {
  return `
    <span class="${className}">
      <span class="${className}__en">${escapeHtml(en)}</span>
      <span class="${className}__ko">${escapeHtml(ko || en)}</span>
    </span>
  `;
}

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.selected = saved.selected || {};
    state.revealed = saved.revealed || {};
    state.page = Number.isInteger(saved.page) ? saved.page : 0;
  } catch {
    state.selected = {};
    state.revealed = {};
    state.page = 0;
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selected: state.selected,
      revealed: state.revealed,
      page: state.page,
    }),
  );
}

function getPageCount() {
  return Math.ceil(state.questions.length / QUESTIONS_PER_PAGE);
}

function getVisibleQuestions() {
  const start = state.page * QUESTIONS_PER_PAGE;
  return state.questions.slice(start, start + QUESTIONS_PER_PAGE);
}

function updateSummary() {
  const activeIds = new Set(state.questions.map((question) => question.id));
  const answered = Object.keys(state.selected).filter((id) => activeIds.has(id)).length;
  const checked = Object.keys(state.revealed).filter((id) => activeIds.has(id)).length;
  const correct = state.questions.reduce((total, question) => {
    return total + (state.revealed[question.id] && state.selected[question.id] === question.answer ? 1 : 0);
  }, 0);

  nodes.answeredCount.textContent = answered;
  nodes.checkedCount.textContent = checked;
  nodes.correctCount.textContent = correct;
}

function pruneStateForActiveQuestions() {
  const activeIds = new Set(state.questions.map((question) => question.id));
  state.selected = Object.fromEntries(Object.entries(state.selected).filter(([id]) => activeIds.has(id)));
  state.revealed = Object.fromEntries(Object.entries(state.revealed).filter(([id]) => activeIds.has(id)));
}

function updatePager() {
  const pageCount = getPageCount();
  const first = state.page * QUESTIONS_PER_PAGE + 1;
  const last = Math.min(first + QUESTIONS_PER_PAGE - 1, state.questions.length);
  const progress = pageCount ? ((state.page + 1) / pageCount) * 100 : 0;

  nodes.pageLabel.textContent = `${state.page + 1} / ${pageCount}`;
  nodes.rangeLabel.textContent = `${first}-${last}번`;
  nodes.progressBar.style.width = `${progress}%`;

  nodes.prevButtons.forEach((button) => {
    button.disabled = state.page === 0;
  });
  nodes.nextButtons.forEach((button) => {
    button.disabled = state.page >= pageCount - 1;
  });
}

function setStatus(pill, question) {
  const selected = state.selected[question.id];
  const revealed = state.revealed[question.id];
  pill.className = "status-pill";

  if (!selected) {
    pill.textContent = "미선택";
    return;
  }

  if (!revealed) {
    pill.classList.add("is-ready");
    pill.textContent = "선택됨";
    return;
  }

  if (selected === question.answer) {
    pill.classList.add("is-correct");
    pill.textContent = "정답";
    return;
  }

  pill.classList.add("is-wrong");
  pill.textContent = "오답";
}

function buildFeedback(question) {
  const selected = state.selected[question.id];
  const isCorrect = selected === question.answer;
  const selectedEn = selected ? `${selected}. ${question.choices_en[selected]}` : "None";
  const selectedKo = selected ? `${selected}. ${question.choices[selected]}` : "없음";
  const validation = question.panel_validation;
  const panels = validation.panels
    .map((panel) => {
      const stateClass = panel.vote === "agree" ? "is-agree" : "is-caution";
      const label = panel.vote === "agree" ? "Agree" : "Caution";
      return `<li class="${stateClass}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(panel.panel_en)}</span><small>${escapeHtml(panel.panel_ko)}</small></li>`;
    })
    .join("");

  return `
    <h3>${isCorrect ? "Correct · 정답입니다" : "Answer Check · 정답 확인"}</h3>
    <div class="feedback-line">
      <strong>Answer · 정답</strong>
      ${bilingualBlock(`${question.answer}. ${question.answer_text_en}`, `${question.answer}. ${question.answer_text}`, "feedback-dual")}
    </div>
    <div class="feedback-line">
      <strong>Your Answer · 선택한 답</strong>
      ${bilingualBlock(selectedEn, selectedKo, "feedback-dual")}
    </div>
    <div class="feedback-line">
      <strong>Explanation · 해설</strong>
      ${bilingualBlock(question.explanation_en, question.explanation, "feedback-dual")}
    </div>
    <div class="panel-validation">
      <div>
        <strong>Panel Validation · 패널 검증</strong>
        <span>${validation.votes_for_answer}/${validation.total_panels} · ${escapeHtml(validation.confidence_level_en)} / ${escapeHtml(validation.confidence_level_ko)} · ${Math.round(validation.confidence_score * 100)}%</span>
      </div>
      ${bilingualBlock(validation.summary_en, validation.summary_ko, "panel-summary")}
      <ul>${panels}</ul>
    </div>
  `;
}

function renderQuestion(question, globalIndex) {
  const fragment = nodes.template.content.cloneNode(true);
  const card = fragment.querySelector(".question-card");
  const meta = fragment.querySelector(".question-meta");
  const title = fragment.querySelector(".question-title");
  const choices = fragment.querySelector(".choices");
  const button = fragment.querySelector(".check-button");
  const feedback = fragment.querySelector(".feedback");
  const pill = fragment.querySelector(".status-pill");
  const confidencePill = fragment.querySelector(".confidence-pill");
  const selected = state.selected[question.id];
  const revealed = Boolean(state.revealed[question.id]);

  card.dataset.questionId = question.id;
  meta.textContent = `${globalIndex + 1}. ${question.domain_en} · ${question.approach_en}/${question.approach_ko} · ${question.difficulty_en} · ${question.topic_en} / ${question.topic}`;
  title.innerHTML = bilingualBlock(question.stem_en, question.stem, "question-dual");
  confidencePill.textContent = `Reliability ${question.panel_validation.votes_for_answer}/5`;
  confidencePill.title = `${question.confidence_level_en} / ${question.confidence_level_ko}`;
  setStatus(pill, question);

  ["A", "B", "C", "D"].forEach((letter) => {
    const text = question.choices[letter];
    const label = document.createElement("label");
    const input = document.createElement("input");
    const content = document.createElement("span");

    label.className = "choice";
    if (selected === letter) label.classList.add("is-selected");
    if (revealed && letter === question.answer) label.classList.add("is-answer");
    if (revealed && selected === letter && selected !== question.answer) label.classList.add("is-missed");

    input.type = "checkbox";
    input.name = question.id;
    input.value = letter;
    input.checked = selected === letter;
    input.setAttribute("aria-label", `${letter} 보기 선택`);

    content.innerHTML = `
      <strong>${letter}</strong>
      ${bilingualBlock(question.choices_en[letter], text, "choice-dual")}
    `;
    label.append(input, content);
    choices.append(label);

    input.addEventListener("change", () => {
      if (input.checked) {
        state.selected[question.id] = letter;
      } else {
        delete state.selected[question.id];
      }
      saveState();
      render();
    });
  });

  button.addEventListener("click", () => {
    state.revealed[question.id] = true;
    saveState();
    render();
  });

  if (revealed) {
    feedback.hidden = false;
    feedback.classList.toggle("is-correct", selected === question.answer);
    feedback.classList.toggle("is-wrong", selected !== question.answer);
    feedback.innerHTML = buildFeedback(question);
  }

  return fragment;
}

function render() {
  nodes.quizList.textContent = "";
  const visible = getVisibleQuestions();
  const startIndex = state.page * QUESTIONS_PER_PAGE;

  visible.forEach((question, index) => {
    nodes.quizList.append(renderQuestion(question, startIndex + index));
  });

  updatePager();
  updateSummary();
}

function goToPage(nextPage) {
  const pageCount = getPageCount();
  state.page = Math.min(Math.max(nextPage, 0), pageCount - 1);
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadQuestions() {
  nodes.quizList.innerHTML = `<div class="loading">문제를 불러오는 중입니다.</div>`;
  loadSavedState();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    state.questions = data.questions || [];
    pruneStateForActiveQuestions();
    state.page = Math.min(state.page, getPageCount() - 1);
    saveState();
    render();
  } catch (error) {
    nodes.quizList.innerHTML = `
      <div class="error">
        문제 데이터를 불러오지 못했습니다. 로컬 서버에서 index.html을 열어주세요.
      </div>
    `;
    console.error(error);
  }
}

nodes.prevButtons.forEach((button) => button.addEventListener("click", () => goToPage(state.page - 1)));
nodes.nextButtons.forEach((button) => button.addEventListener("click", () => goToPage(state.page + 1)));

nodes.resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("선택한 답과 해설 확인 기록을 모두 지울까요?");
  if (!confirmed) return;
  state.selected = {};
  state.revealed = {};
  state.page = 0;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

loadQuestions();

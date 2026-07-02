import { escapeHtml, pageUrl } from './core-data.js';
import { footer, sidebar, topbar } from './shell.js';

const CATEGORIES = {
  dreamcore: { label: 'dreamcore', color: '#c084fc', verdict: 'You are drawn to half-remembered places, soft unease, and nostalgia for somewhere that never existed.' },
  hopecore: { label: 'hopecore', color: '#60a5fa', verdict: 'You notice the small proof that life keeps moving forward, even when everything feels heavy.' },
  corecore: { label: 'corecore', color: '#7c3aed', verdict: 'You experience the internet recursively: culture watching itself become culture in real time.' },
  adventurecore: { label: 'adventurecore', color: '#e8731c', verdict: 'You romanticize movement, open horizons, and the feeling that something important is just ahead.' },
  naturecore: { label: 'naturecore', color: '#15803d', verdict: 'You return to quiet growth, weather, earth, and places that exist without needing an audience.' },
  weirdcore: { label: 'weirdcore', color: '#eab308', verdict: 'You are drawn to images that feel familiar and wrong at the same time.' },
  webcore: { label: 'webcore', color: '#06b6d4', verdict: 'The early internet still feels alive to you: small sites, old interfaces, and digital discovery.' },
  cutecore: { label: 'cutecore', color: '#f9a8d4', verdict: 'You build comfort from soft colors, tiny objects, sweetness, and deliberate warmth.' },
};

const QUESTIONS = [
  ['Pick a place to disappear into.', [
    ['A foggy hallway I almost recognize', 'dreamcore'],
    ['A mountain trail at sunrise', 'adventurecore'],
    ['A quiet forest after rain', 'naturecore'],
    ['An abandoned website from 2004', 'webcore'],
  ]],
  ['What should a perfect image make you feel?', [
    ['Like something is slightly wrong', 'weirdcore'],
    ['Like things might actually get better', 'hopecore'],
    ['Like the internet is looking back at itself', 'corecore'],
    ['Safe, soft, and completely unbothered', 'cutecore'],
  ]],
  ['Choose the sound in the background.', [
    ['A slowed music box in another room', 'dreamcore'],
    ['Wind moving through trees', 'naturecore'],
    ['A dial-up connection starting', 'webcore'],
    ['People cheering after someone makes it through', 'hopecore'],
  ]],
  ['Your camera roll is mostly:', [
    ['Strange empty rooms and blurry signs', 'weirdcore'],
    ['Screenshots of screenshots of screenshots', 'corecore'],
    ['Plushies, stickers, and tiny objects', 'cutecore'],
    ['Roads, maps, and places I want to go', 'adventurecore'],
  ]],
  ['Pick a color atmosphere.', [
    ['Purple light through heavy fog', 'dreamcore'],
    ['Blue sky breaking through clouds', 'hopecore'],
    ['Green light under dense leaves', 'naturecore'],
    ['Cold monitor blue in a dark room', 'webcore'],
  ]],
  ['What pulls you farther down a rabbit hole?', [
    ['A page that feels like it should not exist', 'weirdcore'],
    ['A culture endlessly remixing itself', 'corecore'],
    ['A world that looks gentle enough to live in', 'cutecore'],
    ['A place no one around me has reached yet', 'adventurecore'],
  ]],
  ['Choose a memory.', [
    ['One I am not sure actually happened', 'dreamcore'],
    ['An old computer in a family room', 'webcore'],
    ['Someone being kind when nobody was watching', 'hopecore'],
    ['Being outside long enough to forget my phone', 'naturecore'],
  ]],
  ['Which sentence feels closest?', [
    ['The image is wrong on purpose.', 'weirdcore'],
    ['Everything online eventually becomes about itself.', 'corecore'],
    ['Comfort can be its own form of art.', 'cutecore'],
    ['The horizon is an invitation.', 'adventurecore'],
  ]],
  ['Pick the world you would enter first.', [
    ['A dream that keeps changing architecture', 'dreamcore'],
    ['A handmade homepage with ten visitors', 'webcore'],
    ['A field glowing after a storm', 'hopecore'],
    ['A moss-covered path with no signs', 'naturecore'],
  ]],
  ['What do you want your core to reveal?', [
    ['The part of me that notices what feels off', 'weirdcore'],
    ['The way my identity was shaped by the feed', 'corecore'],
    ['The softness I protect from everything else', 'cutecore'],
    ['The part of me that still wants to leave and discover', 'adventurecore'],
  ]],
];

export function quizView(stats, recent) {
  return `<div class="app-shell">
    ${sidebar('quiz', recent)}
    <main class="content-shell">
      ${topbar()}
      <section class="main-card section-card quiz-shell"><div id="quizStage"></div></section>
      ${footer()}
    </main>
  </div>`;
}

function scoreAnswers(answers) {
  const scores = Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, 0]));
  answers.forEach((answer, questionIndex) => {
    const category = QUESTIONS[questionIndex]?.[1]?.[answer]?.[1];
    if (category) scores[category] += 1;
  });
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0) || 1;
  const result = Object.entries(scores)
    .map(([key, value]) => ({ key, value, pct: Math.floor((value / total) * 100) }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  result[0].pct += 100 - result.reduce((sum, item) => sum + item.pct, 0);
  return result;
}

export function wireQuiz() {
  const stage = document.getElementById('quizStage');
  if (!stage) return;
  let answers = [];

  const showStart = () => {
    stage.innerHTML = `<div class="quiz-start">
      <p class="kicker">Core Wiki</p>
      <h1 class="quiz-title">Find Your Core</h1>
      <p class="quiz-intro">10 questions. 8 core aesthetics. One result built from the way you see the internet.</p>
      <button class="quiz-cta" id="quizStartBtn" type="button">Start the quiz →</button>
    </div>`;
    document.getElementById('quizStartBtn')?.addEventListener('click', () => showQuestion(0));
  };

  const showQuestion = (index) => {
    const [question, options] = QUESTIONS[index];
    stage.innerHTML = `<div class="quiz-question-wrap">
      <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${((index + 1) / QUESTIONS.length) * 100}%"></div></div>
      <p class="quiz-q-count">${index + 1} / ${QUESTIONS.length}</p>
      <h2 class="quiz-q-text">${escapeHtml(question)}</h2>
      <div class="quiz-options">${options.map(([text], optionIndex) => `<button class="quiz-option" data-option="${optionIndex}" type="button">${escapeHtml(text)}</button>`).join('')}</div>
    </div>`;
    stage.querySelector('.quiz-options')?.addEventListener('click', (event) => {
      const button = event.target.closest('.quiz-option');
      if (!button) return;
      answers[index] = Number(button.dataset.option);
      stage.querySelectorAll('.quiz-option').forEach((item) => item.classList.remove('is-selected'));
      button.classList.add('is-selected');
      setTimeout(() => index + 1 < QUESTIONS.length ? showQuestion(index + 1) : showResult(), 220);
    });
  };

  const showResult = () => {
    const results = scoreAnswers(answers);
    const top = results[0];
    const topCategory = CATEGORIES[top.key];
    const visible = results.filter((item) => item.value > 0).slice(0, 5);
    const visibleTotal = visible.reduce((sum, item) => sum + item.pct, 0) || 1;
    const bands = visible.map((item) => `<span class="quiz-band" style="height:${(item.pct / visibleTotal) * 100}%;background:${CATEGORIES[item.key].color}"></span>`).join('');
    const rows = visible.map((item, index) => `<a class="quiz-stat-row${index === 0 ? ' is-top' : ''}" href="${pageUrl(CATEGORIES[item.key].label)}">
      <span class="quiz-stat-dot" style="background:${CATEGORIES[item.key].color}"></span>
      <span class="quiz-stat-label">${escapeHtml(CATEGORIES[item.key].label)}</span>
      <span class="quiz-stat-pct">${item.pct}%</span><span class="quiz-stat-go">→</span>
    </a>`).join('');
    stage.innerHTML = `<div class="quiz-result">
      <div class="quiz-result-header"><p class="kicker">Your result</p><h2 class="quiz-result-title" style="color:${topCategory.color}">${escapeHtml(topCategory.label)}</h2><p class="quiz-verdict">${escapeHtml(topCategory.verdict)}</p></div>
      <div class="quiz-result-body"><div class="quiz-sample-wrap"><div class="quiz-sample-bar">${bands}</div><p class="quiz-sample-label">core<br>sample</p></div><div class="quiz-stats">${rows}</div></div>
      <p class="quiz-explore-hint">Open any result above to view its original Core Wiki page.</p>
      <div class="quiz-share-area"><button class="quiz-share-btn" id="quizShareBtn" type="button">Share my core</button></div>
      <button class="quiz-restart" id="quizRestartBtn" type="button">Take the quiz again</button>
    </div>`;

    document.getElementById('quizRestartBtn')?.addEventListener('click', () => { answers = []; showStart(); });
    document.getElementById('quizShareBtn')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const text = `My core is ${topCategory.label} (${top.pct}%). What's yours?`;
      const url = new URL(location.href); url.search = '?view=quiz';
      try {
        if (navigator.share) await navigator.share({ title: 'Find Your Core', text, url: url.href });
        else { await navigator.clipboard.writeText(`${text} ${url.href}`); button.textContent = 'Copied!'; setTimeout(() => { button.textContent = 'Share my core'; }, 1400); }
      } catch { /* share cancelled or unavailable */ }
    });
  };

  showStart();
}

const STORAGE_KEY = "vocab-study-words-v1";

const state = {
  words: [],
  currentMode: "flashcards",
  editingId: null,
  flashcards: {
    order: [],
    index: 0,
    showingDefinition: false,
  },
  quiz: {
    active: false,
    pool: [],
    index: 0,
    score: 0,
    currentQuestion: null,
    answered: false,
  },
  matching: {
    active: false,
    cards: [],
    selectedCardId: null,
    matchedPairs: 0,
    lockBoard: false,
  },
};

const elements = {
  form: document.getElementById("vocab-form"),
  editingIdInput: document.getElementById("editing-id"),
  wordInput: document.getElementById("word-input"),
  definitionInput: document.getElementById("definition-input"),
  saveWordBtn: document.getElementById("save-word-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  vocabList: document.getElementById("vocab-list"),
  vocabEmpty: document.getElementById("vocab-empty"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  modeSections: {
    flashcards: document.getElementById("mode-flashcards"),
    quiz: document.getElementById("mode-quiz"),
    matching: document.getElementById("mode-matching"),
  },
  flashcard: document.getElementById("flashcard"),
  flashcardText: document.getElementById("flashcard-text"),
  flashcardSideLabel: document.getElementById("flashcard-side-label"),
  flashPrevBtn: document.getElementById("flash-prev-btn"),
  flashFlipBtn: document.getElementById("flash-flip-btn"),
  flashNextBtn: document.getElementById("flash-next-btn"),
  flashShuffleBtn: document.getElementById("flash-shuffle-btn"),
  quizStartBtn: document.getElementById("quiz-start-btn"),
  quizProgress: document.getElementById("quiz-progress"),
  quizQuestion: document.getElementById("quiz-question"),
  quizOptions: document.getElementById("quiz-options"),
  quizFeedback: document.getElementById("quiz-feedback"),
  quizNextBtn: document.getElementById("quiz-next-btn"),
  matchingStartBtn: document.getElementById("matching-start-btn"),
  matchingStatus: document.getElementById("matching-status"),
  matchingBoard: document.getElementById("matching-board"),
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeInput(value) {
  return value.trim().replace(/\s+/g, " ");
}

function shuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.words));
}

function loadWords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.words = [];
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      state.words = [];
      return;
    }
    state.words = parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.word === "string" &&
          typeof item.definition === "string"
      )
      .map((item) => ({
        id: item.id,
        word: normalizeInput(item.word),
        definition: normalizeInput(item.definition),
      }));
  } catch (err) {
    state.words = [];
  }
}

function resetFlashcards(keepOrder = false) {
  const existingOrder = keepOrder ? state.flashcards.order : [];
  const validIds = new Set(state.words.map((entry) => entry.id));
  const preserved = existingOrder.filter((id) => validIds.has(id));
  const missing = state.words.map((entry) => entry.id).filter((id) => !preserved.includes(id));
  state.flashcards.order = [...preserved, ...missing];
  state.flashcards.index = Math.min(state.flashcards.index, Math.max(state.flashcards.order.length - 1, 0));
  state.flashcards.showingDefinition = false;
}

function renderVocabList() {
  elements.vocabList.innerHTML = "";

  if (state.words.length === 0) {
    elements.vocabEmpty.classList.remove("hidden");
    return;
  }

  elements.vocabEmpty.classList.add("hidden");

  state.words.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "vocab-item";

    const content = document.createElement("div");
    content.className = "vocab-content";
    const title = document.createElement("h4");
    title.textContent = entry.word;
    const def = document.createElement("p");
    def.textContent = entry.definition;
    content.appendChild(title);
    content.appendChild(def);

    const actions = document.createElement("div");
    actions.className = "vocab-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditing(entry.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteWord(entry.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(content);
    item.appendChild(actions);
    elements.vocabList.appendChild(item);
  });
}

function clearForm() {
  state.editingId = null;
  elements.editingIdInput.value = "";
  elements.wordInput.value = "";
  elements.definitionInput.value = "";
  elements.saveWordBtn.textContent = "Add Word";
  elements.cancelEditBtn.classList.add("hidden");
}

function startEditing(id) {
  const entry = state.words.find((item) => item.id === id);
  if (!entry) return;

  state.editingId = id;
  elements.editingIdInput.value = id;
  elements.wordInput.value = entry.word;
  elements.definitionInput.value = entry.definition;
  elements.saveWordBtn.textContent = "Save Changes";
  elements.cancelEditBtn.classList.remove("hidden");
  elements.wordInput.focus();
}

function upsertWord(word, definition) {
  if (state.editingId) {
    const idx = state.words.findIndex((item) => item.id === state.editingId);
    if (idx !== -1) {
      state.words[idx] = { ...state.words[idx], word, definition };
    }
  } else {
    state.words.push({ id: uid(), word, definition });
  }
  saveWords();
  clearForm();
  refreshStudyData();
  renderAll();
}

function deleteWord(id) {
  state.words = state.words.filter((item) => item.id !== id);
  if (state.editingId === id) {
    clearForm();
  }
  saveWords();
  refreshStudyData();
  renderAll();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const word = normalizeInput(elements.wordInput.value);
  const definition = normalizeInput(elements.definitionInput.value);
  if (!word || !definition) return;
  upsertWord(word, definition);
}

function setMode(mode) {
  state.currentMode = mode;
  elements.modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  Object.entries(elements.modeSections).forEach(([key, section]) => {
    section.classList.toggle("hidden", key !== mode);
  });
}

function getCurrentFlashcardEntry() {
  if (state.flashcards.order.length === 0) return null;
  const id = state.flashcards.order[state.flashcards.index];
  return state.words.find((entry) => entry.id === id) || null;
}

function renderFlashcards() {
  const entry = getCurrentFlashcardEntry();
  if (!entry) {
    elements.flashcardText.textContent = "Add words to start studying.";
    elements.flashcardSideLabel.textContent = "";
    elements.flashcard.classList.remove("definition-side");
    return;
  }

  const showingDefinition = state.flashcards.showingDefinition;
  elements.flashcardText.textContent = showingDefinition ? entry.definition : entry.word;
  elements.flashcardSideLabel.textContent = showingDefinition ? "Definition side" : "Word side";
  elements.flashcard.classList.toggle("definition-side", showingDefinition);
}

function flashNext() {
  if (state.flashcards.order.length === 0) return;
  state.flashcards.index = (state.flashcards.index + 1) % state.flashcards.order.length;
  state.flashcards.showingDefinition = false;
  renderFlashcards();
}

function flashPrev() {
  if (state.flashcards.order.length === 0) return;
  state.flashcards.index =
    (state.flashcards.index - 1 + state.flashcards.order.length) % state.flashcards.order.length;
  state.flashcards.showingDefinition = false;
  renderFlashcards();
}

function flashFlip() {
  if (!getCurrentFlashcardEntry()) return;
  state.flashcards.showingDefinition = !state.flashcards.showingDefinition;
  renderFlashcards();
}

function flashShuffle() {
  state.flashcards.order = shuffle(state.flashcards.order);
  state.flashcards.index = 0;
  state.flashcards.showingDefinition = false;
  renderFlashcards();
}

function startQuiz() {
  if (state.words.length < 2) {
    state.quiz.active = false;
    renderQuiz();
    return;
  }

  state.quiz.active = true;
  state.quiz.pool = shuffle(state.words.map((item) => item.id));
  state.quiz.index = 0;
  state.quiz.score = 0;
  buildQuizQuestion();
  renderQuiz();
}

function buildQuizQuestion() {
  if (!state.quiz.active) return;

  if (state.quiz.index >= state.quiz.pool.length) {
    state.quiz.currentQuestion = null;
    state.quiz.answered = false;
    renderQuiz();
    return;
  }

  const correctId = state.quiz.pool[state.quiz.index];
  const correctEntry = state.words.find((item) => item.id === correctId);
  if (!correctEntry) {
    state.quiz.index += 1;
    buildQuizQuestion();
    return;
  }

  const distractorPool = shuffle(state.words.filter((item) => item.id !== correctId));
  const options = [correctEntry.definition];
  distractorPool.forEach((item) => {
    if (options.length >= 4) return;
    if (!options.includes(item.definition)) {
      options.push(item.definition);
    }
  });

  state.quiz.currentQuestion = {
    correctId,
    prompt: correctEntry.word,
    options: shuffle(options),
    correctDefinition: correctEntry.definition,
  };
  state.quiz.answered = false;
}

function handleQuizOptionSelect(selectedDefinition) {
  if (!state.quiz.active || !state.quiz.currentQuestion || state.quiz.answered) return;

  const isCorrect = selectedDefinition === state.quiz.currentQuestion.correctDefinition;
  state.quiz.answered = true;
  if (isCorrect) {
    state.quiz.score += 1;
  }
  elements.quizFeedback.textContent = isCorrect
    ? "Correct!"
    : `Not quite. Correct answer: ${state.quiz.currentQuestion.correctDefinition}`;
  elements.quizFeedback.classList.toggle("success", isCorrect);
  elements.quizFeedback.classList.toggle("error", !isCorrect);
  elements.quizNextBtn.classList.remove("hidden");

  [...elements.quizOptions.querySelectorAll("button")].forEach((btn) => {
    const optionText = btn.dataset.option;
    const correctDef = state.quiz.currentQuestion.correctDefinition;
    btn.disabled = true;
    if (optionText === correctDef) {
      btn.classList.add("correct");
    } else if (optionText === selectedDefinition) {
      btn.classList.add("incorrect");
    }
  });
}

function nextQuizQuestion() {
  if (!state.quiz.active) return;
  state.quiz.index += 1;
  buildQuizQuestion();
  renderQuiz();
}

function renderQuiz() {
  elements.quizOptions.innerHTML = "";
  elements.quizFeedback.textContent = "";
  elements.quizFeedback.classList.remove("success", "error");
  elements.quizNextBtn.classList.add("hidden");

  if (state.words.length < 2) {
    elements.quizProgress.textContent = "";
    elements.quizQuestion.textContent = "Add at least two words to begin the quiz.";
    return;
  }

  if (!state.quiz.active) {
    elements.quizProgress.textContent = "";
    elements.quizQuestion.textContent = "Press Start Quiz to begin.";
    return;
  }

  if (!state.quiz.currentQuestion) {
    const total = state.quiz.pool.length;
    elements.quizProgress.textContent = `Finished! Score: ${state.quiz.score}/${total}`;
    elements.quizQuestion.textContent = "Great work. Press Start Quiz to play again.";
    return;
  }

  const questionNumber = state.quiz.index + 1;
  const total = state.quiz.pool.length;
  elements.quizProgress.textContent = `Question ${questionNumber}/${total} | Score ${state.quiz.score}`;
  elements.quizQuestion.textContent = `What is the definition of "${state.quiz.currentQuestion.prompt}"?`;

  state.quiz.currentQuestion.options.forEach((optionText) => {
    const optionBtn = document.createElement("button");
    optionBtn.type = "button";
    optionBtn.textContent = optionText;
    optionBtn.dataset.option = optionText;
    optionBtn.className = "quiz-option-btn";
    optionBtn.addEventListener("click", () => handleQuizOptionSelect(optionText));
    elements.quizOptions.appendChild(optionBtn);
  });
}

function startMatching() {
  if (state.words.length < 2) {
    renderMatching();
    return;
  }

  state.matching.active = true;
  state.matching.selectedCardId = null;
  state.matching.matchedPairs = 0;
  state.matching.lockBoard = false;

  const selectedEntries = shuffle(state.words).slice(0, Math.min(6, state.words.length));
  const cards = [];
  selectedEntries.forEach((entry) => {
    cards.push({
      cardId: uid(),
      pairId: entry.id,
      value: entry.word,
      side: "word",
      matched: false,
    });
    cards.push({
      cardId: uid(),
      pairId: entry.id,
      value: entry.definition,
      side: "definition",
      matched: false,
    });
  });

  state.matching.cards = shuffle(cards);
  renderMatching();
}

function finalizeMismatch(firstId, secondId) {
  state.matching.cards = state.matching.cards.map((card) => {
    if (card.cardId === firstId || card.cardId === secondId) {
      return { ...card, selected: false };
    }
    return card;
  });
  state.matching.lockBoard = false;
  renderMatching();
}

function selectMatchingCard(cardId) {
  if (!state.matching.active || state.matching.lockBoard) return;
  const card = state.matching.cards.find((item) => item.cardId === cardId);
  if (!card || card.matched || card.selected) return;

  state.matching.cards = state.matching.cards.map((item) =>
    item.cardId === cardId ? { ...item, selected: true } : item
  );

  if (!state.matching.selectedCardId) {
    state.matching.selectedCardId = cardId;
    renderMatching();
    return;
  }

  const firstId = state.matching.selectedCardId;
  state.matching.selectedCardId = null;
  const firstCard = state.matching.cards.find((item) => item.cardId === firstId);
  const secondCard = state.matching.cards.find((item) => item.cardId === cardId);
  if (!firstCard || !secondCard) {
    renderMatching();
    return;
  }

  const isMatch =
    firstCard.pairId === secondCard.pairId && firstCard.side !== secondCard.side && firstId !== cardId;

  if (isMatch) {
    state.matching.cards = state.matching.cards.map((item) => {
      if (item.cardId === firstId || item.cardId === cardId) {
        return { ...item, matched: true, selected: false };
      }
      return item;
    });
    state.matching.matchedPairs += 1;
    renderMatching();
    return;
  }

  state.matching.lockBoard = true;
  renderMatching();
  setTimeout(() => finalizeMismatch(firstId, cardId), 700);
}

function renderMatching() {
  elements.matchingBoard.innerHTML = "";

  if (state.words.length < 2) {
    elements.matchingStatus.textContent = "Add at least two words to play.";
    return;
  }

  if (!state.matching.active) {
    elements.matchingStatus.textContent = "Press Start Matching to begin.";
    return;
  }

  const totalPairs = state.matching.cards.length / 2;
  if (state.matching.matchedPairs >= totalPairs && totalPairs > 0) {
    elements.matchingStatus.textContent = `You matched all ${totalPairs} pairs!`;
  } else {
    elements.matchingStatus.textContent = `Matched ${state.matching.matchedPairs}/${totalPairs} pairs`;
  }

  state.matching.cards.forEach((card) => {
    const cardBtn = document.createElement("button");
    cardBtn.type = "button";
    cardBtn.className = "match-card";
    if (card.selected) {
      cardBtn.classList.add("selected");
    }
    if (card.matched) {
      cardBtn.classList.add("matched");
    }

    cardBtn.textContent = card.value;
    cardBtn.disabled = card.matched;
    cardBtn.addEventListener("click", () => selectMatchingCard(card.cardId));
    elements.matchingBoard.appendChild(cardBtn);
  });
}

function refreshStudyData() {
  resetFlashcards(true);

  if (state.quiz.active) {
    state.quiz.active = false;
  }

  state.matching.active = false;
  state.matching.cards = [];
  state.matching.selectedCardId = null;
  state.matching.matchedPairs = 0;
  state.matching.lockBoard = false;
}

function renderAll() {
  renderVocabList();
  renderFlashcards();
  renderQuiz();
  renderMatching();
}

function wireEvents() {
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.cancelEditBtn.addEventListener("click", clearForm);

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.flashPrevBtn.addEventListener("click", flashPrev);
  elements.flashNextBtn.addEventListener("click", flashNext);
  elements.flashFlipBtn.addEventListener("click", flashFlip);
  elements.flashShuffleBtn.addEventListener("click", flashShuffle);

  elements.quizStartBtn.addEventListener("click", startQuiz);
  elements.quizNextBtn.addEventListener("click", nextQuizQuestion);

  elements.matchingStartBtn.addEventListener("click", startMatching);
}

function init() {
  loadWords();
  resetFlashcards();
  wireEvents();
  setMode("flashcards");
  renderAll();
}

init();

const STORAGE_KEY = "vocab-study-words-v2";
const LEGACY_STORAGE_KEY = "vocab-study-words-v1";
const DICTIONARY_API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en";
const SPEECH_LANG = "en-US";

const state = {
  words: [],
  currentMode: "flashcards",
  editingId: null,
  lookingUpDefinition: false,
  availableDefinitions: [],
  lookupRequestId: 0,
  speechRecognitionSupported: false,
  microphoneGranted: false,
  isRecording: false,
  speechTarget: null,
  assistantBusy: false,
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
  fallbackDefinitionInput: document.getElementById("manual-fallback-definition-input"),
  saveManualFallbackBtn: document.getElementById("save-manual-definition-btn"),
  definitionPicker: document.getElementById("definition-picker"),
  definitionOptions: document.getElementById("definition-options"),
  manualDefinitionInput: document.getElementById("manual-definition-input"),
  resetManualDefinitionBtn: document.getElementById("reset-manual-definition-btn"),
  saveSelectedDefinitionBtn: document.getElementById("save-selected-definition-btn"),
  lookupStatus: document.getElementById("lookup-status"),
  saveWordBtn: document.getElementById("save-word-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  assistantSupportStatus: document.getElementById("assistant-support-status"),
  assistantWordInput: document.getElementById("assistant-word-input"),
  assistantPhraseInput: document.getElementById("assistant-phrase-input"),
  recordWordBtn: document.getElementById("record-word-btn"),
  recordPhraseBtn: document.getElementById("record-phrase-btn"),
  assistantAddBtn: document.getElementById("assistant-add-btn"),
  assistantStatus: document.getElementById("assistant-status"),
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
  flashSpeakBtn: document.getElementById("flash-speak-btn"),
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

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechRecognition = SpeechRecognitionCtor ? new SpeechRecognitionCtor() : null;

if (speechRecognition) {
  speechRecognition.lang = SPEECH_LANG;
  speechRecognition.maxAlternatives = 1;
  speechRecognition.continuous = false;
  speechRecognition.interimResults = false;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeInput(value) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value) {
  return normalizeInput(value).toLowerCase();
}

function shuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function setAssistantStatus(message, isError = false) {
  elements.assistantStatus.textContent = message;
  elements.assistantStatus.classList.toggle("error", isError);
  elements.assistantStatus.classList.toggle("success", !isError);
}

function setLookupStatus(message, isError = false) {
  elements.lookupStatus.textContent = message;
  elements.lookupStatus.classList.toggle("error", isError);
}

function updateManualFallbackControls() {
  const hasWord = !!normalizeInput(elements.wordInput.value);
  const hasManualDefinition = !!normalizeInput(elements.fallbackDefinitionInput.value);
  elements.saveManualFallbackBtn.disabled = !hasWord || !hasManualDefinition || state.lookingUpDefinition;
}

function handleManualFallbackInput() {
  updateManualFallbackControls();
}

function setAssistantBusy(isBusy) {
  state.assistantBusy = isBusy;
  elements.assistantAddBtn.disabled = isBusy;
  if (!state.isRecording) {
    elements.recordWordBtn.disabled = isBusy || !state.speechRecognitionSupported;
    elements.recordPhraseBtn.disabled = isBusy || !state.speechRecognitionSupported;
  }
}

function stopRecordingState() {
  state.isRecording = false;
  state.speechTarget = null;
  elements.recordWordBtn.disabled = state.assistantBusy || !state.speechRecognitionSupported;
  elements.recordPhraseBtn.disabled = state.assistantBusy || !state.speechRecognitionSupported;
  if (!state.assistantBusy) {
    maybeAutoAddFromCapturedVoice();
  }
}

function setRecordingState(target) {
  state.isRecording = true;
  state.speechTarget = target;
  elements.recordWordBtn.disabled = target === "phrase";
  elements.recordPhraseBtn.disabled = target === "word";
}

async function refreshMicrophoneAvailability() {
  if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
    return;
  }
  try {
    const permission = await navigator.permissions.query({ name: "microphone" });
    state.microphoneGranted = permission.state === "granted";
    permission.onchange = () => {
      state.microphoneGranted = permission.state === "granted";
      setAssistantBusy(state.assistantBusy);
    };
  } catch (err) {
    // Ignore unsupported permissions implementations.
  }
}

function getEntryDefaultDefinition(entry) {
  return normalizeInput(entry?.defaultDefinition || entry?.definition || "");
}

function escapeAttributeValue(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function syncManualDefinitionFromSelected() {
  const selected = getSelectedDefinition();
  elements.manualDefinitionInput.value = selected;
}

function getEffectiveDefinition() {
  const manual = normalizeInput(elements.manualDefinitionInput.value);
  return manual || getSelectedDefinition();
}

function resetManualDefinitionToDefault() {
  syncManualDefinitionFromSelected();
  updateSaveControls();
  setLookupStatus("Definition reset to selected default.");
}

function extractKeywordFromPhrase(phrase, definitions) {
  if (!phrase) return "";
  const tokenSet = new Set(
    normalizeLower(phrase)
      .split(/[^a-z0-9']+/)
      .filter((token) => token.length >= 3)
  );
  if (tokenSet.size === 0) return "";

  let bestToken = "";
  let bestScore = 0;
  definitions.forEach((definition) => {
    normalizeLower(definition)
      .split(/[^a-z0-9']+/)
      .forEach((token) => {
        if (!tokenSet.has(token)) return;
        const score = token.length;
        if (score > bestScore) {
          bestScore = score;
          bestToken = token;
        }
      });
  });
  return bestToken;
}

function pickDefinitionWithContext(definitions, phrase) {
  if (!Array.isArray(definitions) || definitions.length === 0) return "";
  if (!phrase) return definitions[0];

  const normalizedPhrase = normalizeLower(phrase);
  const keyword = extractKeywordFromPhrase(phrase, definitions);
  let best = definitions[0];
  let bestScore = -1;

  definitions.forEach((definition) => {
    const normalizedDef = normalizeLower(definition);
    let score = 0;
    if (keyword && normalizedDef.includes(keyword)) score += 3;
    if (normalizedDef.includes("in a way that")) score += 1;
    if (normalizedPhrase.includes("as a") && normalizedDef.includes("person")) score += 1;
    if (normalizedPhrase.includes("to ") && normalizedDef.includes("to ")) score += 1;
    const lengthPenalty = Math.min(Math.abs(normalizedDef.length - 90) / 90, 1);
    score += 1 - lengthPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = definition;
    }
  });
  return best;
}

function speakText(text) {
  const cleaned = normalizeInput(text || "");
  if (!cleaned) return;
  if (!("speechSynthesis" in window)) {
    setAssistantStatus("Text-to-speech is not supported in this browser.", true);
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = SPEECH_LANG;
  window.speechSynthesis.speak(utterance);
}

async function ensureMicrophoneAccess() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    setAssistantStatus("This browser cannot access the microphone API.", true);
    return false;
  }
  if (state.microphoneGranted) return true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    state.microphoneGranted = true;
    setAssistantBusy(state.assistantBusy);
    setAssistantStatus("Microphone connected. You can now use voice capture.");
    return true;
  } catch (err) {
    state.microphoneGranted = false;
    setAssistantBusy(state.assistantBusy);
    setAssistantStatus("Microphone permission denied. Use manual typing as fallback.", true);
    return false;
  }
}

async function startSpeechCapture(target) {
  if (!speechRecognition) {
    setAssistantStatus("Speech recognition is not supported in this browser.", true);
    return;
  }

  const canUseMic = await ensureMicrophoneAccess();
  if (!canUseMic) {
    return;
  }

  if (state.isRecording) {
    try {
      speechRecognition.stop();
    } catch (err) {
      // No-op; immediately restart below if needed.
    }
  }

  setRecordingState(target);
  setAssistantStatus(target === "word" ? "Listening for a vocabulary word..." : "Listening for a phrase...");

  try {
    speechRecognition.start();
  } catch (err) {
    stopRecordingState();
    setAssistantStatus("Could not start microphone capture. Try again.", true);
  }
}

function maybeAutoAddFromCapturedVoice() {
  if (state.assistantBusy) return;
  const word = normalizeInput(elements.assistantWordInput.value);
  const phrase = normalizeInput(elements.assistantPhraseInput.value);
  if (!word || !phrase) return;
  setAssistantStatus("Captured word and phrase. Auto-adding with AI assistant...");
  aiAddFromVoice();
}

function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.words));
}

function loadWords() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
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
    const uniqueByWord = new Map();
    parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.word === "string" &&
          typeof item.definition === "string"
      )
      .forEach((item) => {
        const normalizedWord = normalizeInput(item.word);
        const normalizedDefinition = normalizeInput(item.definition);
        const normalizedDefaultDefinition = normalizeInput(item.defaultDefinition || item.definition || "");
        if (!normalizedWord || !normalizedDefinition) return;
        uniqueByWord.set(normalizeLower(normalizedWord), {
          id: item.id,
          word: normalizedWord,
          definition: normalizedDefinition,
          defaultDefinition: normalizedDefaultDefinition || normalizedDefinition,
        });
      });
    state.words = [...uniqueByWord.values()];
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

    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "secondary";
    speakBtn.textContent = "Speak";
    speakBtn.addEventListener("click", () => speakText(entry.word));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(speakBtn);

    item.appendChild(content);
    item.appendChild(actions);
    elements.vocabList.appendChild(item);
  });
}

function clearForm() {
  state.editingId = null;
  state.availableDefinitions = [];
  state.lookingUpDefinition = false;
  state.lookupRequestId += 1;
  window.clearTimeout(handleWordInputChange.lookupTimer);
  elements.editingIdInput.value = "";
  elements.wordInput.disabled = false;
  elements.wordInput.value = "";
  elements.fallbackDefinitionInput.value = "";
  elements.definitionOptions.innerHTML = "";
  elements.manualDefinitionInput.value = "";
  elements.resetManualDefinitionBtn.disabled = true;
  elements.definitionPicker.classList.add("hidden");
  setLookupStatus("Type a word to fetch definitions automatically.");
  elements.saveWordBtn.textContent = "Define and Save";
  elements.saveWordBtn.disabled = false;
  elements.saveManualFallbackBtn.disabled = true;
  elements.saveSelectedDefinitionBtn.disabled = true;
  elements.cancelEditBtn.classList.add("hidden");
}

function startEditing(id) {
  const entry = state.words.find((item) => item.id === id);
  if (!entry) return;

  const defaultDefinition = getEntryDefaultDefinition(entry);
  const currentDefinition = normalizeInput(entry.definition);
  state.availableDefinitions = [...new Set([defaultDefinition, currentDefinition].filter(Boolean))];

  state.editingId = id;
  state.lookingUpDefinition = false;
  state.lookupRequestId += 1;
  elements.editingIdInput.value = id;
  elements.wordInput.value = entry.word;
  elements.fallbackDefinitionInput.value = currentDefinition;
  renderDefinitionOptions();
  const selectedRadio = elements.definitionOptions.querySelector(
    `input[name="definition-choice"][value="${escapeAttributeValue(defaultDefinition)}"]`
  );
  if (selectedRadio) {
    selectedRadio.checked = true;
  }
  elements.manualDefinitionInput.value = currentDefinition;
  updateSaveControls();
  elements.definitionPicker.classList.remove("hidden");
  setLookupStatus(
    currentDefinition === defaultDefinition
      ? "Default definition selected. You can edit it manually if needed."
      : "Custom definition loaded. Use Reset to return to default."
  );
  elements.saveWordBtn.textContent = "Save Changes";
  elements.cancelEditBtn.classList.remove("hidden");
  elements.wordInput.focus();
}

function upsertWord(word, definition, defaultDefinition = definition) {
  const normalizedWord = normalizeInput(word);
  const normalizedDefinition = normalizeInput(definition);
  const normalizedDefault = normalizeInput(defaultDefinition) || normalizedDefinition;
  if (!normalizedWord || !normalizedDefinition) return;

  const normalizedWordKey = normalizeLower(normalizedWord);
  const existingSameWord = state.words.find((item) => normalizeLower(item.word) === normalizedWordKey);
  if (existingSameWord && existingSameWord.id !== state.editingId) {
    state.editingId = existingSameWord.id;
  }

  if (state.editingId) {
    const idx = state.words.findIndex((item) => item.id === state.editingId);
    if (idx !== -1) {
      state.words[idx] = {
        ...state.words[idx],
        word: normalizedWord,
        definition: normalizedDefinition,
        defaultDefinition: normalizedDefault,
      };
    }
  } else {
    state.words.push({
      id: uid(),
      word: normalizedWord,
      definition: normalizedDefinition,
      defaultDefinition: normalizedDefault,
    });
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

function renderDefinitionOptions() {
  elements.definitionOptions.innerHTML = "";
  state.availableDefinitions.forEach((definition, idx) => {
    const option = document.createElement("label");
    option.className = "definition-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "definition-choice";
    radio.value = definition;
    radio.required = true;
    radio.checked = idx === 0;

    const text = document.createElement("span");
    text.textContent = definition;

    option.appendChild(radio);
    option.appendChild(text);
    if (idx === 0) {
      radio.checked = true;
    }
    elements.definitionOptions.appendChild(option);
  });
  syncManualDefinitionFromSelected();
  updateSaveControls();
}

function getSelectedDefinition() {
  const selected = elements.definitionOptions.querySelector('input[name="definition-choice"]:checked');
  if (!selected || typeof selected.value !== "string") {
    return "";
  }
  return normalizeInput(selected.value);
}

function updateSaveControls() {
  const hasEffectiveDefinition = !!getEffectiveDefinition();
  elements.saveSelectedDefinitionBtn.disabled = state.lookingUpDefinition || !hasEffectiveDefinition;
  elements.saveWordBtn.disabled = state.lookingUpDefinition;
  elements.resetManualDefinitionBtn.disabled = !getSelectedDefinition();
  updateManualFallbackControls();
}

function setLookupInProgress(inProgress) {
  state.lookingUpDefinition = inProgress;
  elements.wordInput.disabled = inProgress;
  elements.fallbackDefinitionInput.disabled = inProgress;
  updateSaveControls();
}

async function fetchDefinitionsForWord(word) {
  const response = await fetch(`${DICTIONARY_API_URL}/${encodeURIComponent(word)}`);
  if (!response.ok) {
    throw new Error("lookup_failed");
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  const definitionSet = new Set();
  payload.forEach((entry) => {
    if (!entry || !Array.isArray(entry.meanings)) return;
    entry.meanings.forEach((meaning) => {
      if (!meaning || !Array.isArray(meaning.definitions)) return;
      meaning.definitions.forEach((defObj) => {
        if (!defObj || typeof defObj.definition !== "string") return;
        const cleaned = normalizeInput(defObj.definition);
        if (cleaned) {
          definitionSet.add(cleaned);
        }
      });
    });
  });

  return [...definitionSet];
}

async function lookupDefinitions() {
  if (state.lookingUpDefinition) return;
  const word = normalizeInput(elements.wordInput.value);
  if (!word) {
    setLookupStatus("Enter a word first.", true);
    return;
  }

  const lookupId = state.lookupRequestId + 1;
  state.lookupRequestId = lookupId;
  setLookupInProgress(true);
  setLookupStatus("Looking up definitions...");
  elements.definitionPicker.classList.add("hidden");

  try {
    const definitions = await fetchDefinitionsForWord(word);
    if (lookupId !== state.lookupRequestId) return;

    if (definitions.length === 0) {
      state.availableDefinitions = [];
      elements.definitionOptions.innerHTML = "";
      setLookupStatus("No definitions found. Try another word.", true);
      updateSaveControls();
      return;
    }

    state.availableDefinitions = definitions;
    renderDefinitionOptions();
    elements.definitionPicker.classList.remove("hidden");
    setLookupStatus(
      definitions.length === 1
        ? "1 definition found and selected."
        : `${definitions.length} definitions found. Choose the best one.`
    );
  } catch (err) {
    if (lookupId !== state.lookupRequestId) return;
    state.availableDefinitions = [];
    elements.definitionOptions.innerHTML = "";
    setLookupStatus("Could not look up definitions right now. Please check your connection and retry.", true);
    updateSaveControls();
  } finally {
    if (lookupId === state.lookupRequestId) {
      setLookupInProgress(false);
    }
  }
}

function handleWordInputChange() {
  state.lookupRequestId += 1;
  state.availableDefinitions = [];
  elements.definitionOptions.innerHTML = "";
  elements.manualDefinitionInput.value = "";
  elements.resetManualDefinitionBtn.disabled = true;
  elements.definitionPicker.classList.add("hidden");
  setLookupStatus("Looking up definitions...");
  const currentWord = normalizeInput(elements.wordInput.value);
  if (!currentWord) {
    elements.fallbackDefinitionInput.value = "";
    setLookupStatus("Type a word to fetch definitions automatically.");
    updateSaveControls();
    return;
  }
  updateSaveControls();
  window.clearTimeout(handleWordInputChange.lookupTimer);
  handleWordInputChange.lookupTimer = window.setTimeout(() => {
    lookupDefinitions();
  }, 400);
}
handleWordInputChange.lookupTimer = null;

function saveSelectedDefinition() {
  const word = normalizeInput(elements.wordInput.value);
  const defaultDefinition = getSelectedDefinition();
  const definition = getEffectiveDefinition();
  if (!word || !defaultDefinition || !definition) {
    setLookupStatus("Select one of the fetched definitions before saving.", true);
    return;
  }
  upsertWord(word, definition, defaultDefinition);
  if (definition !== defaultDefinition) {
    setLookupStatus("Saved custom definition. Use edit + reset anytime to restore default.");
  }
}

function saveManualFallbackDefinition() {
  const word = normalizeInput(elements.wordInput.value);
  const definition = normalizeInput(elements.fallbackDefinitionInput.value);
  if (!word || !definition) {
    setLookupStatus("Enter both a word and manual definition to save.", true);
    return;
  }
  upsertWord(word, definition, definition);
  setLookupStatus("Saved manual definition without lookup.");
}

async function aiAddFromVoice() {
  if (state.assistantBusy) return;
  const word = normalizeInput(elements.assistantWordInput.value);
  const phrase = normalizeInput(elements.assistantPhraseInput.value);
  if (!word) {
    setAssistantStatus("Add or speak a word first.", true);
    return;
  }
  if (!phrase) {
    setAssistantStatus("Add or speak a phrase using the word.", true);
    return;
  }

  setAssistantBusy(true);
  setAssistantStatus(`Finding definitions for "${word}" and picking the best match...`);
  try {
    const definitions = await fetchDefinitionsForWord(word);
    if (definitions.length === 0) {
      setAssistantStatus("No definitions found. Use the manual picker as fallback.", true);
      return;
    }
    const selectedDefinition = pickDefinitionWithContext(definitions, phrase);
    upsertWord(word, selectedDefinition);
    setAssistantStatus(`Added "${word}" with an AI-selected definition.`);
    elements.assistantWordInput.value = "";
    elements.assistantPhraseInput.value = "";
  } catch (err) {
    setAssistantStatus(
      "AI-assisted add failed due to lookup/network issue. Use manual add as fallback.",
      true
    );
  } finally {
    setAssistantBusy(false);
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!getSelectedDefinition()) {
    lookupDefinitions();
    return;
  }
  saveSelectedDefinition();
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
    elements.flashSpeakBtn.disabled = true;
    return;
  }

  const showingDefinition = state.flashcards.showingDefinition;
  elements.flashcardText.textContent = showingDefinition ? entry.definition : entry.word;
  elements.flashcardSideLabel.textContent = showingDefinition ? "Definition side" : "Word side";
  elements.flashcard.classList.toggle("definition-side", showingDefinition);
  elements.flashSpeakBtn.disabled = false;
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

function flashSpeak() {
  const entry = getCurrentFlashcardEntry();
  if (!entry) return;
  speakText(entry.word);
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
  elements.saveSelectedDefinitionBtn.addEventListener("click", saveSelectedDefinition);
  elements.wordInput.addEventListener("input", handleWordInputChange);
  elements.fallbackDefinitionInput.addEventListener("input", updateManualFallbackControls);
  elements.saveManualFallbackBtn.addEventListener("click", saveManualFallbackDefinition);
  elements.definitionOptions.addEventListener("change", () => {
    syncManualDefinitionFromSelected();
    updateSaveControls();
  });
  elements.manualDefinitionInput.addEventListener("input", updateSaveControls);
  elements.resetManualDefinitionBtn.addEventListener("click", resetManualDefinitionToDefault);
  elements.recordWordBtn.addEventListener("click", () => startSpeechCapture("word"));
  elements.recordPhraseBtn.addEventListener("click", () => startSpeechCapture("phrase"));
  elements.assistantAddBtn.addEventListener("click", aiAddFromVoice);

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.flashPrevBtn.addEventListener("click", flashPrev);
  elements.flashNextBtn.addEventListener("click", flashNext);
  elements.flashFlipBtn.addEventListener("click", flashFlip);
  elements.flashShuffleBtn.addEventListener("click", flashShuffle);
  elements.flashSpeakBtn.addEventListener("click", flashSpeak);

  elements.quizStartBtn.addEventListener("click", startQuiz);
  elements.quizNextBtn.addEventListener("click", nextQuizQuestion);

  elements.matchingStartBtn.addEventListener("click", startMatching);
}

function init() {
  state.speechRecognitionSupported = !!speechRecognition;
  if (!state.speechRecognitionSupported) {
    elements.recordWordBtn.disabled = true;
    elements.recordPhraseBtn.disabled = true;
    elements.assistantSupportStatus.textContent =
      "Voice capture is unavailable in this browser. You can still type word + phrase.";
  } else {
    elements.assistantSupportStatus.textContent =
      "Voice capture requires microphone permission. Click Speak Word or Speak Phrase to grant access.";
    refreshMicrophoneAvailability().finally(() => setAssistantBusy(state.assistantBusy));
  }
  setAssistantBusy(false);

  if (speechRecognition) {
    speechRecognition.onresult = (event) => {
      const transcript = normalizeInput(event.results?.[0]?.[0]?.transcript || "");
      if (!transcript) {
        setAssistantStatus("I did not catch that. Please try speaking again.", true);
        return;
      }

      if (state.speechTarget === "word") {
        const spokenWord = transcript.split(/\s+/)[0] || transcript;
        elements.assistantWordInput.value = spokenWord;
        elements.wordInput.value = spokenWord;
        handleWordInputChange();
        setAssistantStatus(`Captured word: "${spokenWord}"`);
        maybeAutoAddFromCapturedVoice();
      } else if (state.speechTarget === "phrase") {
        elements.assistantPhraseInput.value = transcript;
        setAssistantStatus("Captured phrase.");
        maybeAutoAddFromCapturedVoice();
      }
    };

    speechRecognition.onerror = () => {
      setAssistantStatus("Voice capture failed. Please retry or type manually.", true);
    };

    speechRecognition.onend = () => {
      stopRecordingState();
    };
  }

  loadWords();
  resetFlashcards();
  wireEvents();
  setMode("flashcards");
  clearForm();
  updateManualFallbackControls();
  elements.flashSpeakBtn.disabled = true;
  renderAll();
}

init();

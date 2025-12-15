// Settings renderer

const claude = (window as any).claude;

interface Settings {
  spotlightKeybind: string;
  spotlightPersistHistory: boolean;
  dictionary?: Record<string, string>;
  llmCorrectionEnabled?: boolean;
  llmCorrectionPrompt?: string;
}

// DOM Elements
const keybindInput = document.getElementById('keybind-input') as HTMLElement;
const keybindDisplay = document.getElementById('keybind-display') as HTMLElement;
const persistHistoryCheckbox = document.getElementById('persist-history') as HTMLInputElement;
const dictionaryInput = document.getElementById('dictionary-input') as HTMLTextAreaElement;
const llmCorrectionToggle = document.getElementById('llm-correction-toggle') as HTMLInputElement;
const llmPromptInput = document.getElementById('llm-prompt-input') as HTMLTextAreaElement;
const llmPromptContainer = document.getElementById('llm-prompt-container') as HTMLElement;

let isRecordingKeybind = false;
let currentSettings: Settings | null = null;
let pendingKeybind: string | null = null;

// Detect if we're on macOS
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Format keybind for display
function formatKeybind(keybind: string): string {
  return keybind
    .replace('CommandOrControl', isMac ? '\u2318' : 'Ctrl')
    .replace('Command', '\u2318')
    .replace('Control', 'Ctrl')
    .replace('Shift', '\u21E7')
    .replace('Alt', '\u2325')
    .replace('Option', '\u2325')
    .replace(/\+/g, ' + ');
}

// Build accelerator string from current modifier state
function buildAcceleratorFromModifiers(e: KeyboardEvent): string {
  const parts: string[] = [];

  if (e.metaKey || e.ctrlKey) {
    parts.push('CommandOrControl');
  }
  if (e.shiftKey) {
    parts.push('Shift');
  }
  if (e.altKey) {
    parts.push('Alt');
  }

  return parts.join('+');
}

// Convert key event to Electron accelerator format
function keyEventToAccelerator(e: KeyboardEvent): { accelerator: string; isComplete: boolean } {
  const parts: string[] = [];

  if (e.metaKey || e.ctrlKey) {
    parts.push('CommandOrControl');
  }
  if (e.shiftKey) {
    parts.push('Shift');
  }
  if (e.altKey) {
    parts.push('Alt');
  }

  // Get the key
  let key = e.key;

  // Check if this is a modifier-only press
  const isModifierOnly = ['Meta', 'Control', 'Shift', 'Alt'].includes(key);

  if (!isModifierOnly) {
    // Normalize key names
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();

    // Map special keys
    const keyMap: Record<string, string> = {
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Escape': 'Escape',
      'Enter': 'Return',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'Tab': 'Tab',
    };

    if (keyMap[key]) {
      key = keyMap[key];
    }

    parts.push(key);
  }

  return {
    accelerator: parts.join('+'),
    isComplete: !isModifierOnly && parts.length >= 2 // Need at least one modifier + one key
  };
}

// Helper: Dictionary object to string
function dictionaryToString(dict: Record<string, string> | undefined): string {
  if (!dict) return '';
  return Object.entries(dict)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

// Helper: String to Dictionary object
function stringToDictionary(str: string): Record<string, string> {
  const dict: Record<string, string> = {};
  str.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      if (key && value) {
        dict[key] = value;
      }
    }
  });
  return dict;
}

// Load settings
async function loadSettings() {
  currentSettings = await claude.getSettings();

  if (currentSettings) {
    keybindDisplay.textContent = formatKeybind(currentSettings.spotlightKeybind);
    persistHistoryCheckbox.checked = currentSettings.spotlightPersistHistory;
    
    // Load dictionary
    dictionaryInput.value = dictionaryToString(currentSettings.dictionary);
    
    // Load LLM settings
    llmCorrectionToggle.checked = !!currentSettings.llmCorrectionEnabled;
    llmPromptInput.value = currentSettings.llmCorrectionPrompt || 'Fix grammar, punctuation, and capitalization. Return only the corrected text without any explanation.';
    
    // Update UI state
    updateLLMUIState();
  }
}

function updateLLMUIState() {
  if (llmCorrectionToggle.checked) {
    llmPromptContainer.style.opacity = '1';
    llmPromptContainer.style.pointerEvents = 'auto';
  } else {
    llmPromptContainer.style.opacity = '0.5';
    llmPromptContainer.style.pointerEvents = 'none';
  }
}

// Save keybind
async function saveKeybind(keybind: string) {
  if (!currentSettings) return;

  currentSettings = await claude.saveSettings({ spotlightKeybind: keybind });
  keybindDisplay.textContent = formatKeybind(keybind);
}

// Save persist history
async function savePersistHistory(value: boolean) {
  if (!currentSettings) return;
  currentSettings = await claude.saveSettings({ spotlightPersistHistory: value });
}

// Save transcription settings (debounced)
let saveTimeout: any;
function saveTranscriptionSettings() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (!currentSettings) return;
    
    const settings: Partial<Settings> = {
      dictionary: stringToDictionary(dictionaryInput.value),
      llmCorrectionEnabled: llmCorrectionToggle.checked,
      llmCorrectionPrompt: llmPromptInput.value
    };
    
    currentSettings = await claude.saveSettings(settings);
  }, 500);
}

// Stop recording and save if we have a valid keybind
function stopRecording(save: boolean) {
  if (!isRecordingKeybind) return;

  isRecordingKeybind = false;
  keybindInput.classList.remove('recording');

  if (save && pendingKeybind) {
    saveKeybind(pendingKeybind);
  } else if (currentSettings) {
    keybindDisplay.textContent = formatKeybind(currentSettings.spotlightKeybind);
  }

  pendingKeybind = null;
}

// Keybind recording
keybindInput.addEventListener('click', () => {
  if (!isRecordingKeybind) {
    isRecordingKeybind = true;
    pendingKeybind = null;
    keybindInput.classList.add('recording');
    keybindDisplay.textContent = 'Press keys...';
    keybindInput.focus();
  }
});

keybindInput.addEventListener('keydown', (e) => {
  if (!isRecordingKeybind) return;

  e.preventDefault();
  e.stopPropagation();

  // Handle Escape to cancel
  if (e.key === 'Escape') {
    stopRecording(false);
    return;
  }

  // Handle Enter to confirm
  if (e.key === 'Enter' && pendingKeybind) {
    stopRecording(true);
    return;
  }

  const result = keyEventToAccelerator(e);

  // Update display to show current keys being pressed
  if (result.accelerator) {
    keybindDisplay.textContent = formatKeybind(result.accelerator);

    // If we have a complete combo (modifier + key), store it as pending
    if (result.isComplete) {
      pendingKeybind = result.accelerator;
    }
  }
});

keybindInput.addEventListener('blur', () => {
  // Save pending keybind on blur (clicking away)
  stopRecording(!!pendingKeybind);
});

// Persist history toggle
persistHistoryCheckbox.addEventListener('change', () => {
  savePersistHistory(persistHistoryCheckbox.checked);
});

// Transcription settings listeners
dictionaryInput.addEventListener('input', saveTranscriptionSettings);
llmCorrectionToggle.addEventListener('change', () => {
  updateLLMUIState();
  saveTranscriptionSettings();
});
llmPromptInput.addEventListener('input', saveTranscriptionSettings);

// Load settings on page load
window.addEventListener('load', loadSettings);

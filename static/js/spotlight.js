"use strict";
(() => {
  // src/renderer/spotlight.ts
  var input = document.getElementById("spotlight-input");
  var sendBtn = document.getElementById("send-btn");
  var inputRow = document.getElementById("input-row");
  var messagesArea = document.getElementById("messages-area");
  var container = document.getElementById("container");
  var isLoading = false;
  var currentMessageEl = null;
  var currentStepsContainer = null;
  var currentResponseEl = null;
  var stepIndex = 0;
  var steps = [];
  var chevronSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M14.128 7.16482C14.3126 6.95983 14.6298 6.94336 14.835 7.12771C15.0402 7.31242 15.0567 7.62952 14.8721 7.83477L10.372 12.835L10.2939 12.9053C10.2093 12.9667 10.1063 13 9.99995 13C9.85833 12.9999 9.72264 12.9402 9.62788 12.835L5.12778 7.83477L5.0682 7.75273C4.95072 7.55225 4.98544 7.28926 5.16489 7.12771C5.34445 6.96617 5.60969 6.95939 5.79674 7.09744L5.87193 7.16482L9.99995 11.7519L14.128 7.16482Z"/></svg>`;
  var toolLabels = {
    web_search: "Searching the web",
    web_fetch: "Fetching page",
    bash_tool: "Running command",
    create_file: "Creating file",
    str_replace: "Editing file",
    view: "Reading file",
    conversation_search: "Searching past chats",
    recent_chats: "Getting recent chats"
  };
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }
  function createStepItem(type, label, isActive = true) {
    const div = document.createElement("div");
    div.className = `step-item ${type}${isActive ? "" : " done"}`;
    div.dataset.index = String(stepIndex++);
    div.innerHTML = `
    <div class="step-timeline-col">
      <div class="step-dot-row">
        <div class="step-line-top"></div>
        <div class="step-dot"></div>
        <div class="step-line-bottom"></div>
      </div>
      <div class="step-line-extend"></div>
    </div>
    <div class="step-content-col">
      <div class="step-header" onclick="this.parentElement.parentElement.classList.toggle('expanded')">
        <span class="step-label">${escapeHtml(label)}</span>
        ${isActive ? '<div class="step-spinner"></div>' : `<span class="step-chevron">${chevronSvg}</span>`}
      </div>
      <div class="step-content">
        <div class="step-text"></div>
      </div>
    </div>
  `;
    return div;
  }
  function updateStepContent(stepEl, text) {
    const textEl = stepEl.querySelector(".step-text");
    if (textEl) textEl.textContent = text;
  }
  function markStepComplete(stepEl, label) {
    stepEl.classList.add("done");
    stepEl.classList.remove("active");
    const spinner = stepEl.querySelector(".step-spinner");
    if (spinner) {
      spinner.outerHTML = `<span class="step-chevron">${chevronSvg}</span>`;
    }
    if (label) {
      const labelEl = stepEl.querySelector(".step-label");
      if (labelEl) labelEl.textContent = label;
    }
  }
  function updateWindowSize() {
    const containerHeight = container.offsetHeight;
    const newHeight = Math.max(56, Math.min(containerHeight + 2, 700));
    window.claude.spotlightResize(newHeight);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }
  input.addEventListener("input", () => {
    const hasText = input.value.trim().length > 0;
    sendBtn.classList.toggle("visible", hasText);
    sendBtn.disabled = !hasText || isLoading;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && input.value.trim() && !isLoading) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Escape") {
      window.close();
    }
  });
  sendBtn.addEventListener("click", () => {
    if (input.value.trim() && !isLoading) {
      sendMessage();
    }
  });
  async function sendMessage() {
    const message = input.value.trim();
    if (!message) return;
    isLoading = true;
    sendBtn.disabled = true;
    inputRow.classList.add("no-border");
    messagesArea.classList.add("visible");
    const userMsgEl = document.createElement("div");
    userMsgEl.className = "message";
    userMsgEl.innerHTML = `<div class="user-message">${escapeHtml(message)}</div>`;
    messagesArea.appendChild(userMsgEl);
    currentMessageEl = document.createElement("div");
    currentMessageEl.className = "message ai-message";
    currentStepsContainer = document.createElement("div");
    currentStepsContainer.className = "steps-container";
    currentResponseEl = document.createElement("div");
    currentResponseEl.className = "ai-response";
    currentResponseEl.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    currentMessageEl.appendChild(currentStepsContainer);
    currentMessageEl.appendChild(currentResponseEl);
    messagesArea.appendChild(currentMessageEl);
    stepIndex = 0;
    steps = [];
    let currentThinkingStep = null;
    let currentToolStep = null;
    updateWindowSize();
    input.value = "";
    sendBtn.classList.remove("visible");
    window.claude.onSpotlightStream((data) => {
      if (currentResponseEl) {
        currentResponseEl.textContent = data.fullText;
        updateWindowSize();
      }
    });
    window.claude.onSpotlightComplete((data) => {
      if (currentResponseEl) {
        currentResponseEl.textContent = data.fullText;
      }
      isLoading = false;
      sendBtn.disabled = false;
      updateWindowSize();
    });
    window.claude.onSpotlightThinking((data) => {
      if (data.isThinking) {
        currentThinkingStep = createStepItem("thinking", "Thinking...", true);
        currentStepsContainer?.appendChild(currentThinkingStep);
        steps.push({ type: "thinking", el: currentThinkingStep });
        updateWindowSize();
      } else if (currentThinkingStep) {
        const summary = data.thinkingText ? data.thinkingText.substring(0, 50) + "..." : "Thought";
        markStepComplete(currentThinkingStep, summary);
        if (data.thinkingText) {
          updateStepContent(currentThinkingStep, data.thinkingText);
        }
        currentThinkingStep = null;
        updateWindowSize();
      }
    });
    window.claude.onSpotlightThinkingStream((data) => {
      if (currentThinkingStep) {
        updateStepContent(currentThinkingStep, data.thinking);
        updateWindowSize();
      }
    });
    window.claude.onSpotlightTool((data) => {
      if (data.isRunning) {
        const label = data.message || toolLabels[data.toolName] || `Using ${data.toolName}`;
        currentToolStep = createStepItem("tool", label, true);
        currentStepsContainer?.appendChild(currentToolStep);
        steps.push({ type: "tool", el: currentToolStep, name: data.toolName });
        updateWindowSize();
      }
    });
    window.claude.onSpotlightToolResult((data) => {
      if (currentToolStep) {
        const label = toolLabels[data.toolName] || `Used ${data.toolName}`;
        markStepComplete(currentToolStep, label);
        if (data.result) {
          const resultText = typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2);
          updateStepContent(currentToolStep, resultText.substring(0, 500));
        }
        if (data.isError) {
          currentToolStep.classList.add("error");
        }
        currentToolStep = null;
        updateWindowSize();
      }
    });
    try {
      await window.claude.spotlightSend(message);
    } catch (err) {
      if (currentResponseEl) {
        currentResponseEl.textContent = "Error: " + (err.message || "Failed to get response");
      }
      isLoading = false;
      sendBtn.disabled = false;
    }
  }
  window.addEventListener("load", () => {
    input.focus();
  });
  window.addEventListener("beforeunload", () => {
    window.claude.removeSpotlightListeners();
    window.claude.spotlightReset();
  });
})();

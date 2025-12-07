"use strict";
(() => {
  // src/renderer/main.ts
  var conversationId = null;
  var parentMessageUuid = null;
  var isLoading = false;
  var currentStreamingElement = null;
  var conversations = [];
  var selectedModel = localStorage.getItem("selectedModel") || "claude-opus-4-5-20251101";
  var openDropdownId = null;
  var modelDisplayNames = {
    "claude-opus-4-5-20251101": "Opus 4.5",
    "claude-sonnet-4-5-20250929": "Sonnet 4.5",
    "claude-haiku-4-5-20251001": "Haiku 4.5"
  };
  var streamingBlocks = {
    thinkingBlocks: /* @__PURE__ */ new Map(),
    toolBlocks: /* @__PURE__ */ new Map(),
    textBlocks: /* @__PURE__ */ new Map(),
    textContent: ""
  };
  function resetStreamingBlocks() {
    streamingBlocks.thinkingBlocks.clear();
    streamingBlocks.toolBlocks.clear();
    streamingBlocks.textBlocks.clear();
    streamingBlocks.textContent = "";
  }
  function escapeHtml(text) {
    return (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function parseMarkdown(t, citations) {
    if (!t) return "";
    let text = t;
    if (citations && citations.length > 0) {
      const sortedCitations = [...citations].sort((a, b) => (b.start_index || 0) - (a.start_index || 0));
      for (const cit of sortedCitations) {
        if (cit.start_index !== void 0 && cit.end_index !== void 0) {
          const before = text.slice(0, cit.start_index);
          const cited = text.slice(cit.start_index, cit.end_index);
          const after = text.slice(cit.end_index);
          const citNumber = citations.indexOf(cit) + 1;
          text = before + `[CITE_START:${cit.url || ""}:${cit.title || ""}]${cited}[CITE_END:${citNumber}]` + after;
        }
      }
    }
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    text = text.replace(/\[CITE_START:([^:]*):([^\]]*)\]/g, '<a class="citation-link" href="$1" target="_blank" title="$2">').replace(/\[CITE_END:(\d+)\]/g, '</a><sup class="citation-num">[$1]</sup>');
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _l, c) => `<pre><code>${c.trim()}</code></pre>`);
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/^### (.*$)/gm, "<h3>$1</h3>").replace(/^## (.*$)/gm, "<h2>$1</h2>").replace(/^# (.*$)/gm, "<h1>$1</h1>");
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/^&gt; (.*$)/gm, "<blockquote>$1</blockquote>");
    text = text.replace(/^[\*\-] (.*$)/gm, "<li>$1</li>");
    text = text.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match.replace(/\n/g, "")}</ul>`);
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    text = text.replace(/^---$/gm, "<hr>");
    text = text.replace(/\n\n+/g, "</p><p>");
    text = text.replace(/\n/g, " ");
    text = "<p>" + text + "</p>";
    text = text.replace(/<p>\s*<\/p>/g, "");
    text = text.replace(/<p>\s*(<(pre|ul|h[1-6]|blockquote|hr)[^>]*>)/g, "$1");
    text = text.replace(/(<\/(pre|ul|h[1-6]|blockquote|hr)>)\s*<\/p>/g, "$1");
    text = text.replace(/<\/p>\s*<p>/g, "</p><p>");
    return text;
  }
  function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }
  function autoResizeHome(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = /* @__PURE__ */ new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1e3 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  }
  function $(id) {
    return document.getElementById(id);
  }
  function scrollToBottom() {
    const m = $("messages");
    if (m) m.scrollTop = m.scrollHeight;
  }
  function hideEmptyState() {
    const e = $("empty-state");
    if (e) e.style.display = "none";
  }
  function showLogin() {
    const login2 = $("login");
    const home = $("home");
    const chat = $("chat");
    const sidebarTab2 = $("sidebar-tab");
    if (login2) login2.style.display = "flex";
    if (home) home.classList.remove("active");
    if (chat) chat.classList.remove("active");
    if (sidebarTab2) sidebarTab2.classList.add("hidden");
    closeSidebar();
  }
  function showHome() {
    const login2 = $("login");
    const home = $("home");
    const chat = $("chat");
    const sidebarTab2 = $("sidebar-tab");
    if (login2) login2.style.display = "none";
    if (home) home.classList.add("active");
    if (chat) chat.classList.remove("active");
    if (sidebarTab2) sidebarTab2.classList.remove("hidden");
    setTimeout(() => $("home-input")?.focus(), 100);
  }
  function showChat() {
    const login2 = $("login");
    const home = $("home");
    const chat = $("chat");
    const sidebarTab2 = $("sidebar-tab");
    const modelBadge = document.querySelector(".model-badge");
    if (login2) login2.style.display = "none";
    if (home) home.classList.remove("active");
    if (chat) chat.classList.add("active");
    if (sidebarTab2) sidebarTab2.classList.remove("hidden");
    if (modelBadge) modelBadge.textContent = modelDisplayNames[selectedModel] || "Opus 4.5";
  }
  function selectModel(btn) {
    document.querySelectorAll(".model-option").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedModel = btn.getAttribute("data-model") || selectedModel;
    localStorage.setItem("selectedModel", selectedModel);
  }
  function toggleSidebar() {
    const sidebar = $("sidebar");
    const overlay = $("sidebar-overlay");
    const sidebarTab2 = $("sidebar-tab");
    if (!sidebar || !overlay || !sidebarTab2) return;
    const isOpening = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open");
    overlay.classList.toggle("open");
    if (isOpening) {
      sidebarTab2.classList.add("hidden");
      loadConversationsList();
    } else {
      sidebarTab2.classList.remove("hidden");
    }
  }
  function closeSidebar() {
    $("sidebar")?.classList.remove("open");
    $("sidebar-overlay")?.classList.remove("open");
    $("sidebar-tab")?.classList.remove("hidden");
  }
  function setupSidebarHover() {
    const sidebarTab2 = $("sidebar-tab");
    if (!sidebarTab2) return;
    let hoverTimeout;
    sidebarTab2.addEventListener("mouseenter", () => {
      hoverTimeout = setTimeout(() => {
        toggleSidebar();
      }, 200);
    });
    sidebarTab2.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimeout);
    });
  }
  async function loadConversationsList() {
    const content = $("sidebar-content");
    if (!content) return;
    try {
      conversations = await window.claude.getConversations();
      renderConversationsList();
    } catch {
      content.innerHTML = '<div class="conv-loading">Failed to load</div>';
    }
  }
  function renderConversationsList() {
    const content = $("sidebar-content");
    if (!content) return;
    if (!conversations || conversations.length === 0) {
      content.innerHTML = '<div class="conv-loading">No conversations yet</div>';
      return;
    }
    content.innerHTML = conversations.map(
      (c) => `
      <div class="conv-item ${c.uuid === conversationId ? "active" : ""}" data-uuid="${c.uuid}" data-starred="${c.is_starred || false}">
        <div class="conv-item-row">
          <div class="conv-item-info" onclick="loadConversation('${c.uuid}')">
            <div class="conv-item-title">${c.is_starred ? '<span class="conv-star">\u2605</span>' : ""}${escapeHtml(c.name || c.summary || "New conversation")}</div>
            <div class="conv-item-date">${formatDate(c.updated_at)}</div>
          </div>
          <button class="conv-menu-btn" onclick="event.stopPropagation(); toggleConvMenu('${c.uuid}')">\u22EF</button>
        </div>
        <div class="conv-dropdown" id="conv-dropdown-${c.uuid}">
          <div class="conv-dropdown-item" onclick="event.stopPropagation(); starConversation('${c.uuid}', ${!c.is_starred})">
            <span class="conv-dropdown-icon">${c.is_starred ? "\u2606" : "\u2605"}</span>
            <span>${c.is_starred ? "Unstar" : "Star"}</span>
          </div>
          <div class="conv-dropdown-item" onclick="event.stopPropagation(); startRenameConversation('${c.uuid}')">
            <span class="conv-dropdown-icon">\u270E</span>
            <span>Rename</span>
          </div>
          <div class="conv-dropdown-item delete" onclick="event.stopPropagation(); deleteConversation('${c.uuid}')">
            <span class="conv-dropdown-icon">\u2715</span>
            <span>Delete</span>
          </div>
        </div>
      </div>
    `
    ).join("");
  }
  function toggleConvMenu(uuid) {
    const dropdown = document.getElementById(`conv-dropdown-${uuid}`);
    if (!dropdown) return;
    if (openDropdownId && openDropdownId !== uuid) {
      const oldDropdown = document.getElementById(`conv-dropdown-${openDropdownId}`);
      if (oldDropdown) oldDropdown.classList.remove("open");
    }
    dropdown.classList.toggle("open");
    openDropdownId = dropdown.classList.contains("open") ? uuid : null;
  }
  async function deleteConversation(uuid) {
    const deletedConv = conversations.find((c) => c.uuid === uuid);
    conversations = conversations.filter((c) => c.uuid !== uuid);
    if (uuid === conversationId) {
      conversationId = null;
      parentMessageUuid = null;
      closeSidebar();
      showHome();
    } else {
      renderConversationsList();
    }
    try {
      await window.claude.deleteConversation(uuid);
    } catch {
      if (deletedConv) {
        conversations.push(deletedConv);
        conversations.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        renderConversationsList();
      }
    }
  }
  async function starConversation(uuid, isStarred) {
    const conv = conversations.find((c) => c.uuid === uuid);
    const previousState = conv?.is_starred;
    if (conv) conv.is_starred = isStarred;
    renderConversationsList();
    try {
      await window.claude.starConversation(uuid, isStarred);
    } catch {
      if (conv) conv.is_starred = previousState;
      renderConversationsList();
    }
  }
  function startRenameConversation(uuid) {
    const convItem = document.querySelector(`.conv-item[data-uuid="${uuid}"]`);
    if (!convItem) return;
    const dropdown = document.getElementById(`conv-dropdown-${uuid}`);
    if (dropdown) dropdown.classList.remove("open");
    openDropdownId = null;
    const conv = conversations.find((c) => c.uuid === uuid);
    const currentName = conv?.name || conv?.summary || "";
    const titleEl = convItem.querySelector(".conv-item-title");
    if (!titleEl) return;
    titleEl.innerHTML = `<input type="text" class="conv-rename-input" value="${currentName.replace(/"/g, "&quot;")}" onkeydown="handleRenameKeydown(event, '${uuid}')" onblur="finishRename('${uuid}', this.value)">`;
    const input = titleEl.querySelector("input");
    input?.focus();
    input?.select();
  }
  function handleRenameKeydown(e, uuid) {
    if (e.key === "Enter") {
      e.preventDefault();
      finishRename(uuid, e.target.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderConversationsList();
    }
  }
  async function finishRename(uuid, newName) {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      renderConversationsList();
      return;
    }
    const conv = conversations.find((c) => c.uuid === uuid);
    const previousName = conv?.name;
    if (conv) conv.name = trimmedName;
    renderConversationsList();
    try {
      await window.claude.renameConversation(uuid, trimmedName);
    } catch {
      if (conv) conv.name = previousName;
      renderConversationsList();
    }
  }
  var pencilSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
  var checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  var closeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  var chevronSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M14.128 7.16482C14.3126 6.95983 14.6298 6.94336 14.835 7.12771C15.0402 7.31242 15.0567 7.62952 14.8721 7.83477L10.372 12.835L10.2939 12.9053C10.2093 12.9667 10.1063 13 9.99995 13C9.85833 12.9999 9.72264 12.9402 9.62788 12.835L5.12778 7.83477L5.0682 7.75273C4.95072 7.55225 4.98544 7.28926 5.16489 7.12771C5.34445 6.96617 5.60969 6.95939 5.79674 7.09744L5.87193 7.16482L9.99995 11.7519L14.128 7.16482Z"/></svg>`;
  function addMessage(role, content, raw = false, storedParentUuid, extraClasses) {
    const el = document.createElement("div");
    el.className = "message " + role + (extraClasses ? " " + extraClasses : "");
    const c = document.createElement("div");
    c.className = "message-content";
    c.innerHTML = role === "user" ? escapeHtml(content) : raw ? content : parseMarkdown(content);
    el.appendChild(c);
    if (role === "user") {
      el.dataset.parentUuid = storedParentUuid || parentMessageUuid || conversationId || "";
      el.dataset.originalText = content;
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.innerHTML = pencilSvg;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        startEditMessage(el);
      };
      el.appendChild(editBtn);
    }
    $("messages")?.appendChild(el);
    scrollToBottom();
    return el;
  }
  function addMessageRaw(role, htmlContent) {
    const el = document.createElement("div");
    el.className = "message " + role;
    const c = document.createElement("div");
    c.className = "message-content";
    c.innerHTML = htmlContent;
    el.appendChild(c);
    $("messages")?.appendChild(el);
    scrollToBottom();
    return el;
  }
  function startEditMessage(msgEl) {
    if (isLoading) return;
    msgEl.classList.add("editing");
    const contentEl = msgEl.querySelector(".message-content");
    if (!contentEl) return;
    const originalText = msgEl.dataset.originalText || contentEl.textContent || "";
    contentEl.innerHTML = `
    <div class="message-edit-container">
      <textarea class="message-edit-textarea">${escapeHtml(originalText)}</textarea>
      <div class="message-edit-actions">
        <button class="message-edit-cancel" onclick="cancelEditMessage(this)">${closeSvg}</button>
        <button class="message-edit-submit" onclick="submitEditMessage(this)">${checkSvg}</button>
      </div>
    </div>
  `;
    const textarea = contentEl.querySelector(".message-edit-textarea");
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
    textarea.oninput = () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    };
    textarea.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitEditMessage(textarea);
      } else if (e.key === "Escape") {
        cancelEditMessage(textarea);
      }
    };
  }
  function cancelEditMessage(btnOrTextarea) {
    const msgEl = btnOrTextarea.closest(".message");
    if (!msgEl) return;
    msgEl.classList.remove("editing");
    const contentEl = msgEl.querySelector(".message-content");
    const originalText = msgEl.dataset.originalText || "";
    if (contentEl) contentEl.innerHTML = escapeHtml(originalText);
  }
  async function submitEditMessage(btnOrTextarea) {
    if (isLoading) return;
    const msgEl = btnOrTextarea.closest(".message");
    if (!msgEl) return;
    const textarea = msgEl.querySelector(".message-edit-textarea");
    const newText = textarea?.value.trim();
    if (!newText) {
      cancelEditMessage(btnOrTextarea);
      return;
    }
    const branchParentUuid = msgEl.dataset.parentUuid;
    let nextEl = msgEl.nextElementSibling;
    while (nextEl) {
      const toRemove = nextEl;
      nextEl = nextEl.nextElementSibling;
      toRemove.remove();
    }
    msgEl.classList.remove("editing");
    msgEl.dataset.originalText = newText;
    const contentEl = msgEl.querySelector(".message-content");
    if (contentEl) contentEl.innerHTML = escapeHtml(newText);
    parentMessageUuid = branchParentUuid || null;
    isLoading = true;
    const sendBtn = $("send-btn");
    if (sendBtn) sendBtn.disabled = true;
    currentStreamingElement = addMessage("assistant", '<div class="loading-dots"><span></span><span></span><span></span></div>', true);
    try {
      await window.claude.sendMessage(conversationId, newText, parentMessageUuid);
    } catch (e) {
      if (currentStreamingElement) {
        const content = currentStreamingElement.querySelector(".message-content");
        if (content) content.innerHTML = `<span style="color:#FF453A">Error: ${e.message}</span>`;
      }
      currentStreamingElement = null;
      isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }
  var FALLBACK_FAVICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjciIGZpbGw9IiNkZGQiLz48L3N2Zz4=";
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
  function buildToolResultContent(_toolName, result, isError) {
    if (!result) return "";
    const res = result;
    if (res.type === "rich_link" && res.link) {
      const link = res.link;
      const title = link.title || link.url || "Fetched page";
      const url = link.url || "";
      let icon = link.icon_url || "";
      if (!icon && url) {
        try {
          const domain = new URL(url).hostname;
          icon = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`;
        } catch {
        }
      }
      if (!icon) icon = FALLBACK_FAVICON;
      return `
      <a class="link-card" href="${escapeHtml(url)}" target="_blank">
        <img class="link-card-icon" src="${escapeHtml(icon)}" onerror="this.onerror=null;this.src='${FALLBACK_FAVICON}'">
        <div class="link-card-info">
          <div class="link-card-title">${escapeHtml(title)}</div>
          <div class="link-card-url">${escapeHtml(url)}</div>
        </div>
      </a>
    `;
    }
    if (res.type === "rich_content" && res.content) {
      let html = '<div class="chat-links">';
      const items = res.content;
      for (const item of items.slice(0, 5)) {
        const title = item.title || "Chat";
        const url = item.url || "";
        html += `
        <a class="chat-link-item" href="${escapeHtml(url)}" target="_blank">
          <span class="chat-link-icon">\u{1F4AC}</span>
          <span class="chat-link-title">${escapeHtml(title)}</span>
        </a>
      `;
      }
      html += "</div>";
      return html;
    }
    if (res.type === "json_block") {
      const code = res.code || "";
      const filename = res.filename || "";
      const stdout = res.stdout || "";
      const stderr = res.stderr || "";
      const returncode = res.returncode;
      if (stdout || stderr || returncode !== void 0) {
        const output = stdout || stderr || "";
        const hasError = isError || returncode !== 0;
        if (output) {
          return `<div class="tool-output ${hasError ? "error" : ""}">${escapeHtml(output.substring(0, 500))}${output.length > 500 ? "..." : ""}</div>`;
        }
        return hasError ? '<div class="file-op error"><span class="file-op-icon">\u2717</span><span class="file-op-text">Command failed</span></div>' : "";
      }
      if (code && filename) {
        const shortFilename = filename.split("/").pop();
        const preview = code.substring(0, 200);
        return `
        <div class="file-preview">
          <div class="file-preview-header">${escapeHtml(shortFilename || filename)}</div>
          <div class="tool-output">${escapeHtml(preview)}${code.length > 200 ? "..." : ""}</div>
        </div>
      `;
      }
      if (code) {
        return `<div class="tool-output">${escapeHtml(code.substring(0, 300))}${code.length > 300 ? "..." : ""}</div>`;
      }
    }
    if (res.type === "text") {
      const text = res.text || "";
      if (text.toLowerCase().includes("success")) {
        return `<div class="file-op success"><span class="file-op-icon">\u2713</span><span class="file-op-text">${escapeHtml(text)}</span></div>`;
      }
      return `<div class="tool-output ${isError ? "error" : ""}">${escapeHtml(text)}</div>`;
    }
    if (Array.isArray(result)) {
      let html = '<div class="search-results">';
      const items = result;
      for (const item of items.slice(0, 5)) {
        const siteDomain = item.metadata?.site_domain || "";
        const siteName = item.metadata?.site_name || siteDomain || "";
        let favicon = item.metadata?.favicon_url || "";
        if (!favicon && siteDomain) {
          favicon = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(siteDomain)}`;
        }
        if (!favicon) favicon = FALLBACK_FAVICON;
        html += `
        <a class="search-result-item" href="${escapeHtml(item.url || "")}" target="_blank">
          <img class="search-result-favicon" src="${escapeHtml(favicon)}" onerror="this.onerror=null;this.src='${FALLBACK_FAVICON}'">
          <div class="search-result-info">
            <div class="search-result-title">${escapeHtml(item.title || "")}</div>
            <div class="search-result-site">${escapeHtml(siteName)}</div>
          </div>
        </a>
      `;
      }
      html += "</div>";
      return html;
    }
    if (res.link) {
      const link = res.link;
      const title = link.title || link.url || "Fetched page";
      const url = link.url || "";
      let icon = link.icon_url || "";
      if (!icon && url) {
        try {
          const domain = new URL(url).hostname;
          icon = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`;
        } catch {
        }
      }
      if (!icon) icon = FALLBACK_FAVICON;
      return `
      <a class="link-card" href="${escapeHtml(url)}" target="_blank">
        <img class="link-card-icon" src="${escapeHtml(icon)}" onerror="this.onerror=null;this.src='${FALLBACK_FAVICON}'">
        <div class="link-card-info">
          <div class="link-card-title">${escapeHtml(title)}</div>
          <div class="link-card-url">${escapeHtml(url)}</div>
        </div>
      </a>
    `;
    }
    if (res.rich_content) {
      let html = '<div class="chat-links">';
      const items = Array.isArray(res.rich_content) ? res.rich_content : [res.rich_content];
      for (const item of items.slice(0, 5)) {
        const title = item.title || item.text || "Chat";
        const url = item.url || item.href || "";
        html += `
        <a class="chat-link-item" href="${escapeHtml(url)}" target="_blank">
          <span class="chat-link-icon">\u{1F4AC}</span>
          <span class="chat-link-title">${escapeHtml(title)}</span>
        </a>
      `;
      }
      html += "</div>";
      return html;
    }
    if (res.text) {
      return `<div class="tool-output ${isError ? "error" : ""}">${escapeHtml(res.text)}</div>`;
    }
    if (typeof result === "string") {
      return `<div class="tool-output ${isError ? "error" : ""}">${escapeHtml(result)}</div>`;
    }
    return "";
  }
  function buildStepItem(step, isActive) {
    if (step.type === "thinking") {
      const summary = step.thinkingSummary || step.summary;
      const label = summary ? escapeHtml(summary) : "Thinking";
      const idx = step.index !== void 0 ? step.index : "";
      return `
      <div class="step-item thinking" data-index="${idx}" onclick="this.classList.toggle('expanded')">
        <div class="step-timeline-col">
          <div class="step-dot-row">
            <div class="step-line-top"></div>
            <div class="step-dot"></div>
            <div class="step-line-bottom"></div>
          </div>
          <div class="step-line-extend"></div>
        </div>
        <div class="step-content-col">
          <div class="step-header">
            <span class="step-label">${label}</span>
            ${isActive ? '<div class="step-spinner"></div>' : `<span class="step-chevron">${chevronSvg}</span>`}
          </div>
          <div class="step-content">
            <div class="step-text">${escapeHtml(step.thinkingText || step.text || "")}</div>
          </div>
        </div>
      </div>
    `;
    } else if (step.type === "tool") {
      const message = step.toolMessage || step.message;
      const label = message || toolLabels[step.toolName || ""] || `Using ${step.toolName}`;
      const resultHtml = buildToolResultContent(step.toolName || "", step.toolResult, step.isError);
      const idx = step.index !== void 0 ? step.index : "";
      return `
      <div class="step-item tool ${step.toolResult ? "" : "active"}" data-index="${idx}" onclick="this.classList.toggle('expanded')">
        <div class="step-timeline-col">
          <div class="step-dot-row">
            <div class="step-line-top"></div>
            <div class="step-dot"></div>
            <div class="step-line-bottom"></div>
          </div>
          <div class="step-line-extend"></div>
        </div>
        <div class="step-content-col">
          <div class="step-header">
            <span class="step-label">${escapeHtml(label)}</span>
            ${isActive && !step.toolResult ? '<div class="step-spinner"></div>' : `<span class="step-chevron">${chevronSvg}</span>`}
          </div>
          <div class="step-content">${resultHtml}</div>
        </div>
      </div>
    `;
    }
    return "";
  }
  function buildInterleavedContent(steps) {
    if (!steps || steps.length === 0) return "";
    let html = "";
    let currentTimelineSteps = [];
    for (const step of steps) {
      if (step.type === "text") {
        if (currentTimelineSteps.length > 0) {
          html += '<div class="steps-timeline">';
          for (const ts of currentTimelineSteps) {
            html += buildStepItem(ts, false);
          }
          html += "</div>";
          currentTimelineSteps = [];
        }
        html += parseMarkdown(step.text || "", step.citations);
      } else {
        currentTimelineSteps.push(step);
      }
    }
    if (currentTimelineSteps.length > 0) {
      html += '<div class="steps-timeline">';
      for (const ts of currentTimelineSteps) {
        html += buildStepItem(ts, false);
      }
      html += "</div>";
    }
    return html;
  }
  function buildStreamingContent() {
    const allBlocks = [];
    streamingBlocks.thinkingBlocks.forEach((block, idx) => {
      allBlocks.push({
        type: "thinking",
        index: idx,
        thinkingText: block.text,
        thinkingSummary: block.summary,
        isActive: block.isActive
      });
    });
    streamingBlocks.toolBlocks.forEach((block, idx) => {
      allBlocks.push({
        type: "tool",
        index: idx,
        toolName: block.name,
        toolMessage: block.message,
        toolResult: block.result,
        isError: block.isError,
        isActive: block.isRunning
      });
    });
    streamingBlocks.textBlocks.forEach((block, idx) => {
      allBlocks.push({
        type: "text",
        index: idx,
        text: block.text
      });
    });
    if (allBlocks.length === 0) return "";
    allBlocks.sort((a, b) => (a.index || 0) - (b.index || 0));
    let html = "";
    let currentTimelineSteps = [];
    for (const step of allBlocks) {
      if (step.type === "text") {
        if (currentTimelineSteps.length > 0) {
          html += '<div class="steps-timeline">';
          for (const ts of currentTimelineSteps) {
            html += buildStepItem(ts, ts.isActive || false);
          }
          html += "</div>";
          currentTimelineSteps = [];
        }
        html += parseMarkdown(step.text || "");
      } else {
        currentTimelineSteps.push(step);
      }
    }
    if (currentTimelineSteps.length > 0) {
      html += '<div class="steps-timeline">';
      for (const ts of currentTimelineSteps) {
        html += buildStepItem(ts, ts.isActive || false);
      }
      html += "</div>";
    }
    return html;
  }
  function updateStreamingContent() {
    if (!currentStreamingElement) return;
    const contentEl = currentStreamingElement.querySelector(".message-content");
    if (!contentEl) return;
    const expandedIndices = /* @__PURE__ */ new Set();
    contentEl.querySelectorAll(".step-item.expanded").forEach((el) => {
      const idx = el.getAttribute("data-index");
      if (idx) expandedIndices.add(idx);
    });
    let html = buildStreamingContent();
    if (!html) {
      html = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    }
    contentEl.innerHTML = html;
    expandedIndices.forEach((idx) => {
      const el = contentEl.querySelector(`.step-item[data-index="${idx}"]`);
      if (el) el.classList.add("expanded");
    });
  }
  function parseStoredMessageContent(content) {
    const steps = [];
    let currentToolUse = null;
    for (const block of content) {
      if (block.type === "thinking") {
        const lastSummary = block.summaries && block.summaries.length > 0 ? block.summaries[block.summaries.length - 1].summary : null;
        steps.push({
          type: "thinking",
          thinkingText: block.thinking,
          thinkingSummary: lastSummary || void 0
        });
      } else if (block.type === "tool_use") {
        currentToolUse = {
          type: "tool",
          toolName: block.name,
          toolMessage: block.message || block.display_content?.text,
          toolInput: block.input ? JSON.stringify(block.input) : void 0
        };
      } else if (block.type === "tool_result") {
        if (currentToolUse && currentToolUse.toolName === block.name) {
          let resultData = null;
          if (block.display_content) {
            resultData = block.display_content;
          } else if (block.content && Array.isArray(block.content)) {
            if (block.name === "web_search") {
              resultData = block.content.filter((c) => c.type === "knowledge").map((c) => ({
                title: c.title,
                url: c.url,
                metadata: c.metadata
              }));
            } else {
              const textContent = block.content.find((c) => c.type === "text");
              if (textContent) {
                resultData = { type: "text", text: textContent.text };
              }
            }
          }
          currentToolUse.toolResult = resultData;
          currentToolUse.isError = block.is_error;
          steps.push(currentToolUse);
          currentToolUse = null;
        }
      } else if (block.type === "text") {
        steps.push({
          type: "text",
          text: block.text,
          citations: block.citations
        });
      }
    }
    if (currentToolUse) {
      steps.push(currentToolUse);
    }
    return steps;
  }
  async function loadConversation(convId) {
    try {
      const conv = await window.claude.loadConversation(convId);
      conversationId = convId;
      isLoading = false;
      const sendBtn = $("send-btn");
      const stopBtn = $("stop-btn");
      if (sendBtn) sendBtn.classList.remove("hidden");
      if (stopBtn) stopBtn.classList.remove("visible");
      showChat();
      const messagesEl = $("messages");
      if (!messagesEl) return;
      messagesEl.innerHTML = "";
      if (conv.chat_messages && conv.chat_messages.length > 0) {
        let prevMsgUuid = convId;
        for (const msg of conv.chat_messages) {
          const role = msg.sender === "human" ? "user" : "assistant";
          if (role === "user") {
            let text = "";
            if (msg.content && Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === "text") {
                  text += block.text;
                }
              }
            } else if (msg.text) {
              text = msg.text;
            }
            if (text) {
              addMessage("user", text, false, prevMsgUuid);
            }
          } else {
            if (msg.content && Array.isArray(msg.content)) {
              const steps = parseStoredMessageContent(msg.content);
              if (steps.length > 0) {
                const html = buildInterleavedContent(steps);
                addMessageRaw("assistant", html);
              }
            } else if (msg.text) {
              addMessage("assistant", msg.text);
            }
          }
          if (msg.uuid) {
            prevMsgUuid = msg.uuid;
            parentMessageUuid = msg.uuid;
          }
        }
      } else {
        messagesEl.innerHTML = '<div class="empty-state" id="empty-state"><div class="empty-state-icon">\u2726</div><p>What can I help with?</p><span class="hint">Claude is ready</span></div>';
        parentMessageUuid = convId;
      }
      closeSidebar();
      renderConversationsList();
      scrollToBottom();
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
  }
  async function login() {
    const errorEl = $("login-error");
    if (errorEl) errorEl.textContent = "";
    const r = await window.claude.login();
    if (r.success) {
      showChat();
      await startNewConversation();
      loadConversationsList();
    } else {
      if (errorEl) errorEl.textContent = r.error || "Failed";
    }
  }
  async function logout() {
    await window.claude.logout();
    conversationId = parentMessageUuid = null;
    conversations = [];
    const messagesEl = $("messages");
    if (messagesEl) {
      messagesEl.innerHTML = '<div class="empty-state" id="empty-state"><div class="empty-state-icon">\u2726</div><p>What can I help with?</p><span class="hint">Claude is ready</span></div>';
    }
    showLogin();
  }
  async function startNewConversation() {
    try {
      const r = await window.claude.createConversation();
      conversationId = r.conversationId;
      parentMessageUuid = r.parentMessageUuid || r.uuid || crypto.randomUUID();
    } catch (e) {
      addMessage("assistant", "Failed: " + e.message);
    }
  }
  function newChat() {
    conversationId = null;
    parentMessageUuid = null;
    const homeInput = $("home-input");
    if (homeInput) homeInput.value = "";
    closeSidebar();
    showHome();
  }
  function handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
  function handleHomeKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendFromHome();
    }
  }
  async function sendFromHome() {
    const input = $("home-input");
    const msg = input?.value.trim();
    if (!msg || isLoading) return;
    isLoading = true;
    const homeSendBtn = $("home-send-btn");
    if (homeSendBtn) homeSendBtn.disabled = true;
    try {
      const r = await window.claude.createConversation(selectedModel);
      conversationId = r.conversationId;
      parentMessageUuid = r.parentMessageUuid || r.uuid || crypto.randomUUID();
      const homeContainer = $("home");
      const chatContainer = $("chat");
      if (!homeContainer || !chatContainer) return;
      homeContainer.classList.add("transitioning");
      await new Promise((resolve) => setTimeout(resolve, 350));
      const messagesEl = $("messages");
      if (messagesEl) messagesEl.innerHTML = "";
      chatContainer.classList.add("entering");
      homeContainer.classList.remove("active");
      chatContainer.classList.add("active");
      const modelBadge = document.querySelector(".model-badge");
      if (modelBadge) modelBadge.textContent = modelDisplayNames[selectedModel] || "Opus 4.5";
      const sidebarTab2 = $("sidebar-tab");
      if (sidebarTab2) sidebarTab2.classList.remove("hidden");
      const userMsgEl = addMessage("user", msg, false, null, "fly-in");
      await new Promise((resolve) => setTimeout(resolve, 200));
      currentStreamingElement = addMessage("assistant", '<div class="loading-dots"><span></span><span></span><span></span></div>', true, null, "fade-in");
      const sendBtn = $("send-btn");
      const stopBtn = $("stop-btn");
      if (sendBtn) sendBtn.classList.add("hidden");
      if (stopBtn) stopBtn.classList.add("visible");
      setTimeout(() => {
        homeContainer.classList.remove("transitioning");
        chatContainer.classList.remove("entering");
      }, 600);
      await window.claude.sendMessage(conversationId, msg, parentMessageUuid);
      window.claude.generateTitle(conversationId, msg).then(() => loadConversationsList()).catch(() => loadConversationsList());
      input.value = "";
      input.style.height = "auto";
    } catch (e) {
      if (currentStreamingElement) {
        const content = currentStreamingElement.querySelector(".message-content");
        if (content) content.innerHTML = `<span style="color:#FF453A">Error: ${e.message}</span>`;
      }
      currentStreamingElement = null;
      isLoading = false;
      if (homeSendBtn) homeSendBtn.disabled = false;
      const sendBtn = $("send-btn");
      const stopBtn = $("stop-btn");
      if (sendBtn) sendBtn.classList.remove("hidden");
      if (stopBtn) stopBtn.classList.remove("visible");
    }
  }
  async function sendMessage() {
    const input = $("input");
    const msg = input?.value.trim();
    if (!msg || isLoading || !conversationId) return;
    isLoading = true;
    input.value = "";
    input.style.height = "auto";
    const sendBtn = $("send-btn");
    const stopBtn = $("stop-btn");
    if (sendBtn) sendBtn.classList.add("hidden");
    if (stopBtn) stopBtn.classList.add("visible");
    hideEmptyState();
    addMessage("user", msg);
    currentStreamingElement = addMessage("assistant", '<div class="loading-dots"><span></span><span></span><span></span></div>', true);
    try {
      await window.claude.sendMessage(conversationId, msg, parentMessageUuid);
    } catch (e) {
      if (currentStreamingElement) {
        const content = currentStreamingElement.querySelector(".message-content");
        if (content) content.innerHTML = `<span style="color:#FF453A">Error: ${e.message}</span>`;
      }
      currentStreamingElement = null;
      isLoading = false;
      if (sendBtn) sendBtn.classList.remove("hidden");
      if (stopBtn) stopBtn.classList.remove("visible");
    }
  }
  async function stopGenerating() {
    if (!conversationId || !isLoading) return;
    try {
      await window.claude.stopResponse(conversationId);
      const conv = await window.claude.loadConversation(conversationId);
      if (conv.chat_messages && conv.chat_messages.length > 0) {
        const lastMsg = conv.chat_messages[conv.chat_messages.length - 1];
        if (lastMsg.uuid) {
          parentMessageUuid = lastMsg.uuid;
        }
      }
    } catch (e) {
      console.error("Stop failed:", e);
    }
    if (currentStreamingElement) {
      const content = currentStreamingElement.querySelector(".message-content");
      const hasLoadingDots = content?.querySelector(".loading-dots");
      const hasContent = streamingBlocks.textContent.trim().length > 0;
      if (hasLoadingDots && !hasContent) {
        currentStreamingElement.remove();
      } else if (hasContent) {
        const finalHtml = buildInterleavedContent([]);
        if (content) content.innerHTML = finalHtml || '<span style="opacity:0.5;font-style:italic">Stopped</span>';
      }
    }
    isLoading = false;
    const sendBtn = $("send-btn");
    const stopBtn = $("stop-btn");
    if (sendBtn) sendBtn.classList.remove("hidden");
    if (stopBtn) stopBtn.classList.remove("visible");
    currentStreamingElement = null;
    resetStreamingBlocks();
    $("input")?.focus();
  }
  async function init() {
    const savedModelBtn = document.querySelector(`.model-option[data-model="${selectedModel}"]`);
    if (savedModelBtn) {
      document.querySelectorAll(".model-option").forEach((b) => b.classList.remove("active"));
      savedModelBtn.classList.add("active");
    }
    if (await window.claude.getAuthStatus()) {
      showHome();
      loadConversationsList();
    } else {
      showLogin();
    }
    window.claude.onMessageThinking((d) => {
      if (currentStreamingElement && d.conversationId === conversationId) {
        hideEmptyState();
        streamingBlocks.thinkingBlocks.set(d.blockIndex, {
          text: d.thinkingText || "",
          isActive: d.isThinking
        });
        updateStreamingContent();
      }
    });
    window.claude.onMessageThinkingStream((d) => {
      if (currentStreamingElement && d.conversationId === conversationId) {
        const block = streamingBlocks.thinkingBlocks.get(d.blockIndex) || { isActive: true, text: "" };
        block.text = d.thinking;
        if (d.summary) block.summary = d.summary;
        streamingBlocks.thinkingBlocks.set(d.blockIndex, block);
        updateStreamingContent();
      }
    });
    window.claude.onMessageToolUse((d) => {
      if (currentStreamingElement && d.conversationId === conversationId) {
        hideEmptyState();
        streamingBlocks.toolBlocks.set(d.blockIndex, {
          name: d.toolName,
          message: d.message,
          input: d.input,
          isRunning: d.isRunning
        });
        updateStreamingContent();
        scrollToBottom();
      }
    });
    window.claude.onMessageToolResult((d) => {
      if (currentStreamingElement && d.conversationId === conversationId) {
        streamingBlocks.toolBlocks.forEach((block) => {
          if (block.name === d.toolName && block.isRunning) {
            block.result = d.result;
            block.isError = d.isError;
            block.isRunning = false;
          }
        });
        updateStreamingContent();
        scrollToBottom();
      }
    });
    window.claude.onMessageStream((d) => {
      if (currentStreamingElement && d.conversationId === conversationId) {
        hideEmptyState();
        streamingBlocks.textContent = d.fullText;
        if (d.blockIndex !== void 0) {
          streamingBlocks.textBlocks.set(d.blockIndex, { text: d.fullText });
        }
        updateStreamingContent();
        scrollToBottom();
      }
    });
    window.claude.onMessageComplete((d) => {
      if (currentStreamingElement && d.conversationId === conversationId) {
        const finalHtml = buildInterleavedContent(d.steps || []);
        const content = currentStreamingElement.querySelector(".message-content");
        if (content) content.innerHTML = finalHtml;
        parentMessageUuid = d.messageUuid;
        currentStreamingElement = null;
        resetStreamingBlocks();
        isLoading = false;
        const sendBtn = $("send-btn");
        const stopBtn = $("stop-btn");
        if (sendBtn) sendBtn.classList.remove("hidden");
        if (stopBtn) stopBtn.classList.remove("visible");
        $("input")?.focus();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      toggleSidebar();
    }
  });
  document.addEventListener("click", (e) => {
    if (openDropdownId && !e.target.closest(".conv-item")) {
      const dropdown = document.getElementById(`conv-dropdown-${openDropdownId}`);
      if (dropdown) dropdown.classList.remove("open");
      openDropdownId = null;
    }
  });
  var sidebarTab = $("sidebar-tab");
  var sidebarTabIndicator = $("sidebar-tab-indicator");
  if (sidebarTab && sidebarTabIndicator) {
    sidebarTab.addEventListener("mousemove", (e) => {
      const rect = sidebarTab.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      sidebarTabIndicator.style.top = relativeY + "px";
    });
  }
  init();
  setupSidebarHover();
  window.login = login;
  window.logout = logout;
  window.sendFromHome = sendFromHome;
  window.sendMessage = sendMessage;
  window.newChat = newChat;
  window.toggleSidebar = toggleSidebar;
  window.closeSidebar = closeSidebar;
  window.selectModel = selectModel;
  window.handleKeydown = handleKeydown;
  window.handleHomeKeydown = handleHomeKeydown;
  window.autoResize = autoResize;
  window.autoResizeHome = autoResizeHome;
  window.stopGenerating = stopGenerating;
  window.loadConversation = loadConversation;
  window.deleteConversation = deleteConversation;
  window.toggleConvMenu = toggleConvMenu;
  window.starConversation = starConversation;
  window.startRenameConversation = startRenameConversation;
  window.handleRenameKeydown = handleRenameKeydown;
  window.finishRename = finishRename;
  window.cancelEditMessage = cancelEditMessage;
  window.submitEditMessage = submitEditMessage;
  window.startEditMessage = startEditMessage;
})();

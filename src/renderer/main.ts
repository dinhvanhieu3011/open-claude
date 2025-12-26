// Renderer main script

declare global {
  interface Window {
    claude: {
      getAuthStatus: () => Promise<boolean>;
      login: () => Promise<{ success: boolean; error?: string }>;
      logout: () => Promise<void>;
      createConversation: (model?: string) => Promise<{ conversationId: string; parentMessageUuid: string; uuid?: string }>;
      getConversations: () => Promise<Conversation[]>;
      loadConversation: (convId: string) => Promise<ConversationData>;
      deleteConversation: (convId: string) => Promise<void>;
      renameConversation: (convId: string, name: string) => Promise<void>;
      starConversation: (convId: string, isStarred: boolean) => Promise<void>;
      exportConversationMarkdown: (conversationData: { title: string; messages: Array<{ role: string; content: string; timestamp?: string }> }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
      sendMessage: (convId: string, message: string, parentUuid: string, attachments?: AttachmentPayload[]) => Promise<void>;
      stopResponse: (convId: string) => Promise<void>;
      generateTitle: (convId: string, messageContent: string) => Promise<void>;
      uploadAttachments: (files: Array<{ name: string; size: number; type: string; data: ArrayBuffer | Uint8Array | number[] }>) => Promise<UploadedAttachmentPayload[]>;
      transcribeAudio: (audioData: ArrayBuffer, fileName?: string) => Promise<{ text: string }>;
      audioDuckingStart: () => Promise<void>;
      audioDuckingStop: () => Promise<void>;
      warmBearerToken: () => Promise<void>;
      openSettings: () => Promise<void>;
      getSettings: () => Promise<{ spotlightKeybind?: string; spotlightPersistHistory?: boolean; dictionary?: Record<string, string>; llmCorrectionEnabled?: boolean; llmCorrectionPrompt?: string }>;
      saveSettings: (settings: { spotlightKeybind?: string; spotlightPersistHistory?: boolean; dictionary?: Record<string, string>; llmCorrectionEnabled?: boolean; llmCorrectionPrompt?: string }) => Promise<{ spotlightKeybind?: string; spotlightPersistHistory?: boolean; dictionary?: Record<string, string>; llmCorrectionEnabled?: boolean; llmCorrectionPrompt?: string }>;
      onMessageThinking: (callback: (data: ThinkingData) => void) => void;
      onMessageThinkingStream: (callback: (data: ThinkingStreamData) => void) => void;
      onMessageToolUse: (callback: (data: ToolUseData) => void) => void;
      onMessageToolResult: (callback: (data: ToolResultData) => void) => void;
      onMessageStream: (callback: (data: StreamData) => void) => void;
      onMessageComplete: (callback: (data: CompleteData) => void) => void;
      receive: (channel: string, callback: (...args: any[]) => void) => void;
    };
  }
}

interface Conversation {
  uuid: string;
  name?: string;
  summary?: string;
  is_starred?: boolean;
  updated_at: string;
}

interface ConversationData {
  name?: string;
  chat_messages?: Message[];
}

interface FileAsset {
  url: string;
  file_variant?: string;
  primary_color?: string;
  image_width?: number;
  image_height?: number;
}

interface MessageFile {
  file_kind: string;
  file_uuid: string;
  file_name: string;
  created_at?: string;
  thumbnail_url?: string;
  preview_url?: string;
  thumbnail_asset?: FileAsset;
  preview_asset?: FileAsset;
}

interface Message {
  uuid?: string;
  sender: string;
  content?: ContentBlock[];
  text?: string;
  created_at?: string;
  files?: MessageFile[];
  files_v2?: MessageFile[];
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  summaries?: { summary: string }[];
  name?: string;
  message?: string;
  display_content?: { text?: string };
  input?: unknown;
  content?: unknown[];
  is_error?: boolean;
  citations?: Citation[];
}

interface Citation {
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

interface AttachmentPayload {
  document_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  file_url?: string;
  extracted_content?: string;
}

interface UploadedAttachmentPayload extends AttachmentPayload { }

interface UploadedAttachment extends AttachmentPayload {
  id: string;
  previewUrl?: string;
}

interface ThinkingData {
  conversationId: string;
  blockIndex: number;
  isThinking: boolean;
  thinkingText?: string;
}

interface ThinkingStreamData {
  conversationId: string;
  blockIndex: number;
  thinking: string;
  summary?: string;
}

interface ToolUseData {
  conversationId: string;
  blockIndex: number;
  toolName: string;
  message?: string;
  input?: unknown;
  isRunning: boolean;
}

interface ToolResultData {
  conversationId: string;
  blockIndex: number;
  toolName: string;
  result: unknown;
  isError: boolean;
}

interface StreamData {
  conversationId: string;
  blockIndex?: number;
  fullText: string;
}

interface CompleteData {
  conversationId: string;
  fullText: string;
  steps: Step[];
  messageUuid: string;
}

interface Step {
  type: string;
  text?: string;
  thinkingText?: string;
  thinkingSummary?: string;
  summary?: string;
  toolName?: string;
  toolMessage?: string;
  message?: string;
  toolResult?: unknown;
  toolInput?: unknown;
  isError?: boolean;
  isActive?: boolean;
  index?: number;
  citations?: Citation[];
}

interface StreamingBlock {
  text?: string;
  summary?: string;
  isActive?: boolean;
  name?: string;
  message?: string;
  input?: unknown;
  result?: unknown;
  isRunning?: boolean;
  isError?: boolean;
}


let conversationId: string | null = null;
let parentMessageUuid: string | null = null;
let isLoading = false;
let currentStreamingElement: HTMLElement | null = null;
let streamingMessageUuid: string | null = null;
let conversations: Conversation[] = [];
let selectedModel = 'claude-opus-4-5-20251101';
let openDropdownId: string | null = null;
let pendingAttachments: UploadedAttachment[] = [];
let uploadingAttachments = false;
let attachmentError = '';
let currentConversationTitle = '';
let currentConversationMessages: Array<{ role: string; content: string; timestamp?: string }> = [];

const modelDisplayNames: Record<string, string> = {
  'claude-opus-4-5-20251101': 'Opus 4.5',
  'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
  'claude-haiku-4-5-20251001': 'Haiku 4.5'
};

const streamingBlocks = {
  thinkingBlocks: new Map<number, StreamingBlock>(),
  toolBlocks: new Map<number, StreamingBlock>(),
  textBlocks: new Map<number, StreamingBlock>(),
  textContent: ''
};

function resetStreamingBlocks() {
  streamingBlocks.thinkingBlocks.clear();
  streamingBlocks.toolBlocks.clear();
  streamingBlocks.textBlocks.clear();
  streamingBlocks.textContent = '';
}

const $ = (id: string) => document.getElementById(id);
const $$ = (selector: string) => document.querySelectorAll(selector);

function escapeHtml(text: string): string {
  return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function removeAttachment(id: string) {
  pendingAttachments = pendingAttachments.filter(a => a.id !== id);
  renderAttachmentList();
}

const imageIconSvg = `<svg class="attachment-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
const fileIconSvg = `<svg class="attachment-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

function renderAttachmentList() {
  const containers = [
    { list: $('attachment-list'), status: $('attachment-status') },
    { list: $('home-attachment-list'), status: $('home-attachment-status') }
  ];

  const pills = pendingAttachments.map(a => {
    const icon = a.file_type?.startsWith('image/') ? imageIconSvg : fileIconSvg;
    return `
      <div class="attachment-pill" data-id="${a.id}">
        <div class="attachment-icon">${icon}</div>
        <div class="attachment-meta">
          <div class="attachment-name">${escapeHtml(a.file_name)}</div>
          <div class="attachment-size">${formatFileSize(a.file_size)}</div>
        </div>
        <button class="attachment-remove" data-id="${a.id}" title="Remove">✕</button>
      </div>
    `;
  }).join('');

  containers.forEach(({ list, status }) => {
    if (!list) return;
    const hasContent = pendingAttachments.length > 0 || uploadingAttachments || !!attachmentError;
    list.parentElement?.classList.toggle('visible', hasContent);
    list.innerHTML = pills;

    list.querySelectorAll('.attachment-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id) removeAttachment(id);
      });
    });

    if (status) {
      status.textContent = uploadingAttachments ? 'Uploading attachments…' : attachmentError;
      status.style.display = (uploadingAttachments || attachmentError) ? 'block' : 'none';
      status.classList.toggle('error', !!attachmentError);
    }
  });
}

function clearAttachments() {
  pendingAttachments = [];
  attachmentError = '';
  uploadingAttachments = false;
  renderAttachmentList();
}

function getAttachmentPayloads(): AttachmentPayload[] {
  return pendingAttachments.map(a => ({
    document_id: a.document_id,
    file_name: a.file_name,
    file_size: a.file_size,
    file_type: a.file_type,
    file_url: a.file_url,
    extracted_content: a.extracted_content
  }));
}

async function handleFileSelection(fileList: FileList | null) {
  if (!fileList || fileList.length === 0) return;

  attachmentError = '';
  uploadingAttachments = true;
  renderAttachmentList();

  try {
    const uploadPayload = await Promise.all(Array.from(fileList).map(async (file) => ({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      data: await file.arrayBuffer()
    })));

    const results = await window.claude.uploadAttachments(uploadPayload);
    const normalized = results.map(res => ({
      id: crypto.randomUUID(),
      document_id: res.document_id,
      file_name: res.file_name,
      file_size: res.file_size,
      file_type: res.file_type,
      file_url: res.file_url,
      extracted_content: res.extracted_content
    }));

    pendingAttachments = [...pendingAttachments, ...normalized];
  } catch (e: any) {
    attachmentError = e?.message || 'Failed to upload attachments';
  } finally {
    uploadingAttachments = false;
    renderAttachmentList();
  }
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function autoResizeHome(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

function scrollToBottom() {
  const m = $('messages');
  if (m) m.scrollTop = m.scrollHeight;
}

function hideEmptyState() {
  const e = $('empty-state');
  if (e) e.style.display = 'none';
}

function showLogin() {
  const login = $('login');
  const home = $('home');
  const chat = $('chat');
  const sidebarTab = $('sidebar-tab');

  if (login) login.style.display = 'flex';
  if (home) home.classList.remove('active');
  if (chat) chat.classList.remove('active');
  if (sidebarTab) sidebarTab.classList.add('hidden');
  closeSidebar();
}

function showHome() {
  const login = $('login');
  const home = $('home');
  const chat = $('chat');
  const sidebarTab = $('sidebar-tab');
  const homeInput = $('home-input') as HTMLTextAreaElement;

  if (login) login.style.display = 'none';
  if (home) home.classList.add('active');
  if (chat) chat.classList.remove('active');
  if (sidebarTab) sidebarTab.classList.remove('hidden');
  if (homeInput) setTimeout(() => homeInput.focus(), 100);
}

function showChat() {
  const login = $('login');
  const home = $('home');
  const chat = $('chat');
  const sidebarTab = $('sidebar-tab');
  const modelBadge = document.querySelector('.model-badge');

  if (login) login.style.display = 'none';
  if (home) home.classList.remove('active');
  if (chat) chat.classList.add('active');
  if (sidebarTab) sidebarTab.classList.remove('hidden');
  if (modelBadge) modelBadge.textContent = modelDisplayNames[selectedModel] || 'Opus 4.5';
}

// Sidebar functions
function toggleSidebar() {
  const sidebar = $('sidebar');
  const overlay = $('sidebar-overlay');
  const sidebarTab = $('sidebar-tab');

  if (!sidebar || !overlay || !sidebarTab) return;

  const isOpening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');

  if (isOpening) {
    sidebarTab.classList.add('hidden');
    loadConversationsList();
  } else {
    sidebarTab.classList.remove('hidden');
  }
}

function closeSidebar() {
  const sidebar = $('sidebar');
  const overlay = $('sidebar-overlay');
  const sidebarTab = $('sidebar-tab');

  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  if (sidebarTab) sidebarTab.classList.remove('hidden');
}

// Model selection
function selectModel(btn: HTMLElement) {
  $$('.model-option').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedModel = btn.getAttribute('data-model') || selectedModel;
}

// Conversations list
async function loadConversationsList() {
  const content = $('sidebar-content');
  if (!content) return;

  try {
    conversations = await window.claude.getConversations();
    renderConversationsList();
  } catch (e) {
    content.innerHTML = '<div class="conv-loading">Failed to load</div>';
  }
}

function renderConversationItem(c: Conversation): string {
  return `
    <div class="conv-item ${c.uuid === conversationId ? 'active' : ''}" data-uuid="${c.uuid}" data-starred="${c.is_starred || false}">
      <div class="conv-item-row">
        <div class="conv-item-info" data-action="load" data-uuid="${c.uuid}">
          <div class="conv-item-title">${escapeHtml(c.name || c.summary || 'New conversation')}</div>
          <div class="conv-item-date">${formatDate(c.updated_at)}</div>
        </div>
        <button class="conv-menu-btn" data-action="menu" data-uuid="${c.uuid}">⋯</button>
      </div>
      <div class="conv-dropdown" id="conv-dropdown-${c.uuid}">
        <div class="conv-dropdown-item" data-action="star" data-uuid="${c.uuid}" data-starred="${!c.is_starred}">
          <span class="conv-dropdown-icon">${c.is_starred ? '☆' : '★'}</span>
          <span>${c.is_starred ? 'Unstar' : 'Star'}</span>
        </div>
        <div class="conv-dropdown-item" data-action="rename" data-uuid="${c.uuid}">
          <span class="conv-dropdown-icon">✎</span>
          <span>Rename</span>
        </div>
        <div class="conv-dropdown-item delete" data-action="delete" data-uuid="${c.uuid}">
          <span class="conv-dropdown-icon">✕</span>
          <span>Delete</span>
        </div>
      </div>
    </div>
  `;
}

function renderConversationsList() {
  const content = $('sidebar-content');
  if (!content) return;

  if (!conversations || conversations.length === 0) {
    content.innerHTML = '<div class="conv-loading">No conversations yet</div>';
    return;
  }

  const starred = conversations.filter(c => c.is_starred);
  const unstarred = conversations.filter(c => !c.is_starred);

  let html = '';

  if (starred.length > 0) {
    html += '<div class="conv-section-header">Favorites</div>';
    html += starred.map(renderConversationItem).join('');
  }

  if (unstarred.length > 0) {
    if (starred.length > 0) {
      html += '<div class="conv-section-header">Recent</div>';
    }
    html += unstarred.map(renderConversationItem).join('');
  }

  content.innerHTML = html;

  // Add event listeners
  content.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleConversationAction);
  });
}

function handleConversationAction(e: Event) {
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  const action = target.dataset.action;
  const uuid = target.dataset.uuid;

  if (!uuid) return;

  switch (action) {
    case 'load':
      loadConversation(uuid);
      break;
    case 'menu':
      toggleConvMenu(uuid);
      break;
    case 'star':
      starConversation(uuid, target.dataset.starred === 'true');
      break;
    case 'rename':
      startRenameConversation(uuid);
      break;
    case 'delete':
      deleteConversation(uuid);
      break;
  }
}

function toggleConvMenu(uuid: string) {
  const dropdown = $(`conv-dropdown-${uuid}`);
  if (!dropdown) return;

  if (openDropdownId && openDropdownId !== uuid) {
    const oldDropdown = $(`conv-dropdown-${openDropdownId}`);
    if (oldDropdown) oldDropdown.classList.remove('open');
  }

  dropdown.classList.toggle('open');
  openDropdownId = dropdown.classList.contains('open') ? uuid : null;
}

async function deleteConversation(uuid: string) {
  const deletedConv = conversations.find(c => c.uuid === uuid);
  conversations = conversations.filter(c => c.uuid !== uuid);

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
  } catch (e) {
    console.error('Failed to delete conversation:', e);
    if (deletedConv) {
      conversations.push(deletedConv);
      conversations.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      renderConversationsList();
    }
  }
}

async function starConversation(uuid: string, isStarred: boolean) {
  const conv = conversations.find(c => c.uuid === uuid);
  const previousState = conv?.is_starred;
  if (conv) conv.is_starred = isStarred;
  renderConversationsList();

  try {
    await window.claude.starConversation(uuid, isStarred);
  } catch (e) {
    console.error('Failed to star conversation:', e);
    if (conv) conv.is_starred = previousState;
    renderConversationsList();
  }
}

function startRenameConversation(uuid: string) {
  const convItem = document.querySelector(`.conv-item[data-uuid="${uuid}"]`);
  if (!convItem) return;

  const dropdown = $(`conv-dropdown-${uuid}`);
  if (dropdown) dropdown.classList.remove('open');
  openDropdownId = null;

  const conv = conversations.find(c => c.uuid === uuid);
  const currentName = conv?.name || conv?.summary || '';

  const titleEl = convItem.querySelector('.conv-item-title');
  if (!titleEl) return;

  titleEl.innerHTML = `<input type="text" class="conv-rename-input" value="${escapeHtml(currentName)}" data-uuid="${uuid}">`;
  const input = titleEl.querySelector('input') as HTMLInputElement;
  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishRename(uuid, input.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      renderConversationsList();
    }
  });

  input.addEventListener('blur', () => {
    finishRename(uuid, input.value);
  });
}

async function finishRename(uuid: string, newName: string) {
  const trimmedName = newName.trim();
  if (!trimmedName) {
    renderConversationsList();
    return;
  }

  const conv = conversations.find(c => c.uuid === uuid);
  const previousName = conv?.name;
  if (conv) conv.name = trimmedName;
  renderConversationsList();

  try {
    await window.claude.renameConversation(uuid, trimmedName);
  } catch (e) {
    console.error('Failed to rename conversation:', e);
    if (conv) conv.name = previousName;
    renderConversationsList();
  }
}

// SVG icons
const pencilSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const closeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const chevronSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M14.128 7.16482C14.3126 6.95983 14.6298 6.94336 14.835 7.12771C15.0402 7.31242 15.0567 7.62952 14.8721 7.83477L10.372 12.835L10.2939 12.9053C10.2093 12.9667 10.1063 13 9.99995 13C9.85833 12.9999 9.72264 12.9402 9.62788 12.835L5.12778 7.83477L5.0682 7.75273C4.95072 7.55225 4.98544 7.28926 5.16489 7.12771C5.34445 6.96617 5.60969 6.95939 5.79674 7.09744L5.87193 7.16482L9.99995 11.7519L14.128 7.16482Z"/></svg>`;

const FALLBACK_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjciIGZpbGw9IiNkZGQiLz48L3N2Zz4=';

const toolLabels: Record<string, string> = {
  'web_search': 'Searching the web',
  'web_fetch': 'Fetching page',
  'bash_tool': 'Running command',
  'create_file': 'Creating file',
  'str_replace': 'Editing file',
  'view': 'Reading file',
  'conversation_search': 'Searching past chats',
  'recent_chats': 'Getting recent chats'
};

// Message functions
function addMessage(role: string, content: string, raw = false, storedParentUuid: string | null = null, extraClasses = '', attachments: UploadedAttachment[] = []): HTMLElement {
  const el = document.createElement('div');
  el.className = 'message ' + role + (extraClasses ? ' ' + extraClasses : '');

  const c = document.createElement('div');
  c.className = 'message-content';
  c.innerHTML = role === 'user' ? escapeHtml(content) : (raw ? content : escapeHtml(content));
  el.appendChild(c);

  if (role === 'user' && attachments.length > 0) {
    const attachmentsEl = document.createElement('div');
    attachmentsEl.className = 'message-attachments';
    attachmentsEl.innerHTML = attachments.map(a => {
      const icon = a.file_type?.startsWith('image/') ? imageIconSvg : fileIconSvg;
      return `
        <div class="message-attachment-row">
          <div class="message-attachment-icon">${icon}</div>
          <div class="message-attachment-info">
            <div class="message-attachment-name">${escapeHtml(a.file_name)}</div>
            ${a.file_size ? `<div class="message-attachment-size">${formatFileSize(a.file_size)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    el.appendChild(attachmentsEl);
  }

  if (role === 'user') {
    el.dataset.parentUuid = storedParentUuid || parentMessageUuid || conversationId || '';
    el.dataset.originalText = content;

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.innerHTML = pencilSvg;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditMessage(el);
    });
    el.appendChild(editBtn);
  }

  const messages = $('messages');
  if (messages) messages.appendChild(el);
  scrollToBottom();
  return el;
}

function addMessageRaw(role: string, htmlContent: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'message ' + role;

  const c = document.createElement('div');
  c.className = 'message-content';
  c.innerHTML = htmlContent;
  el.appendChild(c);

  c.querySelectorAll('.step-item').forEach(stepEl => {
    stepEl.addEventListener('click', () => stepEl.classList.toggle('expanded'));
  });

  const messages = $('messages');
  if (messages) messages.appendChild(el);
  scrollToBottom();
  return el;
}

// Edit message functions
function startEditMessage(msgEl: HTMLElement) {
  if (isLoading) return;
  msgEl.classList.add('editing');

  const contentEl = msgEl.querySelector('.message-content');
  if (!contentEl) return;

  const originalText = msgEl.dataset.originalText || contentEl.textContent || '';

  contentEl.innerHTML = `
    <div class="message-edit-container">
      <textarea class="message-edit-textarea">${escapeHtml(originalText)}</textarea>
      <div class="message-edit-actions">
        <button class="message-edit-cancel">${closeSvg}</button>
        <button class="message-edit-submit">${checkSvg}</button>
      </div>
    </div>
  `;

  const textarea = contentEl.querySelector('.message-edit-textarea') as HTMLTextAreaElement;
  const cancelBtn = contentEl.querySelector('.message-edit-cancel');
  const submitBtn = contentEl.querySelector('.message-edit-submit');

  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitEditMessage(msgEl, textarea.value);
    } else if (e.key === 'Escape') {
      cancelEditMessage(msgEl);
    }
  });

  cancelBtn?.addEventListener('click', () => cancelEditMessage(msgEl));
  submitBtn?.addEventListener('click', () => submitEditMessage(msgEl, textarea.value));
}

function cancelEditMessage(msgEl: HTMLElement) {
  msgEl.classList.remove('editing');
  const contentEl = msgEl.querySelector('.message-content');
  const originalText = msgEl.dataset.originalText || '';
  if (contentEl) contentEl.innerHTML = escapeHtml(originalText);
}

async function submitEditMessage(msgEl: HTMLElement, newText: string) {
  if (isLoading) return;
  const trimmedText = newText.trim();

  if (!trimmedText) {
    cancelEditMessage(msgEl);
    return;
  }

  const branchParentUuid = msgEl.dataset.parentUuid;

  // Remove all messages after this one
  let nextEl = msgEl.nextElementSibling;
  while (nextEl) {
    const toRemove = nextEl;
    nextEl = nextEl.nextElementSibling;
    toRemove.remove();
  }

  msgEl.classList.remove('editing');
  msgEl.dataset.originalText = trimmedText;

  const contentEl = msgEl.querySelector('.message-content');
  if (contentEl) contentEl.innerHTML = escapeHtml(trimmedText);

  parentMessageUuid = branchParentUuid || null;

  isLoading = true;
  const sendBtn = $('send-btn');
  if (sendBtn) (sendBtn as HTMLButtonElement).disabled = true;

  currentStreamingElement = addMessage('assistant', '<div class="loading-dots"><span></span><span></span><span></span></div>', true);

  try {
    await window.claude.sendMessage(conversationId!, trimmedText, parentMessageUuid!);
  } catch (e: any) {
    if (currentStreamingElement) {
      const content = currentStreamingElement.querySelector('.message-content');
      if (content) content.innerHTML = '<span style="color:#FF453A">Error: ' + e.message + '</span>';
    }
    currentStreamingElement = null;
    isLoading = false;
    if (sendBtn) (sendBtn as HTMLButtonElement).disabled = false;
  }
}

// Tool result rendering
function buildToolResultContent(toolName: string, result: any, isError: boolean): string {
  if (!result) return '';

  if (result.type === 'rich_link' && result.link) {
    const link = result.link;
    const title = link.title || link.url || 'Fetched page';
    const url = link.url || '';
    let icon = link.icon_url || '';
    if (!icon && url) {
      try {
        const domain = new URL(url).hostname;
        icon = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`;
      } catch { }
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

  if (result.type === 'rich_content' && result.content) {
    let html = '<div class="chat-links">';
    for (const item of result.content.slice(0, 5)) {
      const title = item.title || 'Chat';
      const url = item.url || '';
      html += `
        <a class="chat-link-item" href="${escapeHtml(url)}" target="_blank">
          <span class="chat-link-icon">💬</span>
          <span class="chat-link-title">${escapeHtml(title)}</span>
        </a>
      `;
    }
    html += '</div>';
    return html;
  }

  if (result.type === 'json_block') {
    const code = result.code || '';
    const filename = result.filename || '';
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const returncode = result.returncode;

    if (stdout || stderr || returncode !== undefined) {
      const output = stdout || stderr || '';
      const hasError = isError || returncode !== 0;
      if (output) {
        return `<div class="tool-output ${hasError ? 'error' : ''}">${escapeHtml(output.substring(0, 500))}${output.length > 500 ? '...' : ''}</div>`;
      }
      return hasError ? '<div class="file-op error"><span class="file-op-icon">✗</span><span class="file-op-text">Command failed</span></div>' : '';
    }

    if (code && filename) {
      const shortFilename = filename.split('/').pop();
      const preview = code.substring(0, 200);
      return `
        <div class="file-preview">
          <div class="file-preview-header">${escapeHtml(shortFilename)}</div>
          <div class="tool-output">${escapeHtml(preview)}${code.length > 200 ? '...' : ''}</div>
        </div>
      `;
    }

    if (code) {
      return `<div class="tool-output">${escapeHtml(code.substring(0, 300))}${code.length > 300 ? '...' : ''}</div>`;
    }
  }

  if (result.type === 'text') {
    const text = result.text || '';
    if (text.toLowerCase().includes('success')) {
      return `<div class="file-op success"><span class="file-op-icon">✓</span><span class="file-op-text">${escapeHtml(text)}</span></div>`;
    }
    return `<div class="tool-output ${isError ? 'error' : ''}">${escapeHtml(text)}</div>`;
  }

  if (Array.isArray(result)) {
    let html = '<div class="search-results">';
    for (const item of result.slice(0, 5)) {
      const siteDomain = item.metadata?.site_domain || '';
      const siteName = item.metadata?.site_name || siteDomain || '';
      let favicon = item.metadata?.favicon_url || '';
      if (!favicon && siteDomain) {
        favicon = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(siteDomain)}`;
      }
      if (!favicon) favicon = FALLBACK_FAVICON;
      html += `
        <a class="search-result-item" href="${escapeHtml(item.url)}" target="_blank">
          <img class="search-result-favicon" src="${escapeHtml(favicon)}" onerror="this.onerror=null;this.src='${FALLBACK_FAVICON}'">
          <div class="search-result-info">
            <div class="search-result-title">${escapeHtml(item.title)}</div>
            <div class="search-result-site">${escapeHtml(siteName)}</div>
          </div>
        </a>
      `;
    }
    html += '</div>';
    return html;
  }

  if (result.link) {
    const link = result.link;
    const title = link.title || link.url || 'Fetched page';
    const url = link.url || '';
    let icon = link.icon_url || '';
    if (!icon && url) {
      try {
        const domain = new URL(url).hostname;
        icon = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`;
      } catch { }
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

  if (result.rich_content) {
    let html = '<div class="chat-links">';
    const items = Array.isArray(result.rich_content) ? result.rich_content : [result.rich_content];
    for (const item of items.slice(0, 5)) {
      const title = item.title || item.text || 'Chat';
      const url = item.url || item.href || '';
      html += `
        <a class="chat-link-item" href="${escapeHtml(url)}" target="_blank">
          <span class="chat-link-icon">💬</span>
          <span class="chat-link-title">${escapeHtml(title)}</span>
        </a>
      `;
    }
    html += '</div>';
    return html;
  }

  if (result.text) {
    return `<div class="tool-output ${isError ? 'error' : ''}">${escapeHtml(result.text)}</div>`;
  }

  if (typeof result === 'string') {
    return `<div class="tool-output ${isError ? 'error' : ''}">${escapeHtml(result)}</div>`;
  }

  return '';
}

// Step building
function buildStepItem(step: Step, isActive: boolean): string {
  if (step.type === 'thinking') {
    const summary = step.thinkingSummary || step.summary;
    const label = summary ? escapeHtml(summary) : 'Thinking';
    const idx = step.index !== undefined ? step.index : '';
    return `
      <div class="step-item thinking" data-index="${idx}">
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
            <div class="step-text">${escapeHtml(step.thinkingText || step.text || '')}</div>
          </div>
        </div>
      </div>
    `;
  } else if (step.type === 'tool') {
    const message = step.toolMessage || step.message;
    const label = message || toolLabels[step.toolName || ''] || `Using ${step.toolName}`;
    const resultHtml = buildToolResultContent(step.toolName || '', step.toolResult, step.isError || false);
    const idx = step.index !== undefined ? step.index : '';

    return `
      <div class="step-item tool ${step.toolResult ? '' : 'active'}" data-index="${idx}">
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
  return '';
}

function buildInterleavedContent(steps: Step[]): string {
  if (!steps || steps.length === 0) return '';

  let html = '';
  let currentTimelineSteps: Step[] = [];

  for (const step of steps) {
    if (step.type === 'text') {
      if (currentTimelineSteps.length > 0) {
        html += '<div class="steps-timeline">';
        for (const ts of currentTimelineSteps) {
          html += buildStepItem(ts, false);
        }
        html += '</div>';
        currentTimelineSteps = [];
      }
      html += escapeHtml(step.text || '');
    } else {
      currentTimelineSteps.push(step);
    }
  }

  if (currentTimelineSteps.length > 0) {
    html += '<div class="steps-timeline">';
    for (const ts of currentTimelineSteps) {
      html += buildStepItem(ts, false);
    }
    html += '</div>';
  }

  return html;
}

function buildStreamingContent(): string {
  const allBlocks: Step[] = [];

  streamingBlocks.thinkingBlocks.forEach((block, idx) => {
    allBlocks.push({
      type: 'thinking',
      index: idx,
      thinkingText: block.text,
      thinkingSummary: block.summary,
      isActive: block.isActive
    });
  });

  streamingBlocks.toolBlocks.forEach((block, idx) => {
    allBlocks.push({
      type: 'tool',
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
      type: 'text',
      index: idx,
      text: block.text
    });
  });

  if (allBlocks.length === 0) return '';

  allBlocks.sort((a, b) => (a.index || 0) - (b.index || 0));

  let html = '';
  let currentTimelineSteps: Step[] = [];

  for (const step of allBlocks) {
    if (step.type === 'text') {
      if (currentTimelineSteps.length > 0) {
        html += '<div class="steps-timeline">';
        for (const ts of currentTimelineSteps) {
          html += buildStepItem(ts, ts.isActive || false);
        }
        html += '</div>';
        currentTimelineSteps = [];
      }
      html += escapeHtml(step.text || '');
    } else {
      currentTimelineSteps.push(step);
    }
  }

  if (currentTimelineSteps.length > 0) {
    html += '<div class="steps-timeline">';
    for (const ts of currentTimelineSteps) {
      html += buildStepItem(ts, ts.isActive || false);
    }
    html += '</div>';
  }

  return html;
}

function updateStreamingContent() {
  if (!currentStreamingElement) return;
  const contentEl = currentStreamingElement.querySelector('.message-content');
  if (!contentEl) return;

  const expandedIndices = new Set<string>();
  contentEl.querySelectorAll('.step-item.expanded').forEach(el => {
    const idx = el.getAttribute('data-index');
    if (idx) expandedIndices.add(idx);
  });

  let html = buildStreamingContent();

  if (!html) {
    html = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  }

  contentEl.innerHTML = html;

  // Add click listeners to step items
  contentEl.querySelectorAll('.step-item').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('expanded'));
  });

  expandedIndices.forEach(idx => {
    const el = contentEl.querySelector(`.step-item[data-index="${idx}"]`);
    if (el) el.classList.add('expanded');
  });
}

// Parse stored message content
function parseStoredMessageContent(content: ContentBlock[]): Step[] {
  const steps: Step[] = [];
  let currentToolUse: Step | null = null;

  for (const block of content) {
    if (block.type === 'thinking') {
      const lastSummary = block.summaries && block.summaries.length > 0
        ? block.summaries[block.summaries.length - 1].summary
        : undefined;
      steps.push({
        type: 'thinking',
        thinkingText: block.thinking,
        thinkingSummary: lastSummary
      });
    } else if (block.type === 'tool_use') {
      currentToolUse = {
        type: 'tool',
        toolName: block.name,
        toolMessage: block.message || block.display_content?.text,
        toolInput: block.input
      };
    } else if (block.type === 'tool_result') {
      if (currentToolUse && currentToolUse.toolName === block.name) {
        let resultData: any = null;
        if (block.display_content) {
          resultData = block.display_content;
        } else if (block.content && Array.isArray(block.content)) {
          if (block.name === 'web_search') {
            resultData = (block.content as any[]).filter(c => c.type === 'knowledge').map(c => ({
              title: c.title,
              url: c.url,
              metadata: c.metadata
            }));
          } else {
            const textContent = (block.content as any[]).find(c => c.type === 'text');
            if (textContent) {
              resultData = { type: 'text', text: textContent.text };
            }
          }
        }
        currentToolUse.toolResult = resultData;
        currentToolUse.isError = block.is_error;
        steps.push(currentToolUse);
        currentToolUse = null;
      }
    } else if (block.type === 'text') {
      steps.push({
        type: 'text',
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

// Load conversation
async function loadConversation(convId: string) {
  try {
    clearAttachments();
    const conv = await window.claude.loadConversation(convId);
    conversationId = convId;
    currentConversationTitle = conv.name || 'Conversation';
    currentConversationMessages = [];

    isLoading = false;
    const sendBtn = $('send-btn');
    const stopBtn = $('stop-btn');
    if (sendBtn) sendBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.remove('visible');

    showChat();

    const messagesEl = $('messages');
    if (messagesEl) messagesEl.innerHTML = '';

    if (conv.chat_messages && conv.chat_messages.length > 0) {
      let prevMsgUuid = convId;

      for (const msg of conv.chat_messages) {
        const role = msg.sender === 'human' ? 'user' : 'assistant';

        if (role === 'user') {
          let text = '';
          if (msg.content && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text') {
                text += block.text || '';
              }
            }
          } else if (msg.text) {
            text = msg.text;
          }

          const messageFiles = msg.files_v2 || msg.files || [];
          const attachments: UploadedAttachment[] = messageFiles.map(f => ({
            id: f.file_uuid,
            document_id: f.file_uuid,
            file_name: f.file_name,
            file_size: 0, // Size not available in loaded messages
            file_type: f.file_kind === 'image' ? 'image/png' : 'application/octet-stream',
            previewUrl: f.preview_url || f.thumbnail_url
          }));

          if (text || attachments.length > 0) {
            addMessage('user', text, false, prevMsgUuid, '', attachments);
            currentConversationMessages.push({ role: 'human', content: text, timestamp: msg.created_at });
          }
        } else {
          let assistantText = '';
          if (msg.content && Array.isArray(msg.content)) {
            const steps = parseStoredMessageContent(msg.content);
            if (steps.length > 0) {
              const html = buildInterleavedContent(steps);
              addMessageRaw('assistant', html);
              // Extract text content for export
              for (const step of steps) {
                if (step.type === 'text') {
                  assistantText += step.text || '';
                }
              }
            }
          } else if (msg.text) {
            addMessage('assistant', msg.text);
            assistantText = msg.text;
          }
          if (assistantText) {
            currentConversationMessages.push({ role: 'assistant', content: assistantText, timestamp: msg.created_at });
          }
        }

        if (msg.uuid) {
          prevMsgUuid = msg.uuid;
          parentMessageUuid = msg.uuid;
        }
      }
    } else {
      if (messagesEl) {
        messagesEl.innerHTML = '<div class="empty-state" id="empty-state"><div class="empty-state-icon">✦</div><p>What can I help with?</p><span class="hint">Claude is ready</span></div>';
      }
      parentMessageUuid = convId;
    }

    closeSidebar();
    renderConversationsList();
    scrollToBottom();
  } catch (e) {
    console.error('Failed to load conversation:', e);
  }
}

// Export conversation to Markdown
async function exportConversation() {
  if (!conversationId || currentConversationMessages.length === 0) {
    console.error('No conversation to export');
    return;
  }

  try {
    const result = await window.claude.exportConversationMarkdown({
      title: currentConversationTitle,
      messages: currentConversationMessages
    });

    if (result.success) {
      console.log('Conversation exported to:', result.filePath);
    } else if (!result.canceled) {
      console.error('Failed to export conversation');
    }
  } catch (e) {
    console.error('Failed to export conversation:', e);
  }
}

// Auth functions
async function login() {
  const loginError = $('login-error');
  if (loginError) loginError.textContent = '';

  const r = await window.claude.login();
  if (r.success) {
    showHome();
    // await startNewConversation(); // Don't create empty conversation on home screen
    loadConversationsList();
  } else {
    if (loginError) loginError.textContent = r.error || 'Failed';
  }
}

async function logout() {
  await window.claude.logout();
  conversationId = null;
  parentMessageUuid = null;
  conversations = [];
  clearAttachments();

  const messagesEl = $('messages');
  if (messagesEl) {
    messagesEl.innerHTML = '<div class="empty-state" id="empty-state"><div class="empty-state-icon">✦</div><p>What can I help with?</p><span class="hint">Claude is ready</span></div>';
  }
  showLogin();
}

async function startNewConversation() {
  try {
    const r = await window.claude.createConversation();
    conversationId = r.conversationId;
    parentMessageUuid = r.parentMessageUuid || r.uuid || crypto.randomUUID();
  } catch (e: any) {
    addMessage('assistant', 'Failed: ' + e.message);
  }
}

function newChat() {
  conversationId = null;
  parentMessageUuid = null;
  clearAttachments();
  const homeInput = $('home-input') as HTMLTextAreaElement;
  if (homeInput) homeInput.value = '';
  closeSidebar();
  showHome();
}

// Send message functions
async function sendFromHome() {
  const input = $('home-input') as HTMLTextAreaElement;
  const msg = input?.value.trim();
  if (!msg || isLoading) return;
  if (uploadingAttachments) {
    attachmentError = 'Please wait for attachments to finish uploading';
    renderAttachmentList();
    return;
  }

  const attachmentPayloads = getAttachmentPayloads();
  const userAttachmentCopies = [...pendingAttachments];

  isLoading = true;
  const homeSendBtn = $('home-send-btn') as HTMLButtonElement;
  if (homeSendBtn) homeSendBtn.disabled = true;

  try {
    const r = await window.claude.createConversation(selectedModel);
    conversationId = r.conversationId;
    parentMessageUuid = r.parentMessageUuid || r.uuid || crypto.randomUUID();

    const homeContainer = $('home');
    const chatContainer = $('chat');

    if (homeContainer) homeContainer.classList.add('transitioning');

    await new Promise(resolve => setTimeout(resolve, 350));

    const messagesEl = $('messages');
    if (messagesEl) messagesEl.innerHTML = '';
    if (chatContainer) chatContainer.classList.add('entering');

    if (homeContainer) homeContainer.classList.remove('active');
    if (chatContainer) chatContainer.classList.add('active');

    const modelBadge = document.querySelector('.model-badge');
    if (modelBadge) modelBadge.textContent = modelDisplayNames[selectedModel] || 'Opus 4.5';

    const sidebarTab = $('sidebar-tab');
    if (sidebarTab) sidebarTab.classList.remove('hidden');

    addMessage('user', msg, false, null, 'fly-in', userAttachmentCopies);

    await new Promise(resolve => setTimeout(resolve, 200));

    currentStreamingElement = addMessage('assistant', '<div class="loading-dots"><span></span><span></span><span></span></div>', true, null, 'fade-in');

    const sendBtn = $('send-btn');
    const stopBtn = $('stop-btn');
    if (sendBtn) sendBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.add('visible');

    setTimeout(() => {
      if (homeContainer) homeContainer.classList.remove('transitioning');
      if (chatContainer) chatContainer.classList.remove('entering');
    }, 600);

    await window.claude.sendMessage(conversationId, msg, parentMessageUuid!, attachmentPayloads);

    clearAttachments();

    window.claude.generateTitle(conversationId, msg).then(() => {
      loadConversationsList();
    }).catch(err => {
      console.warn('Failed to generate title:', err);
      loadConversationsList();
    });

    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
  } catch (e: any) {
    if (currentStreamingElement) {
      const content = currentStreamingElement.querySelector('.message-content');
      if (content) content.innerHTML = '<span style="color:#FF453A">Error: ' + e.message + '</span>';
    }
    currentStreamingElement = null;
    isLoading = false;
    if (homeSendBtn) homeSendBtn.disabled = false;

    const sendBtn = $('send-btn');
    const stopBtn = $('stop-btn');
    if (sendBtn) sendBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.remove('visible');
  }
}

async function sendMessage() {
  const input = $('input') as HTMLTextAreaElement;
  const msg = input?.value.trim();
  if (!msg || isLoading || !conversationId) return;
  if (uploadingAttachments) {
    attachmentError = 'Please wait for attachments to finish uploading';
    renderAttachmentList();
    return;
  }

  const attachmentPayloads = getAttachmentPayloads();
  const userAttachmentCopies = [...pendingAttachments];

  isLoading = true;
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  const sendBtn = $('send-btn');
  const stopBtn = $('stop-btn');
  if (sendBtn) sendBtn.classList.add('hidden');
  if (stopBtn) stopBtn.classList.add('visible');

  hideEmptyState();
  addMessage('user', msg, false, null, '', userAttachmentCopies);
  currentConversationMessages.push({ role: 'human', content: msg, timestamp: new Date().toISOString() });
  currentStreamingElement = addMessage('assistant', '<div class="loading-dots"><span></span><span></span><span></span></div>', true);

  try {
    await window.claude.sendMessage(conversationId, msg, parentMessageUuid!, attachmentPayloads);
    clearAttachments();
  } catch (e: any) {
    if (currentStreamingElement) {
      const content = currentStreamingElement.querySelector('.message-content');
      if (content) content.innerHTML = '<span style="color:#FF453A">Error: ' + e.message + '</span>';
    }
    currentStreamingElement = null;
    isLoading = false;
    if (sendBtn) sendBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.remove('visible');
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
    console.error('Stop failed:', e);
  }

  if (currentStreamingElement) {
    const content = currentStreamingElement.querySelector('.message-content');
    const hasLoadingDots = content?.querySelector('.loading-dots');
    const hasContent = streamingBlocks.textContent.trim().length > 0;

    if (hasLoadingDots && !hasContent) {
      currentStreamingElement.remove();
    } else if (hasContent) {
      const finalHtml = buildInterleavedContent([]);
      if (content) content.innerHTML = finalHtml || '<span style="opacity:0.5;font-style:italic">Stopped</span>';
    }
  }

  isLoading = false;
  const sendBtn = $('send-btn');
  const stopBtn = $('stop-btn');
  if (sendBtn) sendBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.remove('visible');
  currentStreamingElement = null;
  resetStreamingBlocks();

  const inputEl = $('input');
  if (inputEl) inputEl.focus();
}

// Initialize
async function init() {
  if (await window.claude.getAuthStatus()) {
    showHome();
    loadConversationsList();
  } else {
    showLogin();
  }

  // Set up message listeners
  window.claude.onMessageThinking(d => {
    if (currentStreamingElement && d.conversationId === conversationId) {
      hideEmptyState();
      streamingBlocks.thinkingBlocks.set(d.blockIndex, {
        text: d.thinkingText || '',
        isActive: d.isThinking
      });
      updateStreamingContent();
    }
  });

  window.claude.onMessageThinkingStream(d => {
    if (currentStreamingElement && d.conversationId === conversationId) {
      const block = streamingBlocks.thinkingBlocks.get(d.blockIndex) || { isActive: true };
      block.text = d.thinking;
      if (d.summary) block.summary = d.summary;
      streamingBlocks.thinkingBlocks.set(d.blockIndex, block);
      updateStreamingContent();
    }
  });

  window.claude.onMessageToolUse(d => {
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

  window.claude.onMessageToolResult(d => {
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

  window.claude.onMessageStream(d => {
    if (currentStreamingElement && d.conversationId === conversationId) {
      hideEmptyState();
      streamingBlocks.textContent = d.fullText;
      if (d.blockIndex !== undefined) {
        streamingBlocks.textBlocks.set(d.blockIndex, { text: d.fullText });
      }
      updateStreamingContent();
      scrollToBottom();
    }
  });

  window.claude.onMessageComplete(d => {
    if (currentStreamingElement && d.conversationId === conversationId) {
      const finalHtml = buildInterleavedContent(d.steps);
      const content = currentStreamingElement.querySelector('.message-content');
      if (content) {
        content.innerHTML = finalHtml;
        // Add click listeners to step items
        content.querySelectorAll('.step-item').forEach(el => {
          el.addEventListener('click', () => el.classList.toggle('expanded'));
        });
      }
      parentMessageUuid = d.messageUuid;

      // Store assistant message for export
      if (d.fullText) {
        currentConversationMessages.push({ role: 'assistant', content: d.fullText, timestamp: new Date().toISOString() });
      }

      currentStreamingElement = null;
      resetStreamingBlocks();
      isLoading = false;

      const sendBtn = $('send-btn');
      const stopBtn = $('stop-btn');
      if (sendBtn) sendBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.remove('visible');

      const inputEl = $('input');
      if (inputEl) inputEl.focus();
    }
  });
}

// Set up event listeners
function setupEventListeners() {
  // Login button
  $('login-btn')?.addEventListener('click', login);

  // Logout buttons (home and chat views)
  $('logout-btn')?.addEventListener('click', logout);
  $('chat-logout-btn')?.addEventListener('click', logout);

  // New chat button
  $('new-chat-btn')?.addEventListener('click', newChat);

  // Settings buttons
  $('settings-btn')?.addEventListener('click', () => {
    showSettingsPage();
  });
  $('home-settings-btn')?.addEventListener('click', () => {
    showSettingsPage();
  });
  $('notes-settings-btn')?.addEventListener('click', () => {
    showSettingsPage();
  });

  // Export button
  $('export-btn')?.addEventListener('click', exportConversation);

  // Sidebar toggle
  $('sidebar-tab')?.addEventListener('click', toggleSidebar);
  $('sidebar-overlay')?.addEventListener('click', closeSidebar);

  // Model selection
  $$('.model-option').forEach(btn => {
    btn.addEventListener('click', () => selectModel(btn as HTMLElement));
  });

  // Home input
  const homeInput = $('home-input') as HTMLTextAreaElement;
  homeInput?.addEventListener('input', () => autoResizeHome(homeInput));
  homeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFromHome();
    }
  });

  // Home send button
  $('home-send-btn')?.addEventListener('click', sendFromHome);

  // Chat input
  const chatInput = $('input') as HTMLTextAreaElement;
  chatInput?.addEventListener('input', () => autoResize(chatInput));
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Attachment buttons
  const fileInput = $('file-input') as HTMLInputElement;
  $('attach-btn')?.addEventListener('click', () => fileInput?.click());
  $('home-attach-btn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    handleFileSelection(fileInput.files);
    fileInput.value = '';
  });

  // Send button
  $('send-btn')?.addEventListener('click', sendMessage);

  // Stop button
  $('stop-btn')?.addEventListener('click', stopGenerating);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      toggleSidebar();
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (openDropdownId && !(e.target as HTMLElement).closest('.conv-item')) {
      const dropdown = $(`conv-dropdown-${openDropdownId}`);
      if (dropdown) dropdown.classList.remove('open');
      openDropdownId = null;
    }
  });

  // Sidebar tab indicator
  const sidebarTab = $('sidebar-tab');
  const sidebarTabIndicator = $('sidebar-tab-indicator');
  sidebarTab?.addEventListener('mousemove', (e) => {
    if (!sidebarTabIndicator || !sidebarTab) return;
    const rect = sidebarTab.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    sidebarTabIndicator.style.top = relativeY + 'px';
  });

  // Sidebar hover to open
  let hoverTimeout: number;
  sidebarTab?.addEventListener('mouseenter', () => {
    hoverTimeout = window.setTimeout(() => {
      toggleSidebar();
    }, 200);
  });
  sidebarTab?.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimeout);
  });

  // Record audio button
  const recordBtn = $('record-btn');
  recordBtn?.addEventListener('click', toggleRecording);

  // Listen for global shortcuts transcriptions
  if (window.claude.receive) {
    window.claude.receive('transcription-complete', (text: string) => {
      console.log('Received global transcription:', text);
      if (text) {
        saveTranscriptionHistory(text);
      }
    });
  }
}

// Audio recording state
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let isRecording = false;

// Toggle audio recording
interface TranscriptionItem {
  text: string;
  timestamp: string;
}

function saveTranscriptionHistory(text: string) {
  try {
    const historyJson = localStorage.getItem('transcriptionHistory');
    let history: TranscriptionItem[] = historyJson ? JSON.parse(historyJson) : [];

    history.unshift({
      text,
      timestamp: new Date().toISOString()
    });

    // Remove limit to keep all history
    // if (history.length > 50) {
    //   history = history.slice(0, 50);
    // }

    localStorage.setItem('transcriptionHistory', JSON.stringify(history));
    renderTranscriptionHistory();
    updateFlowStats();
  } catch (e) {
    console.error('Failed to save transcription history:', e);
  }
}

// Calculate and update flow stats from transcription history
function updateFlowStats() {
  try {
    const historyJson = localStorage.getItem('transcriptionHistory');
    if (!historyJson) {
      return;
    }

    const history: TranscriptionItem[] = JSON.parse(historyJson);

    // Calculate total words
    const totalWords = history.reduce((sum, item) => {
      const wordCount = item.text.trim().split(/\s+/).filter(w => w.length > 0).length;
      return sum + wordCount;
    }, 0);

    // Calculate streak (consecutive days with activity)
    let streak = 0;
    if (history.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dates = new Set<string>();
      history.forEach(item => {
        const date = new Date(item.timestamp);
        date.setHours(0, 0, 0, 0);
        dates.add(date.toISOString().split('T')[0]);
      });

      const sortedDates = Array.from(dates).sort().reverse();

      // Check if there's activity today or yesterday to start the streak
      const mostRecentDate = new Date(sortedDates[0]);
      const daysDiff = Math.floor((today.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 1) {
        streak = 1;
        let currentDate = new Date(sortedDates[0]);

        for (let i = 1; i < sortedDates.length; i++) {
          const prevDate = new Date(sortedDates[i]);
          const diff = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

          if (diff === 1) {
            streak++;
            currentDate = prevDate;
          } else {
            break;
          }
        }
      }
    }

    // Calculate average WPM (words per minute)
    // Estimate: assume each transcription took about 30 seconds on average
    const avgSecondsPerTranscription = 30;
    const totalMinutes = (history.length * avgSecondsPerTranscription) / 60;
    const wpm = totalMinutes > 0 ? Math.round(totalWords / totalMinutes) : 0;

    // Update UI
    const statsContainer = document.querySelector('.flow-stats');
    if (statsContainer) {
      const streakText = streak === 0 ? '0 days' :
        streak === 1 ? '1 day' :
          streak < 7 ? `${streak} days` :
            streak < 14 ? `${Math.floor(streak / 7)} week` :
              `${Math.floor(streak / 7)} weeks`;

      statsContainer.innerHTML = `
        <div class="flow-stat-pill">
          <span>🔥</span> ${streakText}
        </div>
        <div class="flow-stat-pill">
          <span>🚀</span> ${totalWords.toLocaleString()} words
        </div>
        <div class="flow-stat-pill">
          <span>🐌</span> ${wpm} WPM
        </div>
      `;
    }
  } catch (e) {
    console.error('Failed to update flow stats:', e);
  }
}

async function renderTranscriptionHistory() {
  const container = $('list-history');
  if (!container) return;

  try {
    // Get recordings from database
    const recordings = await (window as any).claude.getRecordingsList(10, 0);

    if (!recordings || recordings.length === 0) {
      container.innerHTML = `
        <div class="flow-activity-header">Recent Recordings</div>
        <div class="flow-activity-list">
          <div class="flow-activity-item" style="justify-content:center; color:#999; padding: 20px;">No recordings yet</div>
        </div>
      `;
      return;
    }

    const itemsHtml = recordings.map((recording: any) => {
      const date = new Date(recording.timestamp);
      const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' });

      // Format duration
      const minutes = Math.floor(recording.duration / 60);
      const seconds = recording.duration % 60;
      const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Get preview of transcript (first 100 chars)
      const preview = recording.title || `Recording ${dateStr}`;

      // Mode badge
      const modeBadge = recording.recordingMode === 'mic+system'
        ? '<span class="recording-mode-badge system">Mic + System</span>'
        : '<span class="recording-mode-badge">Mic</span>';

      return `
        <div class="recording-item" data-id="${recording.id}">
          <div class="recording-item-header">
            <div class="recording-item-title">${escapeHtml(preview)}</div>
            <div class="recording-item-actions">
              <button class="recording-action-btn view-btn" data-id="${recording.id}" title="View transcript">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3C4.5 3 1.73 5.61 1 9c.73 3.39 3.5 6 7 6s6.27-2.61 7-6c-.73-3.39-3.5-6-7-6zm0 10c-2.48 0-4.5-2.02-4.5-4.5S5.52 4 8 4s4.5 2.02 4.5 4.5S10.48 13 8 13z"/>
                  <circle cx="8" cy="8.5" r="2"/>
                </svg>
              </button>
              <button class="recording-action-btn delete-btn" data-id="${recording.id}" title="Delete">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5 3V1.5A1.5 1.5 0 016.5 0h3A1.5 1.5 0 0111 1.5V3h3.5a.5.5 0 010 1H14v10.5A1.5 1.5 0 0112.5 16h-9A1.5 1.5 0 012 14.5V4h-.5a.5.5 0 010-1H5zM6 3h4V1.5a.5.5 0 00-.5-.5h-3a.5.5 0 00-.5.5V3zm7 1H3v10.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V4z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="recording-item-meta">
            <span class="recording-meta-time">${timeStr} · ${dateStr}</span>
            <span class="recording-meta-duration">${durationStr}</span>
            ${modeBadge}
            <span class="recording-meta-words">${recording.wordCount || 0} words</span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="flow-activity-header">Recent Recordings</div>
      <div class="recordings-list">
        ${itemsHtml}
      </div>
    `;

    // Attach event listeners
    attachRecordingEventListeners();
  } catch (e) {
    console.error('Failed to render recordings:', e);
    container.innerHTML = `
      <div class="flow-activity-header">Recent Recordings</div>
      <div class="flow-activity-list">
        <div class="flow-activity-item" style="justify-content:center; color:#ff453a; padding: 20px;">Error loading recordings</div>
      </div>
    `;
  }
}

// Attach event listeners for recording items
function attachRecordingEventListeners() {
  // View buttons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) {
        await viewRecording(id);
      }
    });
  });

  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) {
        if (confirm('Are you sure you want to delete this recording?')) {
          await deleteRecording(id);
        }
      }
    });
  });
}

// View recording in modal
async function viewRecording(id: string) {
  try {
    const detail = await (window as any).claude.getRecordingDetail(id);
    if (!detail) {
      alert('Recording not found');
      return;
    }

    // Show modal with transcript
    const modal = document.createElement('div');
    modal.className = 'recording-modal-overlay active';

    const date = new Date(detail.metadata.timestamp);
    const dateStr = date.toLocaleString('vi-VN');
    const minutes = Math.floor(detail.metadata.duration / 60);
    const seconds = detail.metadata.duration % 60;
    const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    modal.innerHTML = `
      <div class="recording-modal">
        <div class="recording-modal-header">
          <h2>${escapeHtml(detail.metadata.title || 'Recording')}</h2>
          <button class="recording-modal-close">&times;</button>
        </div>
        <div class="recording-modal-meta">
          <span>${dateStr}</span>
          <span>·</span>
          <span>${durationStr}</span>
          <span>·</span>
          <span>${detail.metadata.recordingMode === 'mic+system' ? 'Mic + System' : 'Mic Only'}</span>
          <span>·</span>
          <span>${detail.metadata.wordCount || 0} words</span>
        </div>
        <div class="recording-modal-content">
          <pre>${escapeHtml(detail.transcript)}</pre>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.recording-modal-close')?.addEventListener('click', () => {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
      }
    });
  } catch (error) {
    console.error('Failed to view recording:', error);
    alert('Failed to load recording');
  }
}

// Delete recording
async function deleteRecording(id: string) {
  try {
    await (window as any).claude.deleteRecording(id);
    renderTranscriptionHistory(); // Refresh list
  } catch (error) {
    console.error('Failed to delete recording:', error);
    alert('Failed to delete recording');
  }
}

// Listen for recording-saved event
if ((window as any).claude && (window as any).claude.onRecordingSaved) {
  (window as any).claude.onRecordingSaved(() => {
    console.log('[Renderer] Recording saved, refreshing list');
    renderTranscriptionHistory();
  });
}

async function toggleRecording() {
  const recordBtn = $('record-btn');
  const chatInputEl = $('input') as HTMLTextAreaElement;
  const homeInputEl = $('home-input') as HTMLTextAreaElement;

  // Determine which input to use based on which view is visible
  const homeContainer = document.getElementById('home');
  const chatContainer = document.getElementById('chat');
  const isHomeView = homeContainer && getComputedStyle(homeContainer).display !== 'none';
  const inputEl = isHomeView ? homeInputEl : chatInputEl;

  if (!isRecording) {
    // Start recording
    try {
      // Pre-warm bearer token for faster transcription (fire-and-forget)
      if (window.claude.warmBearerToken) {
        window.claude.warmBearerToken().catch(() => {
          // Ignore errors - transcription will fetch token if needed
        });
      }

      // Start audio ducking to reduce other apps' volume
      if (window.claude.audioDuckingStart) {
        await window.claude.audioDuckingStart();
      }

      // Request high-quality audio with optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,  // Higher sample rate for better quality
          channelCount: 1     // Mono is sufficient for speech
        }
      });

      // Use high-quality encoding settings
      const options: MediaRecorderOptions = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000  // 128kbps for high quality speech
      };

      mediaRecorder = new MediaRecorder(stream, options);

      audioChunks = [];

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      });

      mediaRecorder.addEventListener('stop', async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Stop audio ducking - restore system volume
        if (window.claude.audioDuckingStop) {
          await window.claude.audioDuckingStop();
        }

        // Create blob from chunks
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

        // Convert to ArrayBuffer
        const arrayBuffer = await audioBlob.arrayBuffer();

        // Show loading state
        if (inputEl) {
          inputEl.placeholder = 'Transcribing...';
          inputEl.disabled = true;
        }

        try {
          // Call transcribe API
          const result = await window.claude.transcribeAudio(arrayBuffer, 'audio.webm');

          console.log('Transcription result:', result);

          if (result && result.text) {
            saveTranscriptionHistory(result.text);
          }

          // Insert transcribed text into input - always add new line if there's existing text
          if (result && result.text) {
            if (inputEl) {
              const currentText = inputEl.value.trim();
              if (currentText) {
                // Add new line before appending
                inputEl.value = currentText + '\n' + result.text;
              } else {
                inputEl.value = result.text;
              }

              // Auto resize based on which input is being used
              if (isHomeView && homeInputEl) {
                autoResizeHome(homeInputEl);
              } else if (chatInputEl) {
                autoResize(chatInputEl);
              }

              inputEl.focus();
            }
          }
        } catch (error) {
          console.error('Transcription error:', error);
          alert('Failed to transcribe audio: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
          // Reset state
          if (inputEl) {
            inputEl.placeholder = 'Message Claude...';
            inputEl.disabled = false;
          }
        }
      });

      mediaRecorder.start();
      isRecording = true;

      // Update UI
      if (recordBtn) {
        recordBtn.classList.add('recording');
        recordBtn.title = 'Stop recording';
      }

    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  } else {
    // Stop recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    isRecording = false;

    // Update UI
    if (recordBtn) {
      recordBtn.classList.remove('recording');
      recordBtn.title = 'Record audio';
    }
  }
}

// Notes functionality
interface NoteItem {
  id: string;
  text: string;
  timestamp: string;
}

let notesMediaRecorder: MediaRecorder | null = null;
let notesAudioChunks: Blob[] = [];
let isNotesRecording = false;

function showNotesPage() {
  const homeContent = $('home-content');
  const notesContent = $('notes-content');
  const dictionaryContent = $('dictionary-content');
  const recordingsContent = $('recordings-content');
  const settingsContent = $('settings-content');
  const textarea = $('notes-textarea') as HTMLTextAreaElement;

  if (homeContent) homeContent.style.display = 'none';
  if (notesContent) notesContent.style.display = 'flex';
  if (dictionaryContent) dictionaryContent.style.display = 'none';
  if (recordingsContent) recordingsContent.style.display = 'none';
  if (settingsContent) settingsContent.style.display = 'none';
  if (textarea) {
    textarea.value = '';
    textarea.focus();
  }

  // Update active state in sidebar
  const viewNotesBtn = $('view-notes-btn');
  const navItems = document.querySelectorAll('.flow-nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  if (viewNotesBtn) viewNotesBtn.classList.add('active');

  // Render the notes list immediately
  renderNotesList();
}

function showDictionaryPage() {
  const homeContent = $('home-content');
  const notesContent = $('notes-content');
  const dictionaryContent = $('dictionary-content');
  const settingsContent = $('settings-content');
  const textarea = $('dictionary-textarea') as HTMLTextAreaElement;

  if (homeContent) homeContent.style.display = 'none';
  if (notesContent) notesContent.style.display = 'none';
  if (dictionaryContent) dictionaryContent.style.display = 'flex';
  if (settingsContent) settingsContent.style.display = 'none';

  // Load current dictionary settings
  if (textarea) {
    loadDictionarySettings();
  }

  // Update active state in sidebar
  const viewDictionaryBtn = $('view-dictionary-btn');
  const navItems = document.querySelectorAll('.flow-nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  if (viewDictionaryBtn) viewDictionaryBtn.classList.add('active');
}

function showRecordingsPage() {
  const homeContent = $('home-content');
  const notesContent = $('notes-content');
  const dictionaryContent = $('dictionary-content');
  const recordingsContent = $('recordings-content');
  const settingsContent = $('settings-content');

  if (homeContent) homeContent.style.display = 'none';
  if (notesContent) notesContent.style.display = 'none';
  if (dictionaryContent) dictionaryContent.style.display = 'none';
  if (recordingsContent) recordingsContent.style.display = 'flex';
  if (settingsContent) settingsContent.style.display = 'none';

  // Update active state in sidebar
  const viewRecordingsBtn = $('view-recordings-btn');
  const navItems = document.querySelectorAll('.flow-nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  if (viewRecordingsBtn) viewRecordingsBtn.classList.add('active');

  // Render recordings list immediately
  renderRecordingsList();
}

function renderRecordingsList() {
  const recordingsListContent = $('recordings-list-content');
  if (!recordingsListContent) return;

  // TODO: Implement actual recordings loading from storage
  // For now, show empty state
  recordingsListContent.innerHTML = `
    <div class="recordings-empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      <p>No recordings yet</p>
      <p style="font-size: 13px; opacity: 0.6;">Press ⌘+K to start recording</p>
    </div>
  `;
}

function showHomePage() {
  const homeContent = $('home-content');
  const notesContent = $('notes-content');
  const dictionaryContent = $('dictionary-content');
  const recordingsContent = $('recordings-content');
  const settingsContent = $('settings-content');
  const recordBtn = $('notes-record-btn');

  if (homeContent) homeContent.style.display = 'block';
  if (notesContent) notesContent.style.display = 'none';
  if (dictionaryContent) dictionaryContent.style.display = 'none';
  if (recordingsContent) recordingsContent.style.display = 'none';
  if (settingsContent) settingsContent.style.display = 'none';
  if (recordBtn) recordBtn.classList.remove('recording');

  // Update active state in sidebar
  const navItems = document.querySelectorAll('.flow-nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  const homeNavItems = document.querySelectorAll('.flow-nav-item');
  if (homeNavItems.length > 0) homeNavItems[0].classList.add('active');

  // Stop recording if active
  if (isNotesRecording && notesMediaRecorder) {
    notesMediaRecorder.stop();
    isNotesRecording = false;
  }
}

function showSettingsPage() {
  const homeContent = $('home-content');
  const notesContent = $('notes-content');
  const dictionaryContent = $('dictionary-content');
  const recordingsContent = $('recordings-content');
  const settingsContent = $('settings-content');
  const recordBtn = $('notes-record-btn');

  if (homeContent) homeContent.style.display = 'none';
  if (notesContent) notesContent.style.display = 'none';
  if (dictionaryContent) dictionaryContent.style.display = 'none';
  if (recordingsContent) recordingsContent.style.display = 'none';
  if (settingsContent) settingsContent.style.display = 'flex';
  if (recordBtn) recordBtn.classList.remove('recording');

  // Update active state in sidebar
  const navItems = document.querySelectorAll('.flow-nav-item');
  navItems.forEach(item => item.classList.remove('active'));
  // Settings buttons don't have active state in this design

  // Stop recording if active
  if (isNotesRecording && notesMediaRecorder) {
    notesMediaRecorder.stop();
    isNotesRecording = false;
  }

  // Load settings into the page
  loadPageSettings();
}

// Settings page management
async function loadPageSettings() {
  const settings = await window.claude.getSettings() as any;

  if (!settings) return;

  // Update displays
  const pageKeybindDisplay = $('page-keybind-display');
  const pageRecordingKeybindDisplay = $('page-recording-keybind-display');
  const pagePersistHistoryCheckbox = $('page-persist-history') as HTMLInputElement;
  const pageDictionaryInput = $('page-dictionary-input') as HTMLTextAreaElement;
  const pageLlmCorrectionToggle = $('page-llm-correction-toggle') as HTMLInputElement;
  const pageLlmPromptInput = $('page-llm-prompt-input') as HTMLTextAreaElement;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const formatKeybind = (keybind: string) => {
    return keybind
      .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
      .replace('Command', '⌘')
      .replace('Control', 'Ctrl')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Option', '⌥')
      .replace(/\+/g, ' + ');
  };

  if (pageKeybindDisplay && settings.spotlightKeybind) {
    pageKeybindDisplay.textContent = formatKeybind(settings.spotlightKeybind);
  }
  if (pageRecordingKeybindDisplay && settings.recordingKeybind) {
    pageRecordingKeybindDisplay.textContent = formatKeybind(settings.recordingKeybind);
  }
  if (pagePersistHistoryCheckbox && settings.spotlightPersistHistory !== undefined) {
    pagePersistHistoryCheckbox.checked = settings.spotlightPersistHistory;
  }

  if (pageDictionaryInput) {
    pageDictionaryInput.value = settings.dictionary
      ? Object.entries(settings.dictionary).map(([key, value]) => `${key}=${value}`).join('\n')
      : '';
  }

  if (pageLlmCorrectionToggle) pageLlmCorrectionToggle.checked = !!settings.llmCorrectionEnabled;
  if (pageLlmPromptInput) {
    pageLlmPromptInput.value = settings.llmCorrectionPrompt || 'Fix grammar, punctuation, and capitalization. Return only the corrected text without any explanation.';
  }

  updatePageLLMUIState();
}

function updatePageLLMUIState() {
  const pageLlmCorrectionToggle = $('page-llm-correction-toggle') as HTMLInputElement;
  const pageLlmPromptContainer = $('page-llm-prompt-container');

  if (pageLlmCorrectionToggle && pageLlmPromptContainer) {
    if (pageLlmCorrectionToggle.checked) {
      pageLlmPromptContainer.style.opacity = '1';
      pageLlmPromptContainer.style.pointerEvents = 'auto';
    } else {
      pageLlmPromptContainer.style.opacity = '0.5';
      pageLlmPromptContainer.style.pointerEvents = 'none';
    }
  }
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

// Save keyboard shortcut settings
async function savePageKeybind(keybind: string, isRecording: boolean = false) {
  try {
    const settingKey = isRecording ? 'recordingKeybind' : 'spotlightKeybind';
    await window.claude.saveSettings({ [settingKey]: keybind } as any);
    console.log(`Saved ${settingKey}:`, keybind);
  } catch (e) {
    console.error('Failed to save keybind:', e);
  }
}

// Save persist history setting
async function savePagePersistHistory(value: boolean) {
  try {
    await window.claude.saveSettings({ spotlightPersistHistory: value } as any);
    console.log('Saved persist history:', value);
  } catch (e) {
    console.error('Failed to save persist history:', e);
  }
}

// Save transcription settings (debounced)
let saveTranscriptionTimeout: any;
async function savePageTranscriptionSettings() {
  clearTimeout(saveTranscriptionTimeout);
  saveTranscriptionTimeout = setTimeout(async () => {
    try {
      const pageDictionaryInput = $('page-dictionary-input') as HTMLTextAreaElement;
      const pageLlmCorrectionToggle = $('page-llm-correction-toggle') as HTMLInputElement;
      const pageLlmPromptInput = $('page-llm-prompt-input') as HTMLTextAreaElement;

      if (!pageDictionaryInput || !pageLlmCorrectionToggle || !pageLlmPromptInput) return;

      const settings = {
        dictionary: stringToDictionary(pageDictionaryInput.value),
        llmCorrectionEnabled: pageLlmCorrectionToggle.checked,
        llmCorrectionPrompt: pageLlmPromptInput.value
      };

      await window.claude.saveSettings(settings as any);
      console.log('Saved transcription settings:', settings);
    } catch (e) {
      console.error('Failed to save transcription settings:', e);
    }
  }, 500);
}

// Keybind recording state for page settings
let isRecordingPageKeybind = false;
let isRecordingPageRecordingKeybind = false;
let pendingPageKeybind: string | null = null;
let pendingPageRecordingKeybind: string | null = null;

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
    isComplete: !isModifierOnly && parts.length >= 2
  };
}

// Format keybind for display
function formatKeybindForDisplay(keybind: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return keybind
    .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Option', '⌥')
    .replace(/\+/g, ' + ');
}

// Setup settings page event listeners
function setupSettingsEventListeners() {
  const pageKeybindInput = $('page-keybind-input');
  const pageKeybindDisplay = $('page-keybind-display');
  const pageRecordingKeybindInput = $('page-recording-keybind-input');
  const pageRecordingKeybindDisplay = $('page-recording-keybind-display');
  const pagePersistHistoryCheckbox = $('page-persist-history') as HTMLInputElement;
  const pageDictionaryInput = $('page-dictionary-input') as HTMLTextAreaElement;
  const pageLlmCorrectionToggle = $('page-llm-correction-toggle') as HTMLInputElement;
  const pageLlmPromptInput = $('page-llm-prompt-input') as HTMLTextAreaElement;

  // Spotlight keybind recording
  if (pageKeybindInput && pageKeybindDisplay) {
    pageKeybindInput.addEventListener('click', () => {
      if (!isRecordingPageKeybind) {
        isRecordingPageKeybind = true;
        pendingPageKeybind = null;
        pageKeybindInput.classList.add('recording');
        pageKeybindDisplay.textContent = 'Press keys...';
        pageKeybindInput.focus();
      }
    });

    pageKeybindInput.addEventListener('keydown', (e) => {
      if (!isRecordingPageKeybind) return;

      e.preventDefault();
      e.stopPropagation();

      // Handle Escape to cancel
      if (e.key === 'Escape') {
        stopPageKeybindRecording(false);
        return;
      }

      // Handle Enter to confirm
      if (e.key === 'Enter' && pendingPageKeybind) {
        stopPageKeybindRecording(true);
        return;
      }

      const result = keyEventToAccelerator(e);

      // Update display to show current keys being pressed
      if (result.accelerator) {
        pageKeybindDisplay.textContent = formatKeybindForDisplay(result.accelerator);

        // If we have a complete combo (modifier + key), store it as pending
        if (result.isComplete) {
          pendingPageKeybind = result.accelerator;
        }
      }
    });

    pageKeybindInput.addEventListener('blur', () => {
      stopPageKeybindRecording(!!pendingPageKeybind);
    });
  }

  // Recording keybind recording
  if (pageRecordingKeybindInput && pageRecordingKeybindDisplay) {
    pageRecordingKeybindInput.addEventListener('click', () => {
      if (!isRecordingPageRecordingKeybind) {
        isRecordingPageRecordingKeybind = true;
        pendingPageRecordingKeybind = null;
        pageRecordingKeybindInput.classList.add('recording');
        pageRecordingKeybindDisplay.textContent = 'Press keys...';
        pageRecordingKeybindInput.focus();
      }
    });

    pageRecordingKeybindInput.addEventListener('keydown', (e) => {
      if (!isRecordingPageRecordingKeybind) return;

      e.preventDefault();
      e.stopPropagation();

      // Handle Escape to cancel
      if (e.key === 'Escape') {
        stopPageRecordingKeybindRecording(false);
        return;
      }

      // Handle Enter to confirm
      if (e.key === 'Enter' && pendingPageRecordingKeybind) {
        stopPageRecordingKeybindRecording(true);
        return;
      }

      const result = keyEventToAccelerator(e);

      // Update display to show current keys being pressed
      if (result.accelerator) {
        pageRecordingKeybindDisplay.textContent = formatKeybindForDisplay(result.accelerator);

        // If we have a complete combo (modifier + key), store it as pending
        if (result.isComplete) {
          pendingPageRecordingKeybind = result.accelerator;
        }
      }
    });

    pageRecordingKeybindInput.addEventListener('blur', () => {
      stopPageRecordingKeybindRecording(!!pendingPageRecordingKeybind);
    });
  }

  // Persist history toggle
  if (pagePersistHistoryCheckbox) {
    pagePersistHistoryCheckbox.addEventListener('change', () => {
      savePagePersistHistory(pagePersistHistoryCheckbox.checked);
    });
  }

  // Dictionary input
  if (pageDictionaryInput) {
    pageDictionaryInput.addEventListener('input', savePageTranscriptionSettings);
  }

  // LLM correction toggle
  if (pageLlmCorrectionToggle) {
    pageLlmCorrectionToggle.addEventListener('change', () => {
      updatePageLLMUIState();
      savePageTranscriptionSettings();
    });
  }

  // LLM prompt input
  if (pageLlmPromptInput) {
    pageLlmPromptInput.addEventListener('input', savePageTranscriptionSettings);
  }
}

// Stop spotlight keybind recording
async function stopPageKeybindRecording(save: boolean) {
  const pageKeybindInput = $('page-keybind-input');
  const pageKeybindDisplay = $('page-keybind-display');

  if (!isRecordingPageKeybind || !pageKeybindInput || !pageKeybindDisplay) return;

  isRecordingPageKeybind = false;
  pageKeybindInput.classList.remove('recording');

  if (save && pendingPageKeybind) {
    await savePageKeybind(pendingPageKeybind, false);
    pageKeybindDisplay.textContent = formatKeybindForDisplay(pendingPageKeybind);
  } else {
    // Restore previous value
    const settings = await window.claude.getSettings() as any;
    if (settings?.spotlightKeybind) {
      pageKeybindDisplay.textContent = formatKeybindForDisplay(settings.spotlightKeybind);
    }
  }

  pendingPageKeybind = null;
}

// Stop recording keybind recording
async function stopPageRecordingKeybindRecording(save: boolean) {
  const pageRecordingKeybindInput = $('page-recording-keybind-input');
  const pageRecordingKeybindDisplay = $('page-recording-keybind-display');

  if (!isRecordingPageRecordingKeybind || !pageRecordingKeybindInput || !pageRecordingKeybindDisplay) return;

  isRecordingPageRecordingKeybind = false;
  pageRecordingKeybindInput.classList.remove('recording');

  if (save && pendingPageRecordingKeybind) {
    await savePageKeybind(pendingPageRecordingKeybind, true);
    pageRecordingKeybindDisplay.textContent = formatKeybindForDisplay(pendingPageRecordingKeybind);
  } else {
    // Restore previous value
    const settings = await window.claude.getSettings() as any;
    if (settings?.recordingKeybind) {
      pageRecordingKeybindDisplay.textContent = formatKeybindForDisplay(settings.recordingKeybind);
    }
  }

  pendingPageRecordingKeybind = null;
}

function saveNote(text: string) {
  if (!text.trim()) return;

  try {
    const notesJson = localStorage.getItem('notes');
    let notes: NoteItem[] = notesJson ? JSON.parse(notesJson) : [];

    const newNote: NoteItem = {
      id: crypto.randomUUID(),
      text: text.trim(),
      timestamp: new Date().toISOString()
    };

    notes.unshift(newNote);
    localStorage.setItem('notes', JSON.stringify(notes));

    console.log('Note saved:', newNote);
  } catch (e) {
    console.error('Failed to save note:', e);
  }
}

function deleteNote(id: string) {
  try {
    const notesJson = localStorage.getItem('notes');
    if (!notesJson) return;

    let notes: NoteItem[] = JSON.parse(notesJson);
    notes = notes.filter(note => note.id !== id);

    localStorage.setItem('notes', JSON.stringify(notes));
    renderNotesList();
  } catch (e) {
    console.error('Failed to delete note:', e);
  }
}

function renderNotesList() {
  const container = $('notes-list-content');
  if (!container) return;

  try {
    const notesJson = localStorage.getItem('notes');
    if (!notesJson) {
      container.innerHTML = '<div class="notes-empty">No notes yet. Create your first note!</div>';
      return;
    }

    const notes: NoteItem[] = JSON.parse(notesJson);
    if (notes.length === 0) {
      container.innerHTML = '<div class="notes-empty">No notes yet. Create your first note!</div>';
      return;
    }

    const notesHtml = notes.map(note => {
      const date = new Date(note.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="note-item" data-id="${note.id}">
          <div class="note-item-text">${escapeHtml(note.text)}</div>
          <div class="note-item-meta">
            <span>${dateStr} ${timeStr}</span>
            <button class="note-item-delete" data-id="${note.id}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = notesHtml;

    // Add delete event listeners
    container.querySelectorAll('.note-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm('Are you sure you want to delete this note?')) {
          deleteNote(id);
        }
      });
    });
  } catch (e) {
    console.error('Failed to render notes list:', e);
    container.innerHTML = '<div class="notes-empty">Error loading notes</div>';
  }
}

async function toggleNotesRecording() {
  const recordBtn = $('notes-record-btn');
  const textarea = $('notes-textarea') as HTMLTextAreaElement;

  if (!isNotesRecording) {
    // Start recording
    try {
      // Start audio ducking to reduce other apps' volume
      if (window.claude.audioDuckingStart) {
        await window.claude.audioDuckingStart();
      }

      // Request high-quality audio with optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,  // Higher sample rate for better quality
          channelCount: 1     // Mono is sufficient for speech
        }
      });

      // Use high-quality encoding settings
      const options: MediaRecorderOptions = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000  // 128kbps for high quality speech
      };

      notesMediaRecorder = new MediaRecorder(stream, options);

      notesAudioChunks = [];

      notesMediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          notesAudioChunks.push(event.data);
        }
      });

      notesMediaRecorder.addEventListener('stop', async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Stop audio ducking - restore system volume
        if (window.claude.audioDuckingStop) {
          await window.claude.audioDuckingStop();
        }

        // Create blob from chunks
        const audioBlob = new Blob(notesAudioChunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();

        // Show loading state
        if (textarea) {
          textarea.placeholder = 'Transcribing...';
          textarea.disabled = true;
        }

        try {
          // Call transcribe API
          const result = await window.claude.transcribeAudio(arrayBuffer, 'audio.webm');

          if (result && result.text) {
            if (textarea) {
              const currentText = textarea.value.trim();
              if (currentText) {
                textarea.value = currentText + '\n' + result.text;
              } else {
                textarea.value = result.text;
              }
              textarea.focus();
            }
          }
        } catch (error) {
          console.error('Transcription error:', error);
          alert('Failed to transcribe audio: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
          // Reset state
          if (textarea) {
            textarea.placeholder = 'Type or speak your note...';
            textarea.disabled = false;
          }
        }
      });

      notesMediaRecorder.start();
      isNotesRecording = true;

      // Update UI
      if (recordBtn) {
        recordBtn.classList.add('recording');
        recordBtn.title = 'Stop recording';
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  } else {
    // Stop recording
    if (notesMediaRecorder && notesMediaRecorder.state !== 'inactive') {
      notesMediaRecorder.stop();
    }

    isNotesRecording = false;

    // Update UI
    if (recordBtn) {
      recordBtn.classList.remove('recording');
      recordBtn.title = 'Record audio';
    }
  }
}

// Dictionary page functions
async function loadDictionarySettings() {
  try {
    const settings = await window.claude.getSettings();
    const textarea = $('dictionary-textarea') as HTMLTextAreaElement;
    if (textarea && settings) {
      textarea.value = dictionaryToString(settings.dictionary);
    }
  } catch (error) {
    console.error('Failed to load dictionary settings:', error);
  }
}

async function saveDictionarySettings() {
  try {
    const textarea = $('dictionary-textarea') as HTMLTextAreaElement;
    if (textarea) {
      const dictionary = stringToDictionary(textarea.value);
      await window.claude.saveSettings({ dictionary });
      console.log('Dictionary settings saved successfully!');

      // Show a brief success indicator
      const saveBtn = $('dictionary-save-btn');
      if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saved!';
        saveBtn.style.background = '#4CAF50';
        setTimeout(() => {
          saveBtn.textContent = originalText || 'Save Changes';
          saveBtn.style.background = '';
        }, 2000);
      }
    }
  } catch (error) {
    console.error('Failed to save dictionary settings:', error);
    alert('Failed to save dictionary settings');
  }
}

function setupDictionaryEventListeners() {
  // Dictionary save button
  $('dictionary-save-btn')?.addEventListener('click', saveDictionarySettings);

  // Dictionary reset button
  $('dictionary-reset-btn')?.addEventListener('click', () => {
    const textarea = $('dictionary-textarea') as HTMLTextAreaElement;
    if (textarea && confirm('Are you sure you want to reset the dictionary?')) {
      loadDictionarySettings();
    }
  });

  // View Dictionary button in home page sidebar
  const viewDictionaryBtn = $('view-dictionary-btn');
  viewDictionaryBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('View Dictionary button clicked!');
    showDictionaryPage();
  });
}

function setupNotesEventListeners() {
  // Notes finish button - save and clear textarea, then refresh list
  $('notes-finish-btn')?.addEventListener('click', () => {
    const textarea = $('notes-textarea') as HTMLTextAreaElement;
    if (textarea && textarea.value.trim()) {
      saveNote(textarea.value);
      textarea.value = '';
      renderNotesList();
      console.log('Note saved successfully!');
    }
  });

  // Notes record button
  $('notes-record-btn')?.addEventListener('click', toggleNotesRecording);

  // View Notes button in home page sidebar
  const viewNotesBtn = $('view-notes-btn');
  console.log('View Notes button:', viewNotesBtn);
  viewNotesBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('View Notes button clicked!');
    showNotesPage();
  });

  // View Recordings button in home page sidebar
  const viewRecordingsBtn = $('view-recordings-btn');
  console.log('View Recordings button:', viewRecordingsBtn);
  viewRecordingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('View Recordings button clicked!');
    showRecordingsPage();
  });

  // Handle click on first nav item (Home)
  const navItems = document.querySelectorAll('.flow-nav-item');
  if (navItems.length > 0) {
    navItems[0].addEventListener('click', (e) => {
      e.preventDefault();
      showHomePage();
    });
  }

  // Refresh button
  $('notes-refresh-btn')?.addEventListener('click', () => {
    renderNotesList();
  });

  // Recordings refresh button
  $('recordings-refresh-btn')?.addEventListener('click', () => {
    renderRecordingsList();
  });
}

// Make functions globally accessible for navigation
(window as any).showNotesPage = showNotesPage;
(window as any).showRecordingsPage = showRecordingsPage;
(window as any).showHomePage = showHomePage;
(window as any).showSettingsPage = showSettingsPage;

// Start the app
init();
setupEventListeners();
setupNotesEventListeners();
setupDictionaryEventListeners();
setupSettingsEventListeners();
renderAttachmentList();
renderTranscriptionHistory();
updateFlowStats();

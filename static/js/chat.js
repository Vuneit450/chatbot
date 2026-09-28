(function () {
  const chatEl = document.getElementById('chat');
  const quickRepliesEl = document.getElementById('quickReplies');
  const composerEl = document.getElementById('composer');
  const inputEl = document.getElementById('messageInput');
  const sendBtn = composerEl.querySelector('.send-btn');
  const restartBtn = document.getElementById('restartBtn');

  const STORAGE_KEY = 'oreo-transcript-v1';
  let busy = false;

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function formatLine(line) {
    let out = escapeHtml(line);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    return out;
  }

  function loadTranscript() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTranscript(transcript) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transcript));
    } catch (e) {
      // sessionStorage no disponible (modo privado, etc.): la conversación
      // sigue funcionando, solo no sobrevive a un reload.
    }
  }

  function appendBubble(role, lines) {
    const msg = document.createElement('div');
    msg.className = `msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = lines.map(formatLine).join('\n');
    msg.appendChild(bubble);
    chatEl.appendChild(msg);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function showTyping() {
    const msg = document.createElement('div');
    msg.className = 'msg bot typing';
    msg.id = 'typingIndicator';
    msg.innerHTML = '<div class="bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    chatEl.appendChild(msg);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  function renderQuickReplies(options) {
    quickRepliesEl.innerHTML = '';
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (opt.value === '*' ? ' primary' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', () => sendMessage(opt.value, opt.label));
      quickRepliesEl.appendChild(btn);
    });
  }

  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    inputEl.disabled = state;
  }

  function applyBotPayload(payload, transcript) {
    appendBubble('bot', payload.lines);
    renderQuickReplies(payload.options);
    transcript.push({ role: 'bot', lines: payload.lines, options: payload.options });
    saveTranscript(transcript);
  }

  async function sendMessage(value, displayText) {
    if (busy || !value) return;
    const transcript = loadTranscript();
    appendBubble('user', [displayText != null ? displayText : value]);
    transcript.push({ role: 'user', lines: [displayText != null ? displayText : value] });
    saveTranscript(transcript);
    quickRepliesEl.innerHTML = '';
    inputEl.value = '';
    setBusy(true);
    showTyping();
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value }),
      });
      const payload = await res.json();
      hideTyping();
      applyBotPayload(payload, transcript);
    } catch (err) {
      hideTyping();
      appendBubble('bot', ['⚠️ No pude conectar con el servidor. Intenta de nuevo.']);
    } finally {
      setBusy(false);
      inputEl.focus();
    }
  }

  composerEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = inputEl.value.trim();
    if (value) sendMessage(value, value);
  });

  restartBtn.addEventListener('click', async () => {
    if (busy) return;
    saveTranscript([]);
    chatEl.innerHTML = '';
    quickRepliesEl.innerHTML = '';
    setBusy(true);
    try {
      const res = await fetch('/api/start', { method: 'POST' });
      const payload = await res.json();
      applyBotPayload(payload, []);
    } finally {
      setBusy(false);
    }
  });

  async function init() {
    const stored = loadTranscript();
    if (stored.length) {
      stored.forEach((entry) => {
        appendBubble(entry.role, entry.lines);
        if (entry.role === 'bot' && entry.options) renderQuickReplies(entry.options);
      });
      chatEl.scrollTop = chatEl.scrollHeight;
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/state');
      const payload = await res.json();
      applyBotPayload(payload, []);
    } finally {
      setBusy(false);
    }
  }

  init();
})();

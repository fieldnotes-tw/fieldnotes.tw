// Lightweight rich text: line breaks, **bold**, --- dividers, emojis pass through.
const RICH_EMOJIS = ['🌿', '🌸', '🍂', '🐦', '🦋', '🐸', '☀️', '🌧️', '🌈', '📍', '✨', '🔎', '👀', '🌳', '🍃', '🪷', '🐛', '🦎', '🍄', '😊'];

function escapeRichHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function applyInlineRich(text) {
  return escapeRichHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderRichText(text) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;

  const blocks = String(text).split(/\n\n+/);
  blocks.forEach((block) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    const lines = trimmed.split('\n');
    const parts = [];
    let paragraph = [];

    lines.forEach((line) => {
      const content = line.trim();
      if (content === '---') {
        if (paragraph.length) {
          parts.push({ type: 'p', lines: paragraph });
          paragraph = [];
        }
        parts.push({ type: 'hr' });
        return;
      }
      paragraph.push(content);
    });

    if (paragraph.length) {
      parts.push({ type: 'p', lines: paragraph });
    }

    parts.forEach((part) => {
      if (part.type === 'hr') {
        const hr = document.createElement('hr');
        hr.className = 'rich-text__rule';
        fragment.appendChild(hr);
        return;
      }
      const p = document.createElement('p');
      part.lines.forEach((line, index) => {
        if (index > 0) p.appendChild(document.createElement('br'));
        const span = document.createElement('span');
        span.innerHTML = applyInlineRich(line);
        p.appendChild(span);
      });
      fragment.appendChild(p);
    });
  });

  return fragment;
}

function mountRichPreview(source, target) {
  if (!source || !target) return;
  const sync = () => {
    target.replaceChildren(renderRichText(source.value));
  };
  source.addEventListener('input', sync);
  sync();
}

function richLabel(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function insertIntoTextarea(textarea, { before = '', after = '', placeholder = '' }) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const insert = selected || placeholder;
  textarea.value = value.slice(0, start) + before + insert + after + value.slice(end);

  const cursorStart = start + before.length;
  const cursorEnd = cursorStart + insert.length;
  textarea.focus();
  if (selected) {
    textarea.setSelectionRange(cursorStart + insert.length + after.length, cursorStart + insert.length + after.length);
  } else {
    textarea.setSelectionRange(cursorStart, cursorEnd);
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertLineBreak(textarea) {
  insertIntoTextarea(textarea, { before: '\n' });
}

function insertBold(textarea) {
  insertIntoTextarea(textarea, { before: '**', after: '**', placeholder: richLabel('format.tool.boldPlaceholder', '粗體') });
}

function insertDivider(textarea) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const value = textarea.value;
  const needsLead = start > 0 && value[start - 1] !== '\n';
  const needsTail = end < value.length && value[end] !== '\n';
  const snippet = `${needsLead ? '\n' : ''}---${needsTail ? '\n' : ''}`;
  insertIntoTextarea(textarea, { before: snippet });
}

function insertEmoji(textarea, emoji) {
  insertIntoTextarea(textarea, { before: emoji });
}

function buildToolbarButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rich-field__btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function buildEmojiPicker(textarea, wrap) {
  const emojiBtn = buildToolbarButton(
    richLabel('format.tool.emoji', 'Emoji'),
    () => wrap.classList.toggle('is-emoji-open'),
  );
  emojiBtn.setAttribute('aria-expanded', 'false');
  emojiBtn.setAttribute('aria-haspopup', 'true');

  const panel = document.createElement('div');
  panel.className = 'rich-field__emoji-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'menu');

  RICH_EMOJIS.forEach((emoji) => {
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'rich-field__emoji';
    pick.textContent = emoji;
    pick.setAttribute('role', 'menuitem');
    pick.addEventListener('click', () => {
      insertEmoji(textarea, emoji);
      wrap.classList.remove('is-emoji-open');
      panel.hidden = true;
      emojiBtn.setAttribute('aria-expanded', 'false');
    });
    panel.appendChild(pick);
  });

  emojiBtn.addEventListener('click', () => {
    const open = wrap.classList.contains('is-emoji-open');
    panel.hidden = !open;
    emojiBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove('is-emoji-open');
      panel.hidden = true;
      emojiBtn.setAttribute('aria-expanded', 'false');
    }
  });

  return { emojiBtn, panel };
}

function mountRichToolbar(textarea, toolbar) {
  if (!textarea || !toolbar || toolbar.dataset.richToolbar) return;
  toolbar.dataset.richToolbar = '1';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', richLabel('format.toolbar', '文字格式'));

  const wrap = toolbar.closest('.rich-field') || toolbar.parentElement;

  toolbar.append(
    buildToolbarButton(richLabel('format.tool.lineBreak', '換行'), () => insertLineBreak(textarea)),
    buildToolbarButton(richLabel('format.tool.bold', '粗體'), () => insertBold(textarea)),
    buildToolbarButton(richLabel('format.tool.divider', '分隔線'), () => insertDivider(textarea)),
  );

  const { emojiBtn, panel } = buildEmojiPicker(textarea, wrap);
  toolbar.appendChild(emojiBtn);
  wrap.appendChild(panel);
}

function mountRichField(textarea, preview) {
  if (!textarea) return;

  const field = textarea.closest('.rich-field');
  const toolbar = field?.querySelector('.rich-field__toolbar');
  if (toolbar) mountRichToolbar(textarea, toolbar);
  if (preview) mountRichPreview(textarea, preview);
}

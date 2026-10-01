// Petits outils DOM partagés par tous les panneaux.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs ?? {}).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // réservé aux icônes SVG internes
    else el.setAttribute(k, v === true ? '' : v);
  });
  children.flat(Infinity).forEach((c) => {
    if (c == null || c === false) return;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return el;
}

const PATHS = {
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  grip: '<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  palette: '<rect x="3" y="4" width="7" height="7" rx="2"/><rect x="14" y="4" width="7" height="7" rx="2"/><rect x="3" y="13" width="7" height="7" rx="2"/><path d="M17.5 13v7M14 16.5h7"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  melody: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  tools: '<path d="M4 20h16M7 16V9M12 16V5M17 16v-4"/>',
  arrowLeft: '<path d="M15 6l-6 6 6 6"/>',
  arrowRight: '<path d="M9 6l6 6-6 6"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 0 1 4 0"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

export function icon(name) {
  const span = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  span.setAttribute('class', 'icon');
  span.setAttribute('viewBox', '0 0 24 24');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = PATHS[name] ?? '';
  return span;
}

export function iconButton(name, label, onClick, extra = {}) {
  return h('button', { class: `icon-btn ${extra.class ?? ''}`, 'aria-label': label, title: label, onClick, ...extra.attrs }, icon(name));
}

/** Contrôle segmenté. options : [{value,label}] */
export function segmented(options, value, onChange, { full = false, label = '' } = {}) {
  return h('div', { class: `seg${full ? ' full' : ''}`, role: 'group', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button',
      'aria-pressed': String(o.value === value),
      title: o.title ?? null,
      onClick: () => o.value !== value && onChange(o.value),
    }, o.label)));
}

export function pills(options, value, onChange) {
  return h('div', { class: 'pills' }, options.map((o) => h('button', {
    type: 'button', class: 'pill', 'aria-pressed': String(o.value === value), onClick: () => onChange(o.value),
  }, o.label, o.hint ? h('small', {}, o.hint) : null)));
}

/** Curseur : met à jour l'affichage pendant le glissé, valide au relâchement. */
export function slider({ label, value, min = 0, max = 1, step = 0.01, format = (v) => `${Math.round(v * 100)} %`, ends, onCommit }) {
  const out = h('output', {}, format(value));
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
  const paint = () => input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
  paint();
  input.addEventListener('input', () => {
    out.textContent = format(Number(input.value));
    paint();
  });
  input.addEventListener('change', () => onCommit(Number(input.value)));
  return h('div', { class: 'field' },
    h('div', { class: 'field-row' }, h('span', {}, label), out),
    input,
    ends ? h('div', { class: 'range-ends' }, h('span', {}, ends[0]), h('span', {}, ends[1])) : null);
}

export function toggle(label, checked, onChange, hint = '') {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'toggle' }, h('span', {}, label, hint ? h('small', {}, hint) : null), input);
}

export function section(title, note, ...children) {
  return h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h3', {}, title), note ? h('span', { class: 'note' }, note) : null),
    ...children);
}

let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 1900);
}

/** Remplace le contenu d'un conteneur en conservant la position de défilement. */
export function mount(container, ...nodes) {
  const scroll = container.scrollTop;
  container.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
  container.scrollTop = scroll;
}

// Les polices d'affichage n'ont pas de ♭/♯ : on les compose avec la police d'interface.
export function sym(text) {
  return h('span', {}, String(text).split(/([♭♯𝄫𝄪])/).filter(Boolean)
    .map((part) => (/[♭♯𝄫𝄪]/.test(part) ? h('span', { class: 'acc' }, part) : part)));
}

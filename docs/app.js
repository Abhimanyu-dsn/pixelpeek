(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- reveal on scroll, and run animations only while visible ---------- */
  const reveal = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach((el) => reveal.observe(el));

  const visible = new Map();
  const live = new IntersectionObserver((entries) => {
    for (const e of entries) {
      visible.set(e.target, e.isIntersecting);
      if (e.target.classList.contains('anim')) e.target.classList.toggle('on', e.isIntersecting);
    }
  }, { threshold: 0.2 });
  $$('.anim, #heroDemo, #respDemo, #codeDemo').forEach((el) => live.observe(el));
  const whenVisible = async (el) => { while (!visible.get(el)) await sleep(250); };

  /* ---------- colour helpers ---------- */
  const rgbOf = (css) => { const m = css.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
  const toHex = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgBehind = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(rgbOf).filter(Boolean);
      if (stops.length) return stops;
      const c = rgbOf(cs.backgroundColor);
      if (c && c.a > 0) return [c];
    }
    return [{ r: 255, g: 255, b: 255, a: 1 }];
  };
  const worstRatio = (el) => {
    const fg = rgbOf(getComputedStyle(el).color);
    return Math.min(...bgBehind(el).map((bg) => ratio(fg, bg)));
  };

  /* ---------- hero demo: a live, scripted inspector ---------- */
  const heroBody = $('#heroBody');
  const mini = $('#heroMini');
  mini.innerHTML = `
    <div class="m-nav"><b>Acme</b><span>Product</span><span>Pricing</span><span>Docs</span><span class="m-cta">Get started</span></div>
    <div class="m-hero"><h3 class="m-title" data-label="h1.title" data-tag="h1">Design faster,<br>ship cleaner</h3><p class="m-sub">Everything your team needs, in one place.</p><span class="m-btn" data-label="button.btn" data-tag="button">Start free</span><span class="m-btn2">Book a demo</span></div>
    <div class="m-grid">
      <div class="m-card" id="mCardA" data-label="div.card" data-tag="div"><div class="m-img"></div><span class="m-badge">New</span><h6>Components</h6><p>Reusable pieces that keep your product consistent.</p></div>
      <div class="m-card"><div class="m-img"></div><span class="m-badge">Beta</span><h6>Tokens</h6><p>Colours, type and spacing, defined once.</p></div>
      <div class="m-card"><div class="m-img"></div><span class="m-badge">Pro</span><h6>Handoff</h6><p>Specs your developers can use right away.</p></div>
    </div>`;
  const dOutline = $('#dOutline'), dChip = $('#dChip'), dCard = $('#dCard'), dPanel = $('#dPanel'), dPill = $('#dPill'), dCursor = $('#dCursor');

  const pos = (el) => { let x = 0, y = 0, n = el; while (n && n !== heroBody) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
  const cssHex = (el, prop) => { const c = rgbOf(getComputedStyle(el)[prop]); return c && c.a > 0 ? toHex(c) : null; };
  const firstFont = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();

  function showCard(el) {
    const r = pos(el), cs = getComputedStyle(el);
    const fill = cssHex(el, 'backgroundColor') || toHex(bgBehind(el)[0]);
    const text = cssHex(el, 'color');
    const cr = worstRatio(el);
    const pad = cs.padding.split(' ').map((v) => parseFloat(v)).join(' ');
    dCard.innerHTML = `
      <div class="hd"><b>${el.dataset.label}</b><span>${r.w} × ${r.h}</span></div>
      <div class="rw"><span>Font</span><b>${firstFont(el)} · ${parseFloat(cs.fontSize)}px · ${cs.fontWeight}</b></div>
      <div class="rw"><span>Text</span><b><i style="background:${text}"></i>${text} <span class="${cr >= 4.5 ? 'ok' : ''}">${cr.toFixed(1)}:1</span></b></div>
      <div class="rw"><span>Fill</span><b><i style="background:${fill}"></i>${fill}</b></div>
      <div class="rw"><span>Padding</span><b>${pad}</b></div>
      <div class="rw"><span>Radius</span><b>${parseFloat(cs.borderTopLeftRadius)}px</b></div>
      <div class="ft">Click to select · <kbd>F</kbd> Figma · <kbd>S</kbd> Save</div>`;
    const cw = 218, ch = 168, bw = heroBody.clientWidth, bh = heroBody.clientHeight;
    let x = Math.min(Math.max(8, r.x), bw - cw - 8);
    let y = r.y + r.h + 10;
    if (y + ch > bh - 8) y = Math.max(8, r.y - ch - 28);
    dCard.style.left = `${x}px`; dCard.style.top = `${y}px`;
    dCard.classList.add('on');
  }
  function outlineOn(el, locked) {
    const r = pos(el);
    Object.assign(dOutline.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w - 4}px`, height: `${r.h - 4}px`, opacity: 1 });
    dOutline.classList.toggle('locked', !!locked);
    dChip.textContent = `${el.dataset.tag} · ${r.w} × ${r.h}`;
    dChip.style.left = `${r.x}px`; dChip.style.top = `${Math.max(2, r.y - 22)}px`; dChip.style.opacity = 1;
  }
  const outlineOff = () => { dOutline.style.opacity = 0; dChip.style.opacity = 0; dOutline.classList.remove('locked'); };
  const moveCursor = (el, dx = 0.5, dy = 0.55) => { const r = pos(el); dCursor.style.transform = `translate(${r.x + r.w * dx}px, ${r.y + r.h * dy}px)`; };

  function buildPanel(el) {
    const found = new Map();
    const add = (c, role) => { if (c) found.set(c, found.get(c) || role); };
    for (const n of [el, ...el.querySelectorAll('*')]) {
      const cs = getComputedStyle(n);
      const bg = rgbOf(cs.backgroundColor); if (bg && bg.a > 0) add(toHex(bg), 'fill');
      const bc = rgbOf(cs.borderTopColor); if (bc && parseFloat(cs.borderTopWidth) > 0) add(toHex(bc), 'border');
      if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) add(toHex(rgbOf(cs.color)), 'text');
    }
    const r = pos(el);
    const swatches = [...found].slice(0, 6).map(([hex, role], i) => `<div style="--i:${i}"><i style="background:${hex}"></i>${hex}<span style="font:400 8.5px var(--font);color:#626F86">${role}</span></div>`).join('');
    const ico = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="#44546F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    dPanel.innerHTML = `
      <div class="p-tools"><i>${ico('<path d="M4 4l7 17 2.5-7.5L21 11z"/>')}</i><i>${ico('<rect x="7" y="2" width="10" height="20" rx="2"/>')}</i><i>${ico('<path d="M6 3h12v18l-6-4-6 4z"/>')}</i><i><svg viewBox="0 0 38 57"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83"/><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262"/><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#A259FF"/></svg></i></div>
      <div class="p-sel">#card-a<span>${r.w} × ${r.h}</span></div>
      <div class="p-tabs"><i>Styles</i><i>Figma</i><i>Assets</i><i>System</i></div>
      <div class="p-h">Colors · ${found.size}</div>
      <div class="p-sw">${swatches}</div>`;
  }

  async function heroLoop() {
    const btn = $('.m-btn', mini), title = $('.m-title', mini), cardEl = $('#mCardA', mini);
    const hoverStep = async (el, hold) => {
      moveCursor(el); await sleep(750);
      outlineOn(el); showCard(el); await sleep(hold);
      dCard.classList.remove('on'); await sleep(260);
    };
    while (true) {
      await whenVisible($('#heroDemo'));
      dPill.classList.remove('off');
      await sleep(600);
      await hoverStep(btn, 2400);
      await hoverStep(title, 2200);
      // select a whole card
      moveCursor(cardEl, 0.3, 0.12); await sleep(800);
      outlineOn(cardEl); showCard(cardEl); await sleep(1300);
      dCursor.classList.add('click'); await sleep(180);
      dCard.classList.remove('on'); outlineOn(cardEl, true);
      dPill.classList.add('off'); buildPanel(cardEl); dPanel.classList.add('on');
      await sleep(180); dCursor.classList.remove('click');
      await sleep(4600);
      dPanel.classList.remove('on'); outlineOff(); await sleep(700);
    }
  }
  if (reduced) {
    const cardEl = $('#mCardA', mini);
    buildPanel(cardEl); dPanel.classList.add('on'); dPill.classList.add('off'); outlineOn(cardEl, true);
    dPanel.querySelectorAll('.p-sw div').forEach((d) => { d.style.opacity = 1; d.style.transform = 'none'; });
  } else {
    heroLoop();
  }

  /* ---------- colours demo: swatches built from the card's own computed colours ---------- */
  (() => {
    const card = $('.cd-card'), out = $('#cdSwatches');
    const picks = [
      [card, 'backgroundColor', 'fill'], [card, 'borderTopColor', 'border'], [$('.cd-img', card), 'backgroundColor', 'fill'],
      [$('.cd-badge', card), 'backgroundColor', 'fill'], [$('.cd-badge', card), 'color', 'text'], [$('h4', card), 'color', 'text'],
    ];
    const seen = new Set(); let i = 0;
    out.innerHTML = picks.map(([el, prop, role]) => {
      const hex = toHex(rgbOf(getComputedStyle(el)[prop]));
      if (seen.has(hex)) return '';
      seen.add(hex);
      return `<div class="cd-sw" style="--i:${i++}"><i style="background:${hex}"></i><b>${hex}</b><small>${role}</small></div>`;
    }).join('');
  })();

  /* ---------- contrast counter ---------- */
  (() => {
    const el = $('#ctNum'), box = $('#contrastDemo');
    const target = Math.min(...bgBehind($('.ct-sample span')).map((bg) => ratio({ r: 255, g: 255, b: 255 }, bg)));
    if (reduced) { el.textContent = target.toFixed(2); return; }
    (async () => {
      while (true) {
        await whenVisible(box);
        const t0 = performance.now();
        await new Promise((res) => {
          const tick = (now) => {
            const p = Math.min(1, (now - t0) / 1300);
            el.textContent = (1 + (target - 1) * (1 - (1 - p) ** 3)).toFixed(2);
            p < 1 ? requestAnimationFrame(tick) : res();
          };
          requestAnimationFrame(tick);
        });
        await sleep(2700);
        el.textContent = '1.00';
      }
    })();
  })();

  /* ---------- responsive demo ---------- */
  (() => {
    const root = $('#respDemo'), frame = $('#rFrame'), chips = $$('#respChips button'), stage = $('.resp-stage', root);
    const name = $('#rName'), note = $('#rNote');
    const apply = (i) => {
      const b = chips[i], w = +b.dataset.w, h = +b.dataset.h;
      chips.forEach((c) => c.classList.toggle('on', c === b));
      frame.style.width = `${w}px`; frame.style.height = `${h}px`;
      frame.classList.toggle('big', w >= 800);
      const s = Math.min(1, (stage.clientWidth - 16) / w, (stage.clientHeight - 8) / h);
      frame.style.setProperty('--s', s.toFixed(3));
      name.textContent = b.dataset.name;
      note.textContent = b.dataset.note;
      note.classList.toggle('on', !!b.dataset.note);
    };
    apply(0);
    addEventListener('resize', () => apply(Math.max(0, chips.findIndex((c) => c.classList.contains('on')))));
    if (reduced) return;
    (async () => {
      let i = 0;
      while (true) {
        await whenVisible(root);
        await sleep(3000);
        i = (i + 1) % chips.length;
        apply(i);
      }
    })();
  })();

  /* ---------- code demo: typed output, cycling tabs ---------- */
  (() => {
    const root = $('#codeDemo'), out = $('#codeOut'), tabs = $$('#codeTabs button');
    const tw = ['inline-block', 'px-5', 'py-3', 'font-sans', 'text-[15px]', 'font-semibold', 'text-center', 'text-[#FFFFFF]', 'bg-[#0C66E4]', 'rounded-lg'];
    const css = `font-family: Arial;
font-size: 15px;
font-weight: 600;
color: rgb(255, 255, 255);
background-color: rgb(12, 102, 228);
border-radius: 8px;
padding: 12px 20px;`;
    const ai = `Recreate this UI element as a React component styled with Tailwind CSS. Match the values below exactly.

Element: <button> (button.btn)
Size: 106 × 41px
Tailwind classes:
inline-block px-5 py-3 font-sans text-[15px] font-semibold bg-[#0C66E4] rounded-lg`;
    const tokens = `:root {
  --brand-500: #0c66e4;
  --surface: #ffffff;
  --radius-md: 8px;
  --space-4: 16px;
}
.dark {
  --brand-500: #579dff;
  --surface: #0d1117;
}`;
    const paint = (text) => text.replace(/^([a-z-]+):/gm, '<span class="k">$1</span>:').replace(/(--[a-z0-9-]+)/g, '<span class="k">$1</span>').replace(/(#[0-9a-fA-F]{3,8}|\b\d+px|rgb\([^)]*\))/g, '<span class="v">$1</span>');
    const show = (i) => tabs.forEach((t, n) => t.classList.toggle('on', n === i));
    const render = (i, full) => {
      if (i === 0) { out.innerHTML = tw.slice(0, full).map((c) => `<span class="tw">${c}</span>`).join('') + '<span class="caret"></span>'; return; }
      const text = [null, css, ai, tokens][i];
      out.innerHTML = (full >= text.length ? paint(text.replace(/&/g, '&amp;').replace(/</g, '&lt;')) : text.slice(0, full).replace(/&/g, '&amp;').replace(/</g, '&lt;')) + '<span class="caret"></span>';
    };
    if (reduced) { show(0); render(0, tw.length); return; }
    (async () => {
      let i = 0;
      while (true) {
        await whenVisible(root);
        show(i);
        const total = i === 0 ? tw.length : [null, css, ai, tokens][i].length;
        const step = i === 0 ? 1 : 2;
        for (let n = 0; n <= total; n += step) { render(i, n); await sleep(i === 0 ? 170 : 16); }
        render(i, total);
        await sleep(2600);
        i = (i + 1) % tabs.length;
      }
    })();
  })();

  /* ---------- copy button + toast ---------- */
  const toast = $('#toast');
  $$('.copy-btn').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast.textContent = 'Copied. Paste it in a new tab.'; }
    catch { toast.textContent = 'Type chrome://extensions in the address bar'; }
    toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), 2200);
  }));
})();

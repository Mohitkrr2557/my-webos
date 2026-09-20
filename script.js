/* ============================================================
   AURORA OS — main script
   Window manager, dock, apps, spotlight, control center…
   Pure game/fs logic lives in core.js (window.Core)
   ============================================================ */
'use strict';

const Core = window.Core;
const $ = (id) => document.getElementById(id);
const MENUBAR = 34;

/* ============================================================
   Persistence
   ============================================================ */
const store = {
    get(k, d) { try { const v = localStorage.getItem('auroraos:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('auroraos:' + k, JSON.stringify(v)); } catch { } },
    del(k) { try { localStorage.removeItem('auroraos:' + k); } catch { } },
};

/* ============================================================
   Theme data
   ============================================================ */
const ACCENTS = {
    teal:    { c: '#5eead4', soft: 'rgba(94,234,212,0.20)' },
    violet:  { c: '#a78bfa', soft: 'rgba(167,139,250,0.20)' },
    pink:    { c: '#f9a8d4', soft: 'rgba(249,168,212,0.22)' },
    blue:    { c: '#7dd3fc', soft: 'rgba(125,211,252,0.22)' },
    amber:   { c: '#fcd34d', soft: 'rgba(252,211,77,0.22)' },
    green:   { c: '#86efac', soft: 'rgba(134,239,172,0.22)' },
};
const WALLPAPERS = [
    { id: 'aurora', name: 'Aurora Night',      file: 'wallpapers/aurora.jpg' },
    { id: 'glass',  name: 'Iridescent Glass',  file: 'wallpapers/glass.jpg' },
    { id: 'nebula', name: 'Deep Nebula',       file: 'wallpapers/nebula.jpg' },
    { id: 'frost',  name: 'Frost Crystal',     file: 'wallpapers/frost.jpg' },
    { id: 'sunset', name: 'Dusk Hills',        file: 'wallpapers/sunset.jpg' },
    { id: 'dunes',  name: 'Morning Dunes',     file: 'wallpapers/dunes.jpg' },
];

/* ============================================================
   OS state
   ============================================================ */
const OS = {
    user: store.get('user', { name: '', avatar: '🦊' }),
    settings: Object.assign(
        { dark: true, accent: 'teal', wallpaper: 'aurora', brightness: 1, volume: 0.65, nightLight: false },
        store.get('settings', {})
    ),
    startTime: Date.now(),
    desktopReady: false,
};
const WM = { wins: new Map(), z: 100, focused: null };

/* virtual file system */
let FS = store.get('fs', null);
if (!FS) { FS = Core.defaultFS(); store.set('fs', FS); }
function saveFS() { store.set('fs', FS); }

function trashNode() {
    if (!FS.children['Trash']) FS.children['Trash'] = { type: 'folder', children: {} };
    return FS.children['Trash'];
}

/* ============================================================
   Small helpers
   ============================================================ */
function pad2(n) { return String(n).padStart(2, '0'); }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function notify(icon, title, msg, ms = 4500) {
    const box = $('toasts');
    if (box.children.length > 4) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-body"><div class="toast-title">${Core.esc(title)}</div><div class="toast-msg">${Core.esc(msg || '')}</div></div>`;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, ms);
}

/* ---------- modal dialogs (Promise-based) ---------- */
let modalBusy = false;
function openModal({ title, msg, input, def = '', ok = 'OK', danger = false }) {
    return new Promise((resolve) => {
        if (modalBusy) { resolve(null); return; }
        modalBusy = true;
        const ov = $('modal-overlay');
        $('modal-title').textContent = title;
        const msgEl = $('modal-msg'), inEl = $('modal-input');
        msgEl.classList.toggle('hidden', !msg);
        msgEl.textContent = msg || '';
        inEl.classList.toggle('hidden', !input);
        inEl.value = def;
        inEl.placeholder = input || '';
        const okBtn = $('modal-ok');
        okBtn.textContent = ok;
        okBtn.classList.toggle('danger', danger);
        ov.classList.remove('hidden');
        setTimeout(() => (input ? inEl : okBtn).focus(), 30);

        function done(v) {
            ov.classList.add('hidden');
            modalBusy = false;
            $('modal-ok').onclick = $('modal-cancel').onclick = inEl.onkeydown = null;
            resolve(v);
        }
        $('modal-ok').onclick = () => done(input ? (inEl.value.trim() || null) : true);
        $('modal-cancel').onclick = () => done(input ? null : false);
        inEl.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); $('modal-ok').onclick(); }
            if (e.key === 'Escape') { e.preventDefault(); $('modal-cancel').onclick(); }
        };
        ov.onclick = (e) => { if (e.target === ov) $('modal-cancel').onclick(); };
    });
}
const dialogPrompt = (title, def = '') => openModal({ title, input: 'file name', def });
const dialogConfirm = (title, msg, ok = 'Confirm') => openModal({ title, msg, ok });

/* ---------- context menu ---------- */
function showContextMenu(x, y, items) {
    const cm = $('context-menu');
    cm.innerHTML = '';
    items.forEach((it) => {
        if (it === 'sep') {
            const s = document.createElement('div');
            s.className = 'menu-sep';
            cm.appendChild(s);
            return;
        }
        const b = document.createElement('button');
        b.className = 'menu-item' + (it.danger ? ' danger' : '');
        b.innerHTML = `<span>${it.icon ? it.icon + '&nbsp;&nbsp;' : ''}${Core.esc(it.label)}</span>${it.hint ? `<span class="mi-hint">${Core.esc(it.hint)}</span>` : ''}`;
        b.onclick = () => { hideAllMenus(); it.action && it.action(); };
        cm.appendChild(b);
    });
    cm.classList.remove('hidden');
    const r = cm.getBoundingClientRect();
    cm.style.left = Core.clamp(x, 6, innerWidth - r.width - 6) + 'px';
    cm.style.top = Core.clamp(y, MENUBAR + 4, innerHeight - r.height - 6) + 'px';
}

function hideAllMenus() {
    ['mb-menu', 'clock-pop', 'control-center', 'context-menu'].forEach((id) => $(id).classList.add('hidden'));
}

/* ============================================================
   Settings application
   ============================================================ */
function applySettings() {
    const b = document.body;
    b.classList.toggle('dark', OS.settings.dark);
    b.classList.toggle('light', !OS.settings.dark);
    const a = ACCENTS[OS.settings.accent] || ACCENTS.teal;
    b.style.setProperty('--accent', a.c);
    b.style.setProperty('--accent-soft', a.soft);
    const wp = WALLPAPERS.find((w) => w.id === OS.settings.wallpaper) || WALLPAPERS[0];
    $('wallpaper').style.backgroundImage = `url("${wp.file}")`;
    $('login-screen').style.backgroundImage = `url("${wp.file}")`;
    $('brightness-overlay').style.opacity = String((1 - OS.settings.brightness) * 0.82);
    $('night-overlay').classList.toggle('hidden', !OS.settings.nightLight);
    store.set('settings', OS.settings);
}
function setWallpaper(id) {
    OS.settings.wallpaper = id;
    applySettings();
}
function nextWallpaper() {
    const i = WALLPAPERS.findIndex((w) => w.id === OS.settings.wallpaper);
    setWallpaper(WALLPAPERS[(i + 1) % WALLPAPERS.length].id);
    notify('🖼', 'Wallpaper changed', (WALLPAPERS.find((w) => w.id === OS.settings.wallpaper) || WALLPAPERS[0]).name);
}
function setAccent(name) {
    if (!ACCENTS[name]) return;
    OS.settings.accent = name;
    applySettings();
    refreshSettingsWindows();
}
function toggleDark() {
    OS.settings.dark = !OS.settings.dark;
    applySettings();
    refreshSettingsWindows();
}

/* ============================================================
   Boot / Login / Power
   ============================================================ */
function runBoot(cb) {
    const bs = $('boot-screen');
    bs.classList.remove('hidden');
    void bs.offsetWidth; /* restart animations */
    requestAnimationFrame(() => bs.classList.remove('fade-out'));
    const fill = $('boot-fill');
    fill.style.width = '0%';
    const steps = [
        ['Initializing kernel…', 14],
        ['Mounting virtual file system…', 36],
        ['Waking the aurora…', 62],
        ['Calibrating glass panels…', 85],
        ['Ready.', 100],
    ];
    steps.forEach(([txt, w], i) => setTimeout(() => {
        $('boot-status').textContent = txt;
        fill.style.width = w + '%';
    }, 320 + i * 470));
    setTimeout(() => {
        bs.classList.add('fade-out');
        setTimeout(() => { bs.classList.add('hidden'); cb(); }, 600);
    }, 320 + steps.length * 470 + 350);
}

function updateLoginClock() {
    const now = new Date();
    const ls = $('login-screen');
    if (ls.classList.contains('hidden')) return;
    $('login-time').textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    $('login-date').textContent = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

const AVATARS = ['🦊', '🐻', '🐼', '🦉', '🐧', '🐳', '🦄', '🐸', '🦜', '🐙'];
function showLogin(locked = false) {
    const ls = $('login-screen');
    ls.classList.remove('hidden', 'fade-out', 'locked');
    if (locked) ls.classList.add('locked');
    $('login-avatar').textContent = OS.user.avatar || '🦊';
    $('login-name').value = OS.user.name || '';
    if (!locked) {
        const row = $('avatar-row');
        row.innerHTML = '';
        AVATARS.forEach((a) => {
            const b = document.createElement('button');
            b.className = 'avatar-pill' + (a === OS.user.avatar ? ' sel' : '');
            b.textContent = a;
            b.onclick = () => {
                OS.user.avatar = a;
                store.set('user', OS.user);
                $('login-avatar').textContent = a;
                row.querySelectorAll('.avatar-pill').forEach((p) => p.classList.remove('sel'));
                b.classList.add('sel');
            };
            row.appendChild(b);
        });
        $('login-btn').textContent = 'Log In';
        setTimeout(() => $('login-name').focus(), 60);
    } else {
        $('login-btn').textContent = 'Unlock';
    }
    updateLoginClock();
}

function doLogin() {
    if ($('login-screen').classList.contains('locked')) {
        $('login-screen').classList.add('fade-out');
        setTimeout(() => $('login-screen').classList.add('hidden'), 520);
        return;
    }
    const name = $('login-name').value.trim() || 'Explorer';
    OS.user.name = name;
    store.set('user', OS.user);
    $('login-screen').classList.add('fade-out');
    setTimeout(() => $('login-screen').classList.add('hidden'), 520);
    enterDesktop();
}

function enterDesktop() {
    const d = $('desktop');
    d.classList.remove('hidden');
    if (!OS.desktopReady) {
        OS.desktopReady = true;
        OS.startTime = Date.now();
        initDesktop();
    }
    playChime();
    if (!store.get('firstrun', false)) {
        store.set('firstrun', true);
        setTimeout(() => notify('✨', `Welcome, ${OS.user.name}!`, 'Aurora OS is ready. Try Ctrl+K for search, right-click the desktop, or open the Terminal and type “neofetch”.'), 700);
        setTimeout(() => openApp('about'), 1400);
    }
    if (innerWidth < 760) notify('📱', 'Small screen detected', 'Aurora OS is happiest on a larger screen.');
}

function closeAllWindows() {
    [...WM.wins.values()].forEach((w) => closeWin(w, true));
}
function restartOS() {
    closeAllWindows();
    hideAllMenus();
    $('desktop').classList.add('hidden');
    $('power-screen').classList.add('hidden');
    runBoot(() => showLogin(false));
}
function shutdownOS() {
    closeAllWindows();
    hideAllMenus();
    $('desktop').classList.add('hidden');
    $('power-screen').classList.remove('hidden');
}
function sleepOS() {
    hideAllMenus();
    const ov = $('sleep-overlay');
    ov.classList.remove('hidden');
    const wake = () => {
        ov.classList.add('hidden');
        ov.onclick = null;
        showLogin(true);
    };
    ov.onclick = wake;
}
function lockOS() {
    hideAllMenus();
    showLogin(true);
}

/* startup chime */
function playChime() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const g = ctx.createGain();
        g.gain.value = OS.settings.volume * 0.5;
        g.connect(ctx.destination);
        [[523.25, 0], [659.25, 0.11], [783.99, 0.22]].forEach(([f, t]) => {
            const o = ctx.createOscillator();
            const og = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = f;
            og.gain.setValueAtTime(0, ctx.currentTime + t);
            og.gain.linearRampToValueAtTime(0.28, ctx.currentTime + t + 0.03);
            og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.9);
            o.connect(og); og.connect(g);
            o.start(ctx.currentTime + t);
            o.stop(ctx.currentTime + t + 1);
        });
        setTimeout(() => ctx.close().catch(() => { }), 2500);
    } catch { /* audio not allowed */ }
}

/* ============================================================
   WINDOW MANAGER
   ============================================================ */
const layer = () => $('windows-layer');

function openApp(appId, opts = {}) {
    const app = APPS[appId];
    if (!app) return null;
    const key = opts.key || appId;
    if (WM.wins.has(key)) {
        const w = WM.wins.get(key);
        if (w.minimized) restoreWin(w);
        focusWin(w);
        return w;
    }
    const el = document.createElement('div');
    el.className = 'window opening' + (app.fixed ? ' fixed' : '');
    el.dataset.app = appId;
    const W = Math.min(app.w, innerWidth - 30);
    const H = Math.min(app.h, innerHeight - MENUBAR - 100);
    const n = WM.wins.size;
    const x = Core.clamp(Math.round((innerWidth - W) / 2) + (n % 6) * 34 - 85, 8, Math.max(8, innerWidth - W - 8));
    const y = Core.clamp(MENUBAR + 26 + (n % 6) * 26, MENUBAR + 6, Math.max(MENUBAR + 6, innerHeight - H - 96));
    el.style.cssText = `left:${x}px;top:${y}px;width:${W}px;height:${H}px;z-index:${++WM.z};`;
    el.innerHTML = `
        <div class="window-header">
            <div class="traffic">
                <button class="tl close" data-act="close" title="Close"><span>✕</span></button>
                <button class="tl min" data-act="min" title="Minimize"><span>–</span></button>
                <button class="tl max" data-act="max" title="Zoom"><span>＋</span></button>
            </div>
            <span class="window-title">${Core.esc(app.name)}</span>
        </div>
        <div class="window-content"></div>
        ${app.fixed ? '' : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => `<div class="rs rs-${d}" data-dir="${d}"></div>`).join('')}
    `;
    layer().appendChild(el);
    setTimeout(() => el.classList.remove('opening'), 320);

    const win = {
        el, id: appId, key, app, minimized: false, maxed: false, prev: null,
        cleanups: [], args: opts.args || {},
        setTitle(t) { el.querySelector('.window-title').textContent = t; },
        close() { closeWin(this); },
        refresh: null,
    };
    WM.wins.set(key, win);
    wireWindow(win);
    focusWin(win);
    updateDock();
    try { app.render(el.querySelector('.window-content'), win); } catch (err) { console.error(err); }
    return win;
}

function wireWindow(win) {
    const el = win.el;
    el.addEventListener('pointerdown', () => { if (WM.focused !== win) focusWin(win); });

    el.querySelectorAll('.tl').forEach((b) => {
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            const act = b.dataset.act;
            if (act === 'close') closeWin(win);
            else if (act === 'min') minimizeWin(win);
            else if (act === 'max') toggleMax(win);
        });
    });

    const header = el.querySelector('.window-header');
    header.addEventListener('dblclick', (e) => {
        if (!e.target.closest('.tl') && !win.app.fixed) toggleMax(win);
    });
    header.addEventListener('pointerdown', (e) => startDrag(e, win));

    el.querySelectorAll('.rs').forEach((h) => {
        h.addEventListener('pointerdown', (e) => startResize(e, win, h.dataset.dir));
    });
}

function startDrag(e, win) {
    if (e.button !== 0 || e.target.closest('.tl')) return;
    const el = win.el;
    let r = el.getBoundingClientRect();
    let offX = e.clientX - r.left;
    const offY = e.clientY - r.top;

    if (win.maxed) {
        /* un-zoom and continue dragging under the cursor */
        toggleMax(win);
        r = el.getBoundingClientRect();
        offX = Math.min(offX, r.width - 60);
        el.style.left = (e.clientX - offX) + 'px';
        el.style.top = (e.clientY - offY) + 'px';
    }
    document.body.classList.add('dragging');
    const move = (ev) => {
        const x = Core.clamp(ev.clientX - offX, -el.offsetWidth + 90, innerWidth - 90);
        const y = Core.clamp(ev.clientY - offY, MENUBAR, innerHeight - 44);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    };
    const up = () => {
        window.removeEventListener('pointermove', move);
        document.body.classList.remove('dragging');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    e.preventDefault();
}

function startResize(e, win, dir) {
    if (win.maxed || win.app.fixed) return;
    e.preventDefault();
    e.stopPropagation();
    const el = win.el;
    const r = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;

    const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let { left, top, width, height } = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (dir.includes('e')) width = Core.clamp(r.width + dx, 300, innerWidth);
        if (dir.includes('s')) height = Core.clamp(r.height + dy, 180, innerHeight);
        if (dir.includes('w')) { width = Core.clamp(r.width - dx, 300, innerWidth); left = r.right - width; }
        if (dir.includes('n')) { height = Core.clamp(r.height - dy, 180, innerHeight); top = Math.max(MENUBAR, r.bottom - height); height = r.bottom - top; }
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';
        if (win.onResize) win.onResize();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true });
}

function toggleMax(win) {
    const el = win.el;
    if (!win.maxed) {
        win.prev = { l: el.style.left, t: el.style.top, w: el.style.width, h: el.style.height };
        el.style.left = '6px';
        el.style.top = (MENUBAR + 6) + 'px';
        el.style.width = (innerWidth - 12) + 'px';
        el.style.height = (innerHeight - MENUBAR - 100) + 'px';
        win.maxed = true;
        el.classList.add('maxed');
    } else {
        el.style.left = win.prev.l;
        el.style.top = win.prev.t;
        el.style.width = win.prev.w;
        el.style.height = win.prev.h;
        win.maxed = false;
        el.classList.remove('maxed');
    }
    if (win.onResize) win.onResize();
}

function focusWin(win) {
    if (win.minimized) restoreWin(win);
    WM.wins.forEach((w) => w.el.classList.remove('active'));
    win.el.classList.add('active');
    win.el.style.zIndex = ++WM.z;
    WM.focused = win;
    $('mb-appname').textContent = win.app.name;
    if (WM.z > 6000) {
        const arr = [...WM.wins.values()].sort((a, b) => +a.el.style.zIndex - +b.el.style.zIndex);
        WM.z = 100;
        arr.forEach((w) => (w.el.style.zIndex = ++WM.z));
    }
}

function closeWin(win, silent = false) {
    (win.cleanups || []).forEach((fn) => { try { fn(); } catch { } });
    WM.wins.delete(win.key);
    if (WM.focused === win) {
        WM.focused = null;
        const rest = [...WM.wins.values()].filter((w) => !w.minimized)
            .sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex);
        if (rest[0]) focusWin(rest[0]);
        else $('mb-appname').textContent = 'Files';
    }
    if (silent) { win.el.remove(); return; }
    win.el.classList.add('closing');
    setTimeout(() => win.el.remove(), 175);
    updateDock();
}

function minimizeWin(win) {
    if (win.minimized) return;
    win.minimized = true;
    const el = win.el;
    const icon = document.querySelector(`.dock-item[data-app="${win.id}"] .dock-icon`);
    const r = el.getBoundingClientRect();
    let tx = innerWidth / 2, ty = innerHeight - 40;
    if (icon) {
        const ir = icon.getBoundingClientRect();
        tx = ir.left + ir.width / 2;
        ty = ir.top + ir.height / 2;
    }
    el.style.setProperty('--mx', (tx - (r.left + r.width / 2)) + 'px');
    el.style.setProperty('--my', (ty - (r.top + r.height / 2)) + 'px');
    el.classList.add('minimizing');
    setTimeout(() => {
        el.style.display = 'none';
        el.classList.remove('minimizing');
    }, 310);
    if (WM.focused === win) {
        WM.focused = null;
        const rest = [...WM.wins.values()].filter((w) => !w.minimized)
            .sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex);
        if (rest[0]) focusWin(rest[0]);
        else $('mb-appname').textContent = 'Files';
    }
    updateDock();
}

function restoreWin(win) {
    win.minimized = false;
    const el = win.el;
    el.style.display = '';
    el.classList.add('unminimizing');
    setTimeout(() => el.classList.remove('unminimizing'), 330);
    updateDock();
}

function refreshFilesWindows() {
    WM.wins.forEach((w) => { if (w.id === 'files' || w.id === 'trash') w.refresh && w.refresh(); });
}
function refreshSettingsWindows() {
    WM.wins.forEach((w) => { if (w.id === 'settings') w.refresh && w.refresh(); });
}

/* ============================================================
   DOCK
   ============================================================ */
let dockItems = [];
function initDock() {
    const dock = $('dock');
    dock.innerHTML = '';
    dockItems = [];
    DOCK_APPS.forEach((id) => {
        if (id === 'sep') {
            const s = document.createElement('div');
            s.className = 'dock-sep';
            dock.appendChild(s);
            return;
        }
        const app = APPS[id];
        const item = document.createElement('div');
        item.className = 'dock-item';
        item.dataset.app = id;
        item.innerHTML = `
            <div class="dock-icon ${app.mono ? 'mono' : ''}" style="background:linear-gradient(145deg, ${app.grad[0]}, ${app.grad[1]})">${app.icon}</div>
            <div class="dock-dot"></div>
            <div class="dock-tip">${Core.esc(app.name)}</div>
        `;
        item.addEventListener('click', () => dockClick(id));
        dock.appendChild(item);
        dockItems.push({ id, item, icon: item.querySelector('.dock-icon') });
    });

    /* magnification */
    dock.addEventListener('pointermove', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        dockItems.forEach(({ icon }) => {
            const r = icon.getBoundingClientRect();
            const d = Math.abs(e.clientX - (r.left + r.width / 2));
            const t = Math.max(0, 1 - d / 150);
            const scale = 1 + 0.55 * Math.pow(t, 1.8);
            const lift = -18 * t * t;
            icon.style.transform = `translateY(${lift}px) scale(${scale.toFixed(3)})`;
        });
    });
    dock.addEventListener('pointerleave', () => {
        dockItems.forEach(({ icon }) => (icon.style.transform = ''));
    });
}

function dockClick(id) {
    const win = WM.wins.get(id);
    if (!win) {
        const item = document.querySelector(`.dock-item[data-app="${id}"]`);
        if (item) {
            item.classList.add('bouncing');
            setTimeout(() => item.classList.remove('bouncing'), 700);
        }
        openApp(id);
    } else if (win.minimized) {
        restoreWin(win);
        focusWin(win);
    } else if (WM.focused === win) {
        minimizeWin(win);
    } else {
        focusWin(win);
    }
}

function updateDock() {
    dockItems.forEach(({ id, item }) => item.classList.toggle('running', WM.wins.has(id)));
}

/* ============================================================
   DESKTOP ICONS
   ============================================================ */
function initDesktopIcons() {
    const box = $('desktop-icons');
    box.innerHTML = '';
    ['files', 'notes', 'terminal', 'paint', 'music', 'game2048'].forEach((id) => {
        const app = APPS[id];
        const el = document.createElement('div');
        el.className = 'dicon';
        el.dataset.app = id;
        el.innerHTML = `
            <div class="dicon-icon" style="background:linear-gradient(145deg, ${app.grad[0]}, ${app.grad[1]})">${app.icon}</div>
            <div class="dicon-label">${Core.esc(app.name)}</div>
        `;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            box.querySelectorAll('.dicon').forEach((d) => d.classList.remove('sel'));
            el.classList.add('sel');
        });
        el.addEventListener('dblclick', () => openApp(id));
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, [
                { label: `Open ${app.name}`, icon: '📂', action: () => openApp(id) },
            ]);
        });
        box.appendChild(el);
    });
    box.addEventListener('click', () => box.querySelectorAll('.dicon').forEach((d) => d.classList.remove('sel')));
}

/* ============================================================
   MENU BAR
   ============================================================ */
function initMenubar() {
    /* aurora menu */
    $('mb-logo').addEventListener('click', (e) => {
        e.stopPropagation();
        const m = $('mb-menu');
        const wasOpen = !m.classList.contains('hidden');
        hideAllMenus();
        if (wasOpen) return;
        m.innerHTML = '';
        [
            { label: 'About This Aurora', icon: '◍', action: () => openApp('about') },
            'sep',
            { label: 'System Settings…', icon: '⚙️', action: () => openApp('settings') },
            { label: 'Aurora Search', icon: '🔍', hint: 'Ctrl+K', action: () => openSpotlight() },
            'sep',
            { label: 'Lock Screen', icon: '🔒', action: lockOS },
            { label: 'Sleep', icon: '🌙', action: sleepOS },
            { label: 'Restart…', icon: '🔄', action: restartOS },
            { label: 'Shut Down…', icon: '⏻', action: shutdownOS },
            'sep',
            {
                label: 'Reset Aurora OS…', icon: '⚠️', danger: true,
                action: async () => {
                    if (await dialogConfirm('Reset Aurora OS?', 'This wipes all files, notes and settings stored in this browser and restarts the system.', 'Reset')) {
                        Object.keys(localStorage).filter((k) => k.startsWith('auroraos:')).forEach((k) => localStorage.removeItem(k));
                        location.reload();
                    }
                },
            },
        ].forEach((it) => {
            if (it === 'sep') {
                const s = document.createElement('div');
                s.className = 'menu-sep';
                m.appendChild(s);
                return;
            }
            const b = document.createElement('button');
            b.className = 'menu-item' + (it.danger ? ' danger' : '');
            b.innerHTML = `<span>${it.icon}&nbsp;&nbsp;${Core.esc(it.label)}</span>${it.hint ? `<span class="mi-hint">${it.hint}</span>` : ''}`;
            b.onclick = () => { hideAllMenus(); it.action(); };
            m.appendChild(b);
        });
        m.classList.remove('hidden');
    });

    /* clock popover */
    $('mb-clock').addEventListener('click', (e) => {
        e.stopPropagation();
        const p = $('clock-pop');
        const wasOpen = !p.classList.contains('hidden');
        hideAllMenus();
        if (wasOpen) return;
        renderClockPop();
        p.classList.remove('hidden');
    });

    $('mb-spotlight').addEventListener('click', () => { hideAllMenus(); openSpotlight(); });
    $('mb-cc').addEventListener('click', (e) => {
        e.stopPropagation();
        const cc = $('control-center');
        const wasOpen = !cc.classList.contains('hidden');
        hideAllMenus();
        if (!wasOpen) { renderControlCenter(); cc.classList.remove('hidden'); }
    });
}

function renderClockPop() {
    const now = new Date();
    const evts = store.get('calevents', {});
    $('clock-pop').innerHTML = `
        <div class="cp-time">${pad2(now.getHours())}:${pad2(now.getMinutes())}<span style="font-size:18px;color:var(--text-dim)">:${pad2(now.getSeconds())}</span></div>
        <div class="cp-date">${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}</div>
        <div class="mcal-grid">
            ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="mcal-dow">${d}</div>`).join('')}
            ${buildMonthCells(now.getFullYear(), now.getMonth()).map((c) =>
                `<div class="mcal-day ${c.dim ? 'dim' : ''} ${c.today ? 'today' : ''} ${c.hasEvt ? 'evt' : ''}">${c.d}</div>`
            ).join('')}
        </div>
        <button class="cp-btn">📅 &nbsp;Open Calendar</button>
    `;
    $('clock-pop').querySelector('.cp-btn').onclick = () => { hideAllMenus(); openApp('calendar'); };
}

function buildMonthCells(y, m) {
    const evts = store.get('calevents', {});
    const today = new Date();
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const prevDim = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = first - 1; i >= 0; i--) cells.push({ d: prevDim - i, dim: true, key: null });
    for (let d = 1; d <= dim; d++) {
        const key = `${y}-${m}-${d}`;
        cells.push({
            d, dim: false,
            today: today.getFullYear() === y && today.getMonth() === m && today.getDate() === d,
            hasEvt: !!evts[key], key,
        });
    }
    let nd = 1;
    while (cells.length < 42) cells.push({ d: nd++, dim: true, key: null });
    while (cells.length > 35 && cells[35].dim && cells[34].dim) cells.pop();
    return cells;
}

function tickClock() {
    const now = new Date();
    $('mb-clock').textContent = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()].slice(0, 3)}  ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    updateLoginClock();
    const p = $('clock-pop');
    if (!p.classList.contains('hidden')) renderClockPop();
}

/* battery + network */
function initStatus() {
    const bat = $('mb-battery');
    if (navigator.getBattery) {
        navigator.getBattery().then((b) => {
            const paint = () => {
                bat.textContent = (b.charging ? '⚡' : '🔋') + ' ' + Math.round(b.level * 100) + '%';
                bat.title = b.charging ? 'Charging' : 'Battery';
            };
            paint();
            b.addEventListener('levelchange', paint);
            b.addEventListener('chargingchange', paint);
        }).catch(() => { });
    }
    const paintNet = () => {
        const on = navigator.onLine;
        $('mb-wifi').textContent = on ? '📶' : '🚫';
        $('mb-wifi').classList.toggle('off', !on);
        $('mb-wifi').title = on ? 'Connected' : 'Offline';
    };
    paintNet();
    window.addEventListener('online', () => { paintNet(); notify('📶', 'Network', 'Connection restored.'); });
    window.addEventListener('offline', () => { paintNet(); notify('🚫', 'Network', 'Connection lost.'); });
}

/* ============================================================
   APP: Files (also powers the Trash window)
   ============================================================ */
function renderFiles(body, win, opts = {}) {
    const isTrash = !!opts.trash;
    let cwd = isTrash ? ['Trash'] : [];

    body.innerHTML = `
        <div class="fx-wrap">
            <div class="fx-side">
                <div class="fx-side-title">FAVORITES</div>
                <button class="fx-side-item" data-loc=""><span>🏠</span> Home</button>
                <button class="fx-side-item" data-loc="Documents"><span>📄</span> Documents</button>
                <button class="fx-side-item" data-loc="Pictures"><span>🖼</span> Pictures</button>
                <div class="fx-side-title">LOCATIONS</div>
                <button class="fx-side-item" data-loc="Trash"><span>🗑</span> Trash</button>
            </div>
            <div class="fx-main">
                <div class="fx-toolbar">
                    <button class="fx-btn" data-nav="back">‹ Back</button>
                    <div class="fx-crumb"></div>
                    ${isTrash
                    ? '<button class="fx-btn danger" data-nav="empty">Empty Trash</button>'
            : `<button class="fx-btn" data-nav="newfolder">＋ Folder</button>
                       <button class="fx-btn accent" data-nav="newfile">＋ File</button>`}
                </div>
                <div class="fx-grid" tabindex="-1"></div>
            </div>
        </div>`;

    const grid = body.querySelector('.fx-grid');
    const crumb = body.querySelector('.fx-crumb');
    const titleFor = () => (cwd.length ? (isTrash ? 'Trash' : cwd[cwd.length - 1]) : 'Home');

    body.querySelectorAll('.fx-side-item').forEach((b) => {
        b.addEventListener('click', () => navigate(b.dataset.loc ? [b.dataset.loc] : []));
    });

    body.querySelector('[data-nav="back"]').addEventListener('click', () => {
        if (cwd.length) navigate(cwd.slice(0, -1));
    });
    const emptyBtn = body.querySelector('[data-nav="empty"]');
    if (emptyBtn) emptyBtn.addEventListener('click', async () => {
        const t = trashNode();
        if (!Object.keys(t.children).length) return;
        if (await dialogConfirm('Empty Trash?', `Permanently delete ${Object.keys(t.children).length} item(s)? This cannot be undone.`, 'Delete')) {
            t.children = {};
            saveFS();
            draw();
        }
    });
    const nfBtn = body.querySelector('[data-nav="newfolder"]');
    if (nfBtn) nfBtn.addEventListener('click', async () => {
        const name = await dialogPrompt('New folder', 'New Folder');
        if (!name) return;
        const node = Core.fsGet(FS, cwd);
        if (!node || node.type !== 'folder') return;
        let n = name, i = 2;
        while (node.children[n]) n = `${name} ${i++}`;
        node.children[n] = { type: 'folder', children: {} };
        saveFS();
        draw();
    });
    const nfileBtn = body.querySelector('[data-nav="newfile"]');
    if (nfileBtn) nfileBtn.addEventListener('click', async () => {
        const name = await dialogPrompt('New file', 'Untitled.txt');
        if (!name) return;
        const node = Core.fsGet(FS, cwd);
        if (!node || node.type !== 'folder') return;
        let n = name.endsWith('.txt') ? name : name + '.txt', i = 2;
        while (node.children[n]) n = `${name} ${i++}.txt`;
        node.children[n] = { type: 'file', kind: 'text', content: '' };
        saveFS();
        draw();
    });

    function navigate(path) {
        cwd = path.slice();
        draw();
    }

    async function itemMenu(e, name) {
        e.preventDefault();
        e.stopPropagation();
        const node = Core.fsGet(FS, cwd);
        if (!node || !node.children[name]) return;
        const inTrash = cwd[0] === 'Trash';
        const items = [
            { label: 'Open', icon: '📂', action: () => openItem(name) },
        ];
        if (!inTrash) items.push({ label: 'Rename…', icon: '✏️', action: async () => {
            const nn = await dialogPrompt('Rename', name);
            if (!nn || nn === name || node.children[nn]) return;
            const entries = {};
            Object.entries(node.children).forEach(([k, v]) => (entries[k === name ? nn : k] = v));
            node.children = entries;
            saveFS();
            draw();
        } });
        items.push('sep');
        items.push({
            label: inTrash ? 'Delete Permanently' : 'Move to Trash', icon: '🗑', danger: true,
            action: async () => {
                if (inTrash) {
                    if (await dialogConfirm('Delete forever?', `"${name}" will be permanently deleted.`, 'Delete')) {
                        delete node.children[name];
                        saveFS();
                        draw();
                    }
                } else {
                    const t = trashNode();
                    let n = name, i = 2;
                    while (t.children[n]) n = `${name} ${i++}`;
                    t.children[n] = node.children[name];
                    delete node.children[name];
                    saveFS();
                    draw();
                }
            },
        });
        showContextMenu(e.clientX, e.clientY, items);
    }

    function openItem(name) {
        const node = Core.fsGet(FS, cwd);
        const child = node && node.children[name];
        if (!child) return;
        if (child.type === 'folder') navigate(cwd.concat(name));
        else openEditor(cwd.concat(name));
    }

    function draw() {
        const node = Core.fsGet(FS, cwd) || FS;
        win.setTitle(`${titleFor()} — ${isTrash ? 'Trash' : 'Files'}`);
        /* sidebar selection */
        body.querySelectorAll('.fx-side-item').forEach((b) => {
            const loc = b.dataset.loc ? [b.dataset.loc] : [];
            b.classList.toggle('sel', loc.join('/') === cwd.join('/'));
        });
        /* breadcrumb */
        crumb.innerHTML = '';
        const mkCrumb = (label, path) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.onclick = () => navigate(path);
            crumb.appendChild(b);
        };
        mkCrumb(isTrash ? '🗑 Trash' : '◈ Aurora', isTrash ? ['Trash'] : []);
        if (!isTrash) cwd.forEach((seg, i) => {
            crumb.insertAdjacentHTML('beforeend', '<span class="fx-crumb-sep">›</span>');
            mkCrumb(seg, cwd.slice(0, i + 1));
        });

        /* grid */
        grid.innerHTML = '';
        const entries = Object.entries(node.children || {})
            .sort((a, b) => (a[1].type === b[1].type ? a[0].localeCompare(b[0]) : a[1].type === 'folder' ? -1 : 1));
        if (!entries.length) {
            grid.innerHTML = `<div class="fx-empty">${isTrash ? 'Trash is empty ✨' : 'This folder is empty'}</div>`;
            return;
        }
        entries.forEach(([name, child]) => {
            const it = document.createElement('div');
            it.className = 'fx-item';
            it.innerHTML = `
                <div class="fx-item-icon">${child.type === 'folder' ? '📁' : '📄'}</div>
                <div class="fx-item-name">${Core.esc(name)}</div>`;
            it.addEventListener('click', () => {
                grid.querySelectorAll('.fx-item').forEach((x) => x.classList.remove('sel'));
                it.classList.add('sel');
            });
            it.addEventListener('dblclick', () => openItem(name));
            it.addEventListener('contextmenu', (e) => itemMenu(e, name));
            grid.appendChild(it);
        });
    }

    win.refresh = draw;
    draw();
}

/* ============================================================
   APP: Text editor (multi-instance)
   ============================================================ */
function openEditor(path) {
    openApp('editor', { key: 'editor:' + path.join('/'), args: { path } });
}
function renderEditor(body, win) {
    const path = win.args.path;
    let node = Core.fsGet(FS, path);
    let saved = true;

    body.innerHTML = `
        <div class="ed-wrap">
            <div class="ed-toolbar">
                <span style="font-size:12px;color:var(--text-dim);flex:1">${Core.esc(path.join(' › '))}</span>
                <span class="ed-status" style="font-size:12px;color:var(--text-dim)">Saved</span>
                <button class="fx-btn accent" data-nav="save">Save</button>
            </div>
            <textarea class="ed-area" spellcheck="false"></textarea>
        </div>`;
    const ta = body.querySelector('.ed-area');
    const status = body.querySelector('.ed-status');
    ta.value = node && node.type === 'file' ? node.content : '';
    win.setTitle((path[path.length - 1] || 'Untitled') + ' — Editor');

    let t = null;
    ta.addEventListener('input', () => {
        saved = false;
        status.textContent = 'Editing…';
        clearTimeout(t);
        t = setTimeout(() => {
            node = Core.fsGet(FS, path);
            if (node && node.type === 'file') {
                node.content = ta.value;
                saveFS();
                saved = true;
                status.textContent = 'Saved';
            }
        }, 400);
    });
    body.querySelector('[data-nav="save"]').addEventListener('click', async () => {
        node = Core.fsGet(FS, path);
        if (node && node.type === 'file') {
            node.content = ta.value;
            saveFS();
            saved = true;
            status.textContent = 'Saved';
            notify('💾', 'Saved', path[path.length - 1]);
            return;
        }
        const name = await dialogPrompt('Save file as…', 'Untitled.txt');
        if (!name) return;
        const docs = FS.children['Documents'];
        let n = name.endsWith('.txt') ? name : name + '.txt', i = 2;
        while (docs.children[n]) n = `${name} ${i++}.txt`;
        docs.children[n] = { type: 'file', kind: 'text', content: ta.value };
        saveFS();
        win.args.path = ['Documents', n];
        win.setTitle(n + ' — Editor');
        status.textContent = 'Saved';
        body.querySelector('.ed-toolbar span').textContent = 'Documents › ' + n;
        saved = true;
        refreshFilesWindows();
        notify('💾', 'Saved', n + ' in Documents');
    });
}

/* ============================================================
   APP: Notes
   ============================================================ */
let notes = store.get('notes', null);
if (!notes) {
    notes = [{
        id: 'n1', title: 'Welcome to Notes',
        body: 'Aurora Notes keep everything in this browser.\n\nIdeas, lists, secrets… they stay on your machine.\n\n• Click ＋ for a new note\n• Notes save as you type',
        ts: Date.now(),
    }];
    store.set('notes', notes);
}
function saveNotes() { store.set('notes', notes); }

function renderNotes(body, win) {
    let selId = notes[0] ? notes[0].id : null;
    body.innerHTML = `
        <div class="nt-wrap">
            <div class="nt-side">
                <button class="nt-new">＋ &nbsp;New Note</button>
                <div class="nt-list"></div>
            </div>
            <div class="nt-main">
                <div class="nt-titlebar">
                    <input class="nt-title" placeholder="Title" maxlength="60">
                    <button class="nt-del" title="Delete note">🗑</button>
                </div>
                <textarea class="nt-body" placeholder="Start typing…"></textarea>
            </div>
        </div>`;

    const list = body.querySelector('.nt-list');
    const titleIn = body.querySelector('.nt-title');
    const bodyTa = body.querySelector('.nt-body');

    function cur() { return notes.find((n) => n.id === selId); }

    function drawList() {
        list.innerHTML = '';
        notes.forEach((n) => {
            const d = new Date(n.ts);
            const el = document.createElement('div');
            el.className = 'nt-item' + (n.id === selId ? ' sel' : '');
            el.innerHTML = `<div class="nt-item-title">${Core.esc(n.title || 'Untitled')}</div>
                            <div class="nt-item-date">${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}</div>`;
            el.addEventListener('click', () => { selId = n.id; draw(); });
            list.appendChild(el);
        });
    }
    function draw() {
        drawList();
        const n = cur();
        if (!n) {
            titleIn.value = ''; bodyTa.value = '';
            titleIn.disabled = bodyTa.disabled = true;
            return;
        }
        titleIn.disabled = bodyTa.disabled = false;
        titleIn.value = n.title;
        bodyTa.value = n.body;
    }

    let t = null;
    const queueSave = () => {
        clearTimeout(t);
        t = setTimeout(() => { saveNotes(); drawList(); }, 350);
    };
    titleIn.addEventListener('input', () => { const n = cur(); if (n) { n.title = titleIn.value; n.ts = Date.now(); queueSave(); } });
    bodyTa.addEventListener('input', () => { const n = cur(); if (n) { n.body = bodyTa.value; n.ts = Date.now(); queueSave(); } });

    body.querySelector('.nt-new').addEventListener('click', () => {
        const n = { id: 'n' + Date.now(), title: 'New Note', body: '', ts: Date.now() };
        notes.unshift(n);
        selId = n.id;
        saveNotes();
        draw();
        titleIn.focus();
        titleIn.select();
    });
    body.querySelector('.nt-del').addEventListener('click', async () => {
        const n = cur();
        if (!n) return;
        if (await dialogConfirm('Delete note?', `"${n.title || 'Untitled'}" will be deleted.`, 'Delete')) {
            notes = notes.filter((x) => x.id !== n.id);
            selId = notes[0] ? notes[0].id : null;
            saveNotes();
            draw();
        }
    });
    draw();
}

/* ============================================================
   APP: Calculator
   ============================================================ */
function renderCalc(body, win) {
    let display = '0', prev = null, op = null, fresh = true, hist = '';

    body.innerHTML = `
        <div class="cl-wrap" tabindex="-1">
            <div class="cl-history">&nbsp;</div>
            <div class="cl-display">0</div>
            <div class="cl-btns">
                ${[
            ['AC', 'fn'], ['±', 'fn'], ['%', 'fn'], ['÷', 'op'],
            ['7', ''], ['8', ''], ['9', ''], ['×', 'op'],
            ['4', ''], ['5', ''], ['6', ''], ['−', 'op'],
            ['1', ''], ['2', ''], ['3', ''], ['+', 'op'],
            ['0', 'wide'], ['.', ''], ['=', 'eq'],
        ].map(([v, c]) => `<button class="cl-btn ${c}" data-k="${v}">${v}</button>`).join('')}
            </div>
        </div>`;

    const disp = body.querySelector('.cl-display');
    const histEl = body.querySelector('.cl-history');

    function paint() {
        disp.textContent = display;
        histEl.innerHTML = hist ? Core.esc(hist) : '&nbsp;';
    }
    function digit(d) {
        if (fresh) { display = (d === '.') ? '0.' : d; fresh = false; return; }
        if (d === '.' && display.includes('.')) return;
        if (display.replace(/[-.]/g, '').length >= 12 && d !== '.') return;
        display = (display === '0' && d !== '.') ? d : display + d;
    }
    function equals() {
        if (op == null || prev == null) return;
        const res = Core.fmtCalc(Core.calcCompute(prev, display, op));
        hist = `${prev} ${op} ${display} =`;
        display = res;
        prev = null; op = null; fresh = true;
    }
    function setOp(o) {
        if (op != null && !fresh) equals();
        prev = display;
        op = o;
        fresh = true;
        hist = `${prev} ${o}`;
    }
    function press(k) {
        if (/[0-9.]/.test(k)) digit(k);
        else if (k === 'AC') { display = '0'; prev = null; op = null; fresh = true; hist = ''; }
        else if (k === '±') display = display.startsWith('-') ? display.slice(1) : (display === '0' ? '0' : '-' + display);
        else if (k === '%') display = Core.fmtCalc(parseFloat(display) / 100);
        else if (k === '=') equals();
        else setOp(k);
        paint();
    }

    body.querySelectorAll('.cl-btn').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    const keymap = { '/': '÷', '*': '×', '-': '−', '+': '+', 'Enter': '=', '=': '=', 'Escape': 'AC', 'Backspace': 'AC', '%': '%' };
    const wrap = body.querySelector('.cl-wrap');
    wrap.addEventListener('keydown', (e) => {
        let k = null;
        if (/^[0-9.]$/.test(e.key)) k = e.key;
        else if (keymap[e.key]) k = keymap[e.key];
        if (k) { e.preventDefault(); press(k); }
    });
    win.el.addEventListener('pointerdown', () => setTimeout(() => wrap.focus(), 0));
    paint();
}

/* ============================================================
   APP: Terminal
   ============================================================ */
function renderTerminal(body, win) {
    let cwd = [];
    const histCmd = [];
    let hIdx = -1;

    body.innerHTML = `
        <div class="term">
            <div class="term-log"></div>
            <div class="t-in">
                <span class="t-prompt"></span>
                <input class="t-cmd" spellcheck="false" autocomplete="off">
            </div>
        </div>`;
    const log = body.querySelector('.term-log');
    const input = body.querySelector('.t-cmd');
    const promptEl = body.querySelector('.t-prompt');
    const term = body.querySelector('.term');
    term.addEventListener('click', () => input.focus());

    const pathStr = () => (cwd.length ? '/' + cwd.join('/') : '~');
    function paintPrompt() {
        promptEl.innerHTML = `<span class="t-prompt-u">${Core.esc(OS.user.name || 'explorer')}@aurora</span> <span class="t-prompt-p">${Core.esc(pathStr())}</span> ❯ `;
    }
    function print(html, cls) {
        const d = document.createElement('div');
        d.className = 't-line' + (cls ? ' ' + cls : '');
        d.innerHTML = html;
        log.appendChild(d);
    }
    function esc(s) { return Core.esc(s); }

    const HELP = [
        ['help', 'show this help'],
        ['ls [path]', 'list files'],
        ['cd <path>', 'change directory ( .. / ~ supported )'],
        ['pwd', 'print working directory'],
        ['cat <file>', 'print a text file'],
        ['echo <text>', 'print text'],
        ['open <app>', 'open an app (try: open files)'],
        ['apps', 'list installed apps'],
        ['theme <dark|light>', 'switch appearance'],
        ['accent <color>', 'teal · violet · pink · blue · amber · green'],
        ['wallpaper <name|list>', 'change wallpaper'],
        ['neofetch', 'system info with style'],
        ['date / uptime / whoami / uname', 'the classics'],
        ['clear', 'clear the screen'],
        ['lock / sleep / reboot / shutdown', 'power commands'],
        ['exit', 'close the terminal'],
    ];

    function run(raw) {
        const line = raw.trim();
        print(`<span class="t-prompt-u">${Core.esc(OS.user.name || 'explorer')}@aurora</span> <span class="t-prompt-p">${esc(pathStr())}</span> ❯ ${esc(line)}`);
        if (!line) return;
        histCmd.push(line);
        hIdx = histCmd.length;
        const [cmd, ...rest] = line.split(/\s+/);
        const arg = rest.join(' ');
        const node = () => Core.fsGet(FS, cwd);

        switch (cmd.toLowerCase()) {
            case 'help':
                print(HELP.map(([c, d]) => `  <span class="t-acc">${c.padEnd(28, ' ').replace(/ /g, '&nbsp;')}</span><span class="t-dim">${esc(d)}</span>`).join('<br>'));
                break;
            case 'ls': {
                let target = node();
                if (arg) {
                    const p = arg === '~' ? [] : arg.split('/').filter(Boolean);
                    target = Core.fsGet(FS, cwd.concat(p));
                    if (!target) { print(`ls: no such file or directory: ${esc(arg)}`, 't-err'); break; }
                }
                if (target.type === 'file') { print(esc(arg.split('/').pop())); break; }
                const names = Object.keys(target.children || {}).sort();
                if (!names.length) { print('<span class="t-dim">(empty)</span>'); break; }
                print(names.map((n) => target.children[n].type === 'folder'
                    ? `<span class="t-acc">${esc(n)}/</span>` : esc(n)).join('&nbsp;&nbsp;'));
                break;
            }
            case 'cd': {
                if (!arg || arg === '~') { cwd = []; break; }
                if (arg === '..') { cwd = cwd.slice(0, -1); break; }
                if (arg === '/') { cwd = []; break; }
                const p = arg.split('/').filter(Boolean);
                const t = Core.fsGet(FS, cwd.concat(p));
                if (t && t.type === 'folder') cwd = cwd.concat(p);
                else print(`cd: not a directory: ${esc(arg)}`, 't-err');
                break;
            }
            case 'pwd': print('/' + cwd.join('/')); break;
            case 'cat': {
                if (!arg) { print('cat: which file?', 't-err'); break; }
                const t = Core.fsGet(FS, cwd.concat(arg.split('/').filter(Boolean)));
                if (t && t.type === 'file') print(esc(t.content));
                else print(`cat: no such file: ${esc(arg)}`, 't-err');
                break;
            }
            case 'echo': print(esc(arg)); break;
            case 'date': print(new Date().toString()); break;
            case 'uptime': print(`up ${Core.fmtUptime(Date.now() - OS.startTime)}, ${WM.wins.size} windows open`); break;
            case 'whoami': print(OS.user.name || 'explorer'); break;
            case 'uname': print('AuroraOS 1.0 Borealis web ' + (navigator.platform || 'js')); break;
            case 'apps': print(Object.keys(APPS).filter((k) => APPS[k].inDock !== false && k !== 'editor').join('&nbsp;&nbsp;')); break;
            case 'open':
                if (APPS[arg] && arg !== 'editor') { openApp(arg); print(`opening ${esc(arg)}…`, 't-ok'); }
                else print(`open: unknown app: ${esc(arg)} (try: apps)`, 't-err');
                break;
            case 'theme':
                if (arg === 'dark' || arg === 'light') { OS.settings.dark = arg === 'dark'; applySettings(); print(`theme set to ${arg}`, 't-ok'); }
                else print('usage: theme <dark|light>', 't-err');
                break;
            case 'accent':
                if (ACCENTS[arg]) { setAccent(arg); print(`accent set to ${arg}`, 't-ok'); }
                else print('usage: accent <' + Object.keys(ACCENTS).join('|') + '>', 't-err');
                break;
            case 'wallpaper': {
                if (!arg || arg === 'list') { print('wallpapers: ' + WALLPAPERS.map((w) => w.id).join(' · ')); break; }
                const w = WALLPAPERS.find((x) => x.id === arg || x.name.toLowerCase() === arg.toLowerCase());
                if (w) { setWallpaper(w.id); print(`wallpaper set to ${esc(w.name)}`, 't-ok'); }
                else print(`wallpaper: unknown: ${esc(arg)} (try: wallpaper list)`, 't-err');
                break;
            }
            case 'neofetch': print(neofetchHTML()); break;
            case 'clear': log.innerHTML = ''; break;
            case 'lock': lockOS(); break;
            case 'sleep': sleepOS(); break;
            case 'reboot': restartOS(); break;
            case 'shutdown': shutdownOS(); break;
            case 'exit': win.close(); break;
            default: print(`aurora-sh: command not found: ${esc(cmd)} — try <span class="t-acc">help</span>`, 't-err');
        }
    }

    function neofetchHTML() {
        const art = [
            '         ▄▄▄▄▄▄▄▄▄▄▄     ',
            '      ▄▄█████████████▄▄  ',
            '    ▄████▀▀▀▀▀▀▀▀▀████▄  ',
            '   ████▀    ▄▄▄▄    ▀████',
            '  ████    ████████    ████',
            '  ████    ████████    ████',
            '   ████▄    ▀▀▀▀    ▄████',
            '    ▀████▄▄▄▄▄▄▄▄▄████▀  ',
            '      ▀▀█████████████▀▀  ',
            '         ▀▀▀▀▀▀▀▀▀▀▀     ',
        ];
        const a = ACCENTS[OS.settings.accent] || ACCENTS.teal;
        const wp = WALLPAPERS.find((w) => w.id === OS.settings.wallpaper) || WALLPAPERS[0];
        const info = [
            `<span class="t-prompt-u">${esc(OS.user.name || 'explorer')}@aurora</span>`,
            '<span class="t-dim">──────────────────────</span>',
            `OS: <span class="t-acc">Aurora OS 1.0 “Borealis”</span>`,
            `Kernel: ${esc((navigator.userAgent.split(')')[0] + ')').slice(0, 44))}`,
            `Shell: aurora-sh 1.0`,
            `Uptime: ${Core.fmtUptime(Date.now() - OS.startTime)}`,
            `Resolution: ${innerWidth}×${innerHeight}`,
            `Theme: ${OS.settings.dark ? 'Dark' : 'Light'} · ${esc(wp.name)}`,
            `Accent: <span style="color:${a.c}">●</span> ${OS.settings.accent}`,
            `Windows: ${WM.wins.size} &nbsp; Files: ${countFiles(FS)}`,
        ];
        let rows = '';
        for (let i = 0; i < art.length; i++) {
            const color = i % 2 === 0 ? '#5eead4' : '#a78bfa';
            rows += `<span style="color:${color}">${art[i]}</span>  ${info[i] || ''}<br>`;
        }
        return rows;
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const v = input.value;
            input.value = '';
            run(v);
            log.scrollTop = log.scrollHeight;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (hIdx > 0) input.value = histCmd[--hIdx] || '';
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (hIdx < histCmd.length - 1) input.value = histCmd[++hIdx] || '';
            else { hIdx = histCmd.length; input.value = ''; }
        }
    });

    print(`<span class="t-ok">Aurora OS</span> — aurora-sh 1.0`);
    print(`<span class="t-dim">Type</span> <span class="t-acc">help</span> <span class="t-dim">to see what this thing can do.</span>`);
    paintPrompt();
    setTimeout(() => input.focus(), 80);
}
function countFiles(node) {
    if (!node || !node.children) return 0;
    return Object.values(node.children).reduce((acc, n) => acc + 1 + (n.type === 'folder' ? countFiles(n) : 0), 0);
}

/* ============================================================
   APP: Paint
   ============================================================ */
function renderPaint(body, win) {
    const COLORS = ['#1b2135', '#e0454f', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#0d9488', '#ffffff'];
    let color = COLORS[0], size = 6, eraser = false, drawing = false, last = null;

    body.innerHTML = `
        <div class="pt-wrap">
            <div class="pt-toolbar">
                <div class="pt-swatches"></div>
                <input type="range" class="pt-size" min="2" max="40" value="6" title="Brush size">
                <button class="pt-tool" data-nav="eraser">🧽 Eraser</button>
                <button class="pt-tool" data-nav="clear">Clear</button>
                <button class="pt-tool" data-nav="save" style="margin-left:auto">⬇ Save PNG</button>
            </div>
            <div class="pt-canvas-wrap"><canvas width="1000" height="640"></canvas></div>
        </div>`;

    const cv = body.querySelector('canvas');
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const sw = body.querySelector('.pt-swatches');
    COLORS.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'pt-swatch' + (i === 0 ? ' sel' : '');
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', () => {
            color = c; eraser = false;
            body.querySelector('[data-nav="eraser"]').classList.remove('on');
            sw.querySelectorAll('.pt-swatch').forEach((x) => x.classList.remove('sel'));
            b.classList.add('sel');
        });
        sw.appendChild(b);
    });
    body.querySelector('.pt-size').addEventListener('input', (e) => (size = +e.target.value));
    body.querySelector('[data-nav="eraser"]').addEventListener('click', (e) => {
        eraser = !eraser;
        e.currentTarget.classList.toggle('on', eraser);
    });
    body.querySelector('[data-nav="clear"]').addEventListener('click', () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        notify('🧼', 'Canvas cleared', 'A fresh sheet of paper.');
    });
    body.querySelector('[data-nav="save"]').addEventListener('click', () => {
        const a = document.createElement('a');
        a.download = 'aurora-painting.png';
        a.href = cv.toDataURL('image/png');
        a.click();
    });

    function pos(e) {
        const r = cv.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
    }
    cv.addEventListener('pointerdown', (e) => {
        drawing = true;
        last = pos(e);
        cv.setPointerCapture(e.pointerId);
        ctx.strokeStyle = eraser ? '#ffffff' : color;
        ctx.lineWidth = eraser ? size * 2.5 : size;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(last.x + 0.01, last.y + 0.01);
        ctx.stroke();
    });
    cv.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const p = pos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
    });
    const stop = () => (drawing = false);
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
}

/* ============================================================
   APP: Aurora FM (generative music)
   ============================================================ */
const STATIONS = [
    { name: 'Borealis Drift', sub: 'Ambient · generative', root: 220.00, scale: [0, 3, 5, 7, 10], bpm: 58, wave: 'triangle', density: 0.5, padGain: 0.05 },
    { name: 'Midnight Drive', sub: 'Synthwave · generative', root: 196.00, scale: [0, 2, 3, 7, 8], bpm: 96, wave: 'sawtooth', density: 0.72, padGain: 0.035 },
    { name: 'Deep Focus', sub: 'Minimal · generative', root: 174.61, scale: [0, 2, 4, 7, 9], bpm: 42, wave: 'sine', density: 0.28, padGain: 0.06 },
];

function renderMusic(body, win) {
    let actx = null, master = null, analyser = null, padNodes = [];
    let playing = false, stationIdx = 0, schedTimer = null, nextTime = 0, step = 0, raf = null;

    body.innerHTML = `
        <div class="mu-wrap">
            <div class="mu-stations"></div>
            <div class="mu-viz"><canvas></canvas></div>
            <div class="mu-controls">
                <button class="mu-play">▶</button>
                <div class="mu-info">
                    <div class="mu-note-title">Aurora FM</div>
                    <div class="mu-note-sub">Pick a station, then press play — every note is synthesized live.</div>
                </div>
                <input type="range" class="mu-vol" min="0" max="100" value="${Math.round(OS.settings.volume * 100)}" title="Volume">
            </div>
        </div>`;

    const stBox = body.querySelector('.mu-stations');
    const playBtn = body.querySelector('.mu-play');
    const titleEl = body.querySelector('.mu-note-title');
    const subEl = body.querySelector('.mu-note-sub');
    const volEl = body.querySelector('.mu-vol');
    const cv = body.querySelector('canvas');
    const cctx = cv.getContext('2d');

    STATIONS.forEach((st, i) => {
        const b = document.createElement('button');
        b.className = 'mu-station' + (i === 0 ? ' sel' : '');
        b.textContent = st.name;
        b.addEventListener('click', () => {
            stationIdx = i;
            stBox.querySelectorAll('.mu-station').forEach((x) => x.classList.remove('sel'));
            b.classList.add('sel');
            titleEl.textContent = st.name;
            subEl.textContent = st.sub + ' · ' + st.bpm + ' BPM';
            if (playing) { stopPad(); startPad(); nextTime = actx.currentTime + 0.05; step = 0; }
        });
        stBox.appendChild(b);
    });

    function ensureAudio() {
        if (actx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        actx = new AC();
        master = actx.createGain();
        master.gain.value = OS.settings.volume * 0.9;
        analyser = actx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        master.connect(analyser);
        analyser.connect(actx.destination);
    }

    function note(freq, t, dur, gain, wave) {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = wave;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.1);
    }

    function startPad() {
        const st = STATIONS[stationIdx];
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700;
        const lfo = actx.createOscillator();
        const lfoG = actx.createGain();
        lfo.frequency.value = 0.08;
        lfoG.gain.value = 320;
        lfo.connect(lfoG); lfoG.connect(lp.frequency);
        const pg = actx.createGain();
        pg.gain.value = st.padGain;
        pg.connect(master);
        [st.root / 2, (st.root / 2) * Math.pow(2, 7 / 12)].forEach((f, i) => {
            const o = actx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.detune.value = i === 0 ? -5 : 6;
            o.connect(lp);
            o.start();
            padNodes.push(o);
        });
        lfo.start();
        padNodes.push(lfo, pg, lp);
        padNodes._gain = pg;
    }
    function stopPad() {
        padNodes.forEach((n) => { try { n.stop ? n.stop() : n.disconnect(); } catch { } });
        padNodes = [];
    }

    function scheduler() {
        const st = STATIONS[stationIdx];
        const stepDur = 60 / st.bpm / 2;
        while (nextTime < actx.currentTime + 0.25) {
            const t = nextTime;
            if (step % 16 === 0) note(st.root / 2, t, stepDur * 10, 0.16, 'sine');           /* bass */
            if (step % 8 === 4) note(st.root, t, stepDur * 3, 0.05, st.wave);                 /* pluck accent */
            if (Math.random() < st.density) {
                const deg = st.scale[Math.floor(Math.random() * st.scale.length)];
                const oct = Math.random() < 0.3 ? 4 : (Math.random() < 0.6 ? 2 : 1);
                note(st.root * Math.pow(2, deg / 12) * oct, t, stepDur * (2 + Math.random() * 4), 0.085, st.wave);
            }
            nextTime += stepDur;
            step++;
        }
    }

    function draw() {
        raf = requestAnimationFrame(draw);
        const r = cv.getBoundingClientRect();
        if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) {
            cv.width = Math.round(r.width);
            cv.height = Math.round(r.height);
        }
        const W = cv.width, H = cv.height;
        cctx.clearRect(0, 0, W, H);
        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#5eead4';
        const N = 44;
        const bw = W / N;
        if (playing && analyser) {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            for (let i = 0; i < N; i++) {
                const v = data[Math.floor(i * data.length / N / 1.6)] / 255;
                const h = Math.max(2, v * H * 0.92);
                const grad = cctx.createLinearGradient(0, H, 0, H - h);
                grad.addColorStop(0, accent);
                grad.addColorStop(1, '#a78bfa');
                cctx.fillStyle = grad;
                cctx.beginPath();
                if (cctx.roundRect) cctx.roundRect(i * bw + 1.5, H - h, bw - 3, h, 3);
                else cctx.rect(i * bw + 1.5, H - h, bw - 3, h);
                cctx.fill();
            }
        } else {
            cctx.strokeStyle = 'rgba(255,255,255,0.18)';
            cctx.lineWidth = 2;
            cctx.beginPath();
            const now = Date.now() / 900;
            for (let x = 0; x <= W; x += 6) {
                const y = H / 2 + Math.sin(x / 60 + now) * 6;
                x === 0 ? cctx.moveTo(x, y) : cctx.lineTo(x, y);
            }
            cctx.stroke();
        }
    }

    playBtn.addEventListener('click', () => {
        if (!playing) {
            ensureAudio();
            actx.resume();
            startPad();
            nextTime = actx.currentTime + 0.06;
            step = 0;
            schedTimer = setInterval(scheduler, 40);
            playing = true;
            playBtn.textContent = '⏸';
            titleEl.textContent = STATIONS[stationIdx].name;
            subEl.textContent = STATIONS[stationIdx].sub + ' · ' + STATIONS[stationIdx].bpm + ' BPM';
        } else {
            playing = false;
            clearInterval(schedTimer);
            stopPad();
            actx.suspend();
            playBtn.textContent = '▶';
            titleEl.textContent = 'Paused';
            subEl.textContent = 'Aurora FM';
        }
    });
    volEl.addEventListener('input', () => {
        OS.settings.volume = volEl.value / 100;
        if (master) master.gain.value = OS.settings.volume * 0.9;
        store.set('settings', OS.settings);
    });

    draw();
    win.cleanups.push(() => {
        cancelAnimationFrame(raf);
        if (schedTimer) clearInterval(schedTimer);
        try { stopPad(); } catch { }
        if (actx) actx.close().catch(() => { });
    });
}

/* ============================================================
   APP: 2048
   ============================================================ */
const G2_COLORS = {
    2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'],
    16: ['#f59563', '#fff'], 32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'],
    128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'], 512: ['#edc850', '#fff'],
    1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'],
};

function render2048(body, win) {
    let grid, score, best = store.get('g2best', 0), won, over;

    body.innerHTML = `
        <div class="g2-wrap">
            <div class="g2-head">
                <div class="g2-title">2048</div>
                <div class="g2-scorebox"><div class="lbl">SCORE</div><div class="val g2-score">0</div></div>
                <div class="g2-scorebox"><div class="lbl">BEST</div><div class="val g2-best">0</div></div>
                <button class="g2-new">New Game</button>
            </div>
            <div class="g2-hint">Use arrow keys to slide the tiles. Two same numbers merge!</div>
            <div class="g2-board"></div>
        </div>`;

    const board = body.querySelector('.g2-board');
    const scoreEl = body.querySelector('.g2-score');
    const bestEl = body.querySelector('.g2-best');
    let prev = [];

    function newGame() {
        grid = Core.emptyGrid();
        Core.addRandomTile(grid);
        Core.addRandomTile(grid);
        score = 0; won = false; over = false;
        prev = [];
        draw();
    }
    function draw(popChanged) {
        scoreEl.textContent = score;
        bestEl.textContent = best;
        board.querySelectorAll('.g2-cell').forEach((c) => (c.innerHTML = ''));
        let i = 0;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const v = grid[r][c];
                const cell = board.children[i++];
                if (!v) continue;
                const tile = document.createElement('div');
                const [bg, fg] = G2_COLORS[v] || ['#3c3a32', '#fff'];
                tile.className = 'g2-tile';
                if (v === 2048) {
                    tile.style.background = 'linear-gradient(135deg, #5eead4, #7c5cff)';
                    tile.style.boxShadow = '0 0 18px rgba(94,234,212,0.65)';
                } else {
                    tile.style.background = bg;
                }
                tile.style.color = fg;
                tile.style.fontSize = v < 100 ? '1.55em' : v < 1000 ? '1.25em' : '0.95em';
                tile.style.fontWeight = '800';
                tile.textContent = v;
                if (popChanged && prev && String(prev[r * 4 + c]) !== String(v) && v !== 0 && prev[r * 4 + c] !== 0) tile.classList.add('pop');
                else if (popChanged && prev && String(prev[r * 4 + c]) === '0' && v !== 0) tile.classList.add('pop');
                cell.appendChild(tile);
            }
        }
        prev = grid.flat().map(String);

        board.querySelector('.g2-overlay')?.remove();
        if (over || (won && !board.dataset.cont)) {
            const ov = document.createElement('div');
            ov.className = 'g2-overlay';
            ov.innerHTML = `<div class="g2-msg">${over ? 'Game Over' : 'You win! ✨'}</div>
                            <button>${over ? 'Try Again' : 'Keep Going'}</button>`;
            ov.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                if (over) newGame();
                else { board.dataset.cont = '1'; ov.remove(); }
            });
            board.appendChild(ov);
        }
    }

    function move(dir) {
        if (over) return;
        if (won && board.dataset.cont !== '1') return;
        const res = Core.moveGrid(grid, dir);
        if (!res.moved) return;
        grid = res.grid;
        score += res.gained;
        if (score > best) { best = score; store.set('g2best', best); }
        Core.addRandomTile(grid);
        if (!won && Core.gridHas(grid, 2048)) { won = true; delete board.dataset.cont; }
        if (!Core.hasMoves(grid)) over = true;
        draw(true);
    }

    body.querySelector('.g2-new').addEventListener('click', newGame);

    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const onKey = (e) => {
        if (WM.focused !== win || modalBusy) return;
        if (keys[e.key]) { e.preventDefault(); move(keys[e.key]); }
    };
    document.addEventListener('keydown', onKey, true);
    win.cleanups.push(() => document.removeEventListener('keydown', onKey, true));

    /* board cells */
    for (let i = 0; i < 16; i++) {
        const c = document.createElement('div');
        c.className = 'g2-cell';
        board.appendChild(c);
    }
    /* swipe support */
    let ts = null;
    board.addEventListener('pointerdown', (e) => (ts = { x: e.clientX, y: e.clientY }));
    board.addEventListener('pointerup', (e) => {
        if (!ts) return;
        const dx = e.clientX - ts.x, dy = e.clientY - ts.y;
        ts = null;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });

    newGame();
}

/* ============================================================
   APP: Activity Monitor
   ============================================================ */
function renderActivity(body, win) {
    body.innerHTML = `
        <div class="am-wrap">
            <div class="am-charts">
                <div class="am-chart"><div class="am-label">CPU LOAD</div><div class="am-value am-cpu">—</div><canvas></canvas></div>
                <div class="am-chart"><div class="am-label">MEMORY</div><div class="am-value am-mem">—</div><canvas></canvas></div>
                <div class="am-chart"><div class="am-label">NETWORK</div><div class="am-value am-net">—</div><canvas></canvas></div>
            </div>
            <div class="am-sec">PROCESSES</div>
            <table class="am-table">
                <thead><tr><th>PROCESS</th><th>CPU</th><th>MEMORY</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>`;

    const series = {
        cpu: Array.from({ length: 48 }, () => 18 + Math.random() * 14),
        mem: Array.from({ length: 48 }, () => 38 + Math.random() * 8),
        net: Array.from({ length: 48 }, () => 10 + Math.random() * 20),
    };
    const procs = new Map();
    const tb = body.querySelector('.am-table tbody');
    let frames = 0, fps = 60, lastFpsT = performance.now();

    function procList() {
        const list = ['WindowServer', 'Dock', 'aurora-sh', 'Aurora Kernel'];
        WM.wins.forEach((w) => list.push(w.app.name));
        return [...new Set(list)];
    }
    function walk(v, min, max, step) {
        return Core.clamp(v + (Math.random() - 0.5) * step, min, max);
    }

    function drawChart(canvas, data, color, fill) {
        const r = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(r.width * dpr)) {
            canvas.width = Math.round(r.width * dpr);
            canvas.height = Math.round(64 * dpr);
        }
        const W = canvas.width, H = canvas.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(128,128,150,0.25)';
        ctx.lineWidth = 1;
        [0.25, 0.5, 0.75].forEach((f) => {
            ctx.beginPath(); ctx.moveTo(0, H * f); ctx.lineTo(W, H * f); ctx.stroke();
        });
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = (i / (data.length - 1)) * W;
            const y = H - (v / 100) * H;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * (window.devicePixelRatio || 1) / 2;
        ctx.stroke();
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, fill);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fill();
    }

    const canvases = body.querySelectorAll('canvas');
    const accent = () => getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#5eead4';

    function tick() {
        series.cpu.push(walk(series.cpu[series.cpu.length - 1], 4, 96, 9)); series.cpu.shift();
        series.mem.push(walk(series.mem[series.mem.length - 1], 25, 90, 3)); series.mem.shift();
        series.net.push(walk(series.net[series.net.length - 1], 1, 95, 22)); series.net.shift();
        body.querySelector('.am-cpu').textContent = series.cpu[47].toFixed(0) + '%';
        body.querySelector('.am-mem').textContent = series.mem[47].toFixed(0) + '%';
        body.querySelector('.am-net').textContent = (series.net[47] / 8).toFixed(1) + ' MB/s';
        drawChart(canvases[0], series.cpu, accent(), 'rgba(94,234,212,0.25)');
        drawChart(canvases[1], series.mem, '#a78bfa', 'rgba(167,139,250,0.25)');
        drawChart(canvases[2], series.net, '#7dd3fc', 'rgba(125,211,252,0.25)');

        const names = procList();
        const rows = names.map((n) => {
            if (!procs.has(n)) procs.set(n, { cpu: Math.random() * 6, mem: 20 + Math.random() * 120 });
            const p = procs.get(n);
            p.cpu = walk(p.cpu, 0, 38, 3);
            return `<tr class="am-row"><td>${Core.esc(n)}</td><td>${p.cpu.toFixed(1)}%</td><td>${p.mem.toFixed(0)} MB</td></tr>`;
        });
        tb.innerHTML = rows.join('');
    }

    const rafLoop = () => {
        frames++;
        const now = performance.now();
        if (now - lastFpsT >= 1000) { fps = frames; frames = 0; lastFpsT = now; }
        raf = requestAnimationFrame(rafLoop);
    };
    let raf = requestAnimationFrame(rafLoop);

    tick();
    const iv = setInterval(tick, 1000);
    win.cleanups.push(() => { clearInterval(iv); cancelAnimationFrame(raf); });
    win.cleanups.push(() => { });
}

/* ============================================================
   APP: Calendar
   ============================================================ */
function renderCalendar(body, win) {
    const today = new Date();
    let y = today.getFullYear(), m = today.getMonth();
    let evts = store.get('calevents', {});

    body.innerHTML = `
        <div class="cal-wrap">
            <div class="cal-head">
                <button class="cal-nav" data-nav="prev">‹</button>
                <div class="cal-title"></div>
                <button class="cal-nav" data-nav="next">›</button>
                <button class="cal-today-btn">Today</button>
            </div>
            <div class="cal-grid">
                ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
            </div>
            <div class="cal-hint">Click a day to mark it with an event dot</div>
        </div>`;

    const grid = body.querySelector('.cal-grid');
    const title = body.querySelector('.cal-title');

    function draw() {
        title.textContent = `${MONTHS[m]} ${y}`;
        grid.querySelectorAll('.cal-day').forEach((d) => d.remove());
        buildMonthCells(y, m).forEach((c) => {
            const b = document.createElement('button');
            b.className = 'cal-day' + (c.dim ? ' dim' : '') + (c.today ? ' today' : '') + (c.hasEvt ? ' evt' : '');
            b.textContent = c.d;
            if (!c.dim && c.key) {
                b.title = c.hasEvt ? 'Has event — click to remove' : 'Click to add event';
                b.addEventListener('click', () => {
                    evts = store.get('calevents', {});
                    if (evts[c.key]) delete evts[c.key];
                    else {
                        evts[c.key] = true;
                        notify('📅', 'Event added', `${MONTHS[m].slice(0, 3)} ${c.d}, ${y}`);
                    }
                    store.set('calevents', evts);
                    draw();
                });
            }
            grid.appendChild(b);
        });
    }
    body.querySelector('[data-nav="prev"]').addEventListener('click', () => {
        m--; if (m < 0) { m = 11; y--; } draw();
    });
    body.querySelector('[data-nav="next"]').addEventListener('click', () => {
        m++; if (m > 11) { m = 0; y++; } draw();
    });
    body.querySelector('.cal-today-btn').addEventListener('click', () => {
        const t = new Date(); y = t.getFullYear(); m = t.getMonth(); draw();
    });
    draw();
}

/* ============================================================
   APP: Settings
   ============================================================ */
function renderSettings(body, win) {
    let tab = 'appearance';
    body.innerHTML = `
        <div class="st-wrap">
            <div class="st-side">
                <div class="fx-side-title">SETTINGS</div>
                <button class="st-side-item" data-tab="appearance"><span>🎨</span> Appearance</button>
                <button class="st-side-item" data-tab="wallpaper"><span>🖼</span> Wallpaper</button>
                <button class="st-side-item" data-tab="about"><span>◍</span> About</button>
            </div>
            <div class="st-main"></div>
        </div>`;

    const main = body.querySelector('.st-main');

    function draw() {
        body.querySelectorAll('.st-side-item').forEach((b) => b.classList.toggle('sel', b.dataset.tab === tab));
        if (tab === 'appearance') {
            main.innerHTML = `
                <div class="st-h">Appearance</div>
                <div class="st-row">
                    <div><div class="st-label">Theme</div><div class="st-sub">Glass by day, aurora by night</div></div>
                    <div class="st-seg">
                        <button class="st-seg-btn ${OS.settings.dark ? 'sel' : ''}" data-v="dark">🌙 Dark</button>
                        <button class="st-seg-btn ${!OS.settings.dark ? 'sel' : ''}" data-v="light">☀️ Light</button>
                    </div>
                </div>
                <div class="st-row">
                    <div><div class="st-label">Accent color</div><div class="st-sub">Used across buttons, focus rings and menus</div></div>
                    <div class="st-swatches">
                        ${Object.entries(ACCENTS).map(([k, a]) =>
                `<button class="st-swatch ${OS.settings.accent === k ? 'sel' : ''}" data-v="${k}" style="background:${a.c}" title="${k}"></button>`).join('')}
                    </div>
                </div>
                <div class="st-row">
                    <div><div class="st-label">Night Light</div><div class="st-sub">Warms the display after dark</div></div>
                    <div class="st-seg">
                        <button class="st-seg-btn ${OS.settings.nightLight ? 'sel' : ''}" data-v="on">On</button>
                        <button class="st-seg-btn ${!OS.settings.nightLight ? 'sel' : ''}" data-v="off">Off</button>
                    </div>
                </div>
                <div class="st-row">
                    <div><div class="st-label">Brightness</div><div class="st-sub">Screen brightness overlay</div></div>
                    <input type="range" class="cc-slider" min="30" max="100" value="${Math.round(OS.settings.brightness * 100)}" style="width:150px">
                </div>`;
            main.querySelectorAll('[data-v="dark"],[data-v="light"]').forEach((b) => b.addEventListener('click', () => {
                OS.settings.dark = b.dataset.v === 'dark'; applySettings(); draw();
            }));
            main.querySelectorAll('.st-swatch').forEach((b) => b.addEventListener('click', () => { setAccent(b.dataset.v); draw(); }));
            main.querySelectorAll('.st-seg').forEach((seg) => {
                if (seg.querySelector('[data-v="on"]')) {
                    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
                        OS.settings.nightLight = b.dataset.v === 'on'; applySettings(); draw();
                    }));
                }
            });
            const br = main.querySelector('input[type=range]');
            br.addEventListener('input', () => {
                OS.settings.brightness = br.value / 100; applySettings();
            });
        } else if (tab === 'wallpaper') {
            main.innerHTML = `
                <div class="st-h">Wallpaper</div>
                <div class="st-walls">
                    ${WALLPAPERS.map((w) => `
                        <button class="st-wall ${OS.settings.wallpaper === w.id ? 'sel' : ''}" data-v="${w.id}">
                            <div class="st-wall-thumb" style="background-image:url('${w.file}')"></div>
                            <div class="st-wall-name">${w.name}</div>
                        </button>`).join('')}
                </div>`;
            main.querySelectorAll('.st-wall').forEach((b) => b.addEventListener('click', () => {
                setWallpaper(b.dataset.v);
                draw();
            }));
        } else {
            const used = Object.keys(localStorage)
                .filter((k) => k.startsWith('auroraos:'))
                .reduce((a, k) => a + k.length + (localStorage.getItem(k) || '').length, 0);
            main.innerHTML = `
                <div class="st-h">About</div>
                <div class="st-about">
                    <div class="ab-logo"><div class="aurora-ring"></div><span class="ab-glyph">◍</span></div>
                    <div class="ab-name">Aurora OS</div>
                    <div class="ab-ver">Version 1.0 “Borealis” (Build 2026.09)</div>
                </div>
                <div class="ab-rows">
                    <div class="ab-row"><b>Chip</b><span>Aurora A1 · imaginary cores</span></div>
                    <div class="ab-row"><b>Memory</b><span>16 GB unified (your browser's RAM, really)</span></div>
                    <div class="ab-row"><b>Storage used</b><span>${Core.fmtBytes(used)} in localStorage</span></div>
                    <div class="ab-row"><b>Renderer</b><span>${Core.esc(navigator.userAgent.slice(0, 64))}…</span></div>
                    <div class="ab-row"><b>Apps installed</b><span>${Object.keys(APPS).length - 1}</span></div>
                </div>
                <div class="st-row" style="border:none;padding-top:18px">
                    <div><div class="st-label">Reset Aurora OS</div><div class="st-sub">Wipes files, notes, scores and settings</div></div>
                    <button class="st-btn danger" data-nav="reset">Reset…</button>
                </div>`;
            main.querySelector('[data-nav="reset"]').addEventListener('click', async () => {
                if (await dialogConfirm('Reset Aurora OS?', 'All your Aurora OS data in this browser will be erased.', 'Erase Everything')) {
                    Object.keys(localStorage).filter((k) => k.startsWith('auroraos:')).forEach((k) => localStorage.removeItem(k));
                    location.reload();
                }
            });
        }
    }
    body.querySelectorAll('.st-side-item').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
    win.refresh = draw;
    draw();
}

/* ============================================================
   APP: About
   ============================================================ */
function renderAbout(body, win) {
    const used = Object.keys(localStorage).filter((k) => k.startsWith('auroraos:')).length;
    body.innerHTML = `
        <div class="ab-wrap" style="justify-content:center">
            <div class="ab-logo"><div class="aurora-ring"></div><span class="ab-glyph">◍</span></div>
            <div class="ab-name">Aurora OS</div>
            <div class="ab-ver">Version 1.0 “Borealis”</div>
            <div class="ab-rows" style="margin-top:16px">
                <div class="ab-row"><b>Theme</b><span>Glassmorphic aurora</span></div>
                <div class="ab-row"><b>Engine</b><span>Vanilla HTML · CSS · JS</span></div>
                <div class="ab-row"><b>User</b><span>${Core.esc(OS.user.name || 'Explorer')}</span></div>
                <div class="ab-row"><b>Uptime</b><span class="ab-uptime">${Core.fmtUptime(Date.now() - OS.startTime)}</span></div>
            </div>
            <div style="font-size:11px;color:var(--text-faint);margin-top:14px">Made with ✨ in the browser — no servers, no installs</div>
        </div>`;
    const iv = setInterval(() => {
        const el = body.querySelector('.ab-uptime');
        if (el) el.textContent = Core.fmtUptime(Date.now() - OS.startTime);
    }, 1000);
    win.cleanups.push(() => clearInterval(iv));
}

/* ============================================================
   APP REGISTRY
   ============================================================ */
const APPS = {
    files:    { name: 'Files',       icon: '📂', grad: ['#6a8dff', '#9b5cff'], w: 860, h: 540, render: (b, w) => renderFiles(b, w) },
    notes:    { name: 'Notes',       icon: '📝', grad: ['#ffb454', '#ff7a3d'], w: 720, h: 480, render: renderNotes },
    calc:     { name: 'Calculator',  icon: '🧮', grad: ['#98a2b3', '#5b6472'], w: 300, h: 460, fixed: true, render: renderCalc },
    terminal: { name: 'Terminal',    icon: '❯_', mono: true, grad: ['#2b3548', '#101623'], w: 700, h: 440, render: renderTerminal },
    paint:    { name: 'Paint',       icon: '🎨', grad: ['#ff6ea9', '#b25cff'], w: 880, h: 600, render: renderPaint },
    music:    { name: 'Aurora FM',   icon: '🎵', grad: ['#7c5cff', '#38bdf8'], w: 520, h: 430, render: renderMusic },
    game2048: { name: '2048',        icon: '🔢', grad: ['#22d3a7', '#0ea5e9'], w: 420, h: 560, fixed: true, render: render2048 },
    activity: { name: 'Activity',    icon: '📊', grad: ['#34d399', '#059669'], w: 780, h: 560, render: renderActivity },
    calendar: { name: 'Calendar',    icon: '📅', grad: ['#ff5f6d', '#ff9966'], w: 430, h: 500, render: renderCalendar },
    settings: { name: 'Settings',    icon: '⚙️', grad: ['#a8b0c0', '#6b7280'], w: 800, h: 560, render: renderSettings },
    trash:    { name: 'Trash',       icon: '🗑', grad: ['#7dd3fc', '#6366f1'], w: 780, h: 500, render: (b, w) => renderFiles(b, w, { trash: true }) },
    editor:   { name: 'Editor',      icon: '📄', grad: ['#94a3b8', '#64748b'], w: 640, h: 480, render: renderEditor, inDock: false },
    about:    { name: 'About Aurora OS', icon: '◍', grad: ['#5eead4', '#7c5cff'], w: 380, h: 430, fixed: true, render: renderAbout, inDock: false },
};
const DOCK_APPS = ['files', 'notes', 'calc', 'terminal', 'paint', 'music', 'game2048', 'activity', 'calendar', 'settings', 'sep', 'trash'];

/* ============================================================
   SPOTLIGHT
   ============================================================ */
let spotSel = 0;
let spotItems = [];
function openSpotlight() {
    hideAllMenus();
    const sp = $('spotlight');
    sp.classList.remove('hidden');
    const inp = $('spot-input');
    inp.value = '';
    renderSpotResults('');
    setTimeout(() => inp.focus(), 40);
}
function closeSpotlight() {
    $('spotlight').classList.add('hidden');
    $('spot-input').blur();
}
function buildSpotItems(q) {
    q = q.toLowerCase().trim();
    const items = [];
    Object.entries(APPS).forEach(([id, app]) => {
        if (app.inDock === false && id !== 'about') return;
        if (!q || app.name.toLowerCase().includes(q)) items.push({ icon: app.icon, name: app.name, hint: 'Application', run: () => openApp(id) });
    });
    const actions = [
        { icon: '🌓', name: 'Toggle Dark Mode', hint: 'Action', run: toggleDark },
        { icon: '🖼', name: 'Next Wallpaper', hint: 'Action', run: nextWallpaper },
        { icon: '🛏', name: 'Toggle Night Light', hint: 'Action', run: () => { OS.settings.nightLight = !OS.settings.nightLight; applySettings(); } },
        { icon: '🔒', name: 'Lock Screen', hint: 'Action', run: lockOS },
        { icon: '⏻', name: 'Shut Down', hint: 'Action', run: shutdownOS },
    ];
    actions.forEach((a) => { if (!q || a.name.toLowerCase().includes(q)) items.push(a); });
    if (q) {
        /* files */
        (function walk(node, path) {
            if (!node || !node.children || path.length > 3) return;
            Object.entries(node.children).forEach(([name, child]) => {
                const p = path.concat(name);
                if (name.toLowerCase().includes(q) && child.type === 'file') {
                    items.push({ icon: '📄', name, hint: 'File · ' + path.slice(0, 2).join('/'), run: () => openEditor(p) });
                }
                if (child.type === 'folder') walk(child, p);
            });
        })(FS, []);
        /* notes */
        notes.forEach((n) => {
            if ((n.title || '').toLowerCase().includes(q) || n.body.toLowerCase().includes(q)) {
                items.push({ icon: '📝', name: n.title || 'Untitled', hint: 'Note', run: () => openApp('notes') });
            }
        });
    }
    return items.slice(0, 9);
}
function renderSpotResults(q) {
    spotItems = buildSpotItems(q);
    spotSel = 0;
    const box = $('spot-results');
    if (!spotItems.length) {
        box.innerHTML = '<div class="spot-none">Nothing found — try “notes”, “paint”, “dark”…</div>';
        return;
    }
    box.innerHTML = '';
    spotItems.forEach((it, i) => {
        const el = document.createElement('div');
        el.className = 'spot-item' + (i === spotSel ? ' sel' : '');
        el.innerHTML = `<div class="spot-item-icon">${it.icon}</div><div class="spot-item-name">${Core.esc(it.name)}</div><div class="spot-item-hint">${Core.esc(it.hint)}</div>`;
        el.addEventListener('mouseenter', () => {
            spotSel = i;
            box.querySelectorAll('.spot-item').forEach((x, j) => x.classList.toggle('sel', j === i));
        });
        el.addEventListener('click', () => { closeSpotlight(); it.run(); });
        box.appendChild(el);
    });
}
function initSpotlight() {
    const inp = $('spot-input');
    inp.addEventListener('input', () => renderSpotResults(inp.value));
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            spotSel = Math.min(spotSel + 1, spotItems.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            spotSel = Math.max(spotSel - 1, 0);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (spotItems[spotSel]) { closeSpotlight(); spotItems[spotSel].run(); }
            return;
        } else if (e.key === 'Escape') {
            closeSpotlight();
            return;
        } else return;
        $('spot-results').querySelectorAll('.spot-item').forEach((x, j) => x.classList.toggle('sel', j === spotSel));
    });
    $('spotlight').addEventListener('pointerdown', (e) => { if (e.target === $('spotlight')) closeSpotlight(); });
}

/* ============================================================
   CONTROL CENTER
   ============================================================ */
function renderControlCenter() {
    const cc = $('control-center');
    const wp = WALLPAPERS.find((w) => w.id === OS.settings.wallpaper) || WALLPAPERS[0];
    cc.innerHTML = `
        <div class="cc-tiles">
            <button class="cc-tile ${OS.settings.dark ? 'on' : ''}" data-nav="dark">
                <span class="cc-tile-icon">${OS.settings.dark ? '🌙' : '☀️'}</span>
                <span>Dark Mode<small>${OS.settings.dark ? 'On' : 'Off'}</small></span>
            </button>
            <button class="cc-tile ${OS.settings.nightLight ? 'on' : ''}" data-nav="night">
                <span class="cc-tile-icon">🛏</span>
                <span>Night Light<small>${OS.settings.nightLight ? 'On' : 'Off'}</small></span>
            </button>
        </div>
        <div class="cc-sec-label">DISPLAY</div>
        <div class="cc-slider-row">☀️<input type="range" class="cc-slider" id="cc-brightness" min="30" max="100" value="${Math.round(OS.settings.brightness * 100)}"></div>
        <div class="cc-sec-label">SOUND</div>
        <div class="cc-slider-row">🔊<input type="range" class="cc-slider" id="cc-volume" min="0" max="100" value="${Math.round(OS.settings.volume * 100)}"></div>
        <div class="cc-sec-label">ACCENT</div>
        <div class="cc-dots">
            ${Object.entries(ACCENTS).map(([k, a]) =>
        `<button class="cc-dot ${OS.settings.accent === k ? 'sel' : ''}" data-v="${k}" style="background:${a.c}" title="${k}"></button>`).join('')}
        </div>
        <div class="cc-wp">
            <div class="cc-wp-name">🖼 ${wp.name}</div>
            <button class="cc-wp-btn" data-nav="shuffle">Shuffle</button>
        </div>`;
    cc.querySelector('[data-nav="dark"]').addEventListener('click', () => { toggleDark(); renderControlCenter(); });
    cc.querySelector('[data-nav="night"]').addEventListener('click', () => {
        OS.settings.nightLight = !OS.settings.nightLight;
        applySettings();
        renderControlCenter();
    });
    cc.querySelector('#cc-brightness').addEventListener('input', (e) => {
        OS.settings.brightness = e.target.value / 100;
        applySettings();
    });
    cc.querySelector('#cc-volume').addEventListener('input', (e) => {
        OS.settings.volume = e.target.value / 100;
        store.set('settings', OS.settings);
    });
    cc.querySelectorAll('.cc-dot').forEach((d) => d.addEventListener('click', () => {
        setAccent(d.dataset.v);
        renderControlCenter();
    }));
    cc.querySelector('[data-nav="shuffle"]').addEventListener('click', () => {
        nextWallpaper();
        renderControlCenter();
    });
}

/* ============================================================
   DESKTOP init + global events
   ============================================================ */
function initDesktop() {
    applySettings();
    initDock();
    initDesktopIcons();
    initMenubar();
    initSpotlight();
    initStatus();
    tickClock();
    setInterval(tickClock, 1000);

    /* desktop context menu */
    const dt = $('desktop');
    dt.addEventListener('contextmenu', (e) => {
        if (e.target.closest('input') || e.target.closest('textarea')) return;
        e.preventDefault();
        if (e.target.closest('.window') || e.target.closest('#dock') || e.target.closest('#menubar')) return;
        showContextMenu(e.clientX, e.clientY, [
            { label: 'New Note', icon: '📝', action: () => { openApp('notes'); } },
            { label: 'Open Terminal', icon: '⌨️', action: () => openApp('terminal') },
            'sep',
            { label: 'Next Wallpaper', icon: '🖼', action: nextWallpaper },
            { label: OS.settings.dark ? 'Switch to Light Mode' : 'Switch to Dark Mode', icon: '🌓', action: toggleDark },
            'sep',
            { label: 'System Settings…', icon: '⚙️', action: () => openApp('settings') },
            { label: 'About Aurora OS', icon: '◍', action: () => openApp('about') },
        ]);
    });

    /* close popovers when clicking elsewhere */
    document.addEventListener('pointerdown', (e) => {
        const t = e.target;
        if (!t.closest('#mb-menu') && !t.closest('#mb-logo')) $('mb-menu').classList.add('hidden');
        if (!t.closest('#clock-pop') && !t.closest('#mb-clock')) $('clock-pop').classList.add('hidden');
        if (!t.closest('#control-center') && !t.closest('#mb-cc')) $('control-center').classList.add('hidden');
        if (!t.closest('#context-menu')) $('context-menu').classList.add('hidden');
    }, true);

    /* global keys */
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === ' ')) {
            e.preventDefault();
            const sp = $('spotlight');
            sp.classList.contains('hidden') ? openSpotlight() : closeSpotlight();
        } else if (e.key === 'Escape') {
            if (!$('spotlight').classList.contains('hidden')) closeSpotlight();
            hideAllMenus();
        }
    });

    /* keep windows on screen when viewport shrinks */
    window.addEventListener('resize', () => {
        WM.wins.forEach((w) => {
            const el = w.el;
            if (w.maxed) {
                el.style.width = (innerWidth - 12) + 'px';
                el.style.height = (innerHeight - MENUBAR - 100) + 'px';
                return;
            }
            el.style.left = Core.clamp(parseFloat(el.style.left) || 0, -el.offsetWidth + 90, Math.max(8, innerWidth - 90)) + 'px';
            el.style.top = Core.clamp(parseFloat(el.style.top) || 0, MENUBAR, Math.max(MENUBAR, innerHeight - 44)) + 'px';
        });
    });
}

/* ============================================================
   STARTUP
   ============================================================ */
function start() {
    applySettings();
    $('login-btn').addEventListener('click', doLogin);
    $('login-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    $('login-screen').addEventListener('dblclick', () => { if ($('login-screen').classList.contains('locked')) doLogin(); });
    $('power-on-btn').addEventListener('click', () => {
        $('power-screen').classList.add('hidden');
        runBoot(() => showLogin(false));
    });
    updateLoginClock();
    setInterval(updateLoginClock, 1000);
    runBoot(() => showLogin(false));
}
start();

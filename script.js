const bootScreen = document.getElementById('boot-screen');
const desktop = document.getElementById('desktop');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const emojiInput = document.getElementById('emoji-input');
const bootBtn = document.getElementById('boot-btn');
const bootStatus = document.getElementById('boot-status');
const bootSubtitle = document.getElementById('boot-subtitle');
const usernameDisplay = document.getElementById('username-display');
const taskbar = document.getElementById('taskbar');
const startMenu = document.getElementById('start-menu');
const contextMenu = document.getElementById('context-menu');
const altTabOverlay = document.getElementById('alt-tab-overlay');
const altTabGrid = document.getElementById('alt-tab-grid');
const showDesktopBtn = document.getElementById('show-desktop-btn');

let currentUser = null;
let booted = false;
let bootState = 'boot';
let windowZ = 100;
let openWindows = [];
let minimizedWindows = [];
let altTabIndex = -1;
let isAltTab = false;
let previousFocus = null;
let showDesktopState = false;
let lastDesktopState = [];
let lockInput = false;
let isDragging = false;

const windowRegistry = {};
const cleanups = {};
const contextMenuState = { icon: null, x: 0, y: 0 };

function loadAccounts() {
    try { return JSON.parse(localStorage.getItem('cyberos_accounts') || '{}'); } catch { return {}; }
}
function saveAccounts(acc) { localStorage.setItem('cyberos_accounts', JSON.stringify(acc)); }
function hashPW(pw) { return btoa(pw); }

function collectUserData() {
    const data = {};
    const notesWin = windowRegistry.notes;
    if (notesWin) {
        const ta = notesWin.querySelector('textarea');
        if (ta) data.notes = ta.value;
    }
    const todoWin = windowRegistry.todo;
    if (todoWin) {
        const items = [];
        todoWin.querySelectorAll('#todo-items-' + todoWin.id + ' > div').forEach(div => {
            const cb = div.querySelector('input[type=checkbox]');
            const label = div.querySelector('span');
            if (label) items.push({ text: label.textContent, checked: cb ? cb.checked : false });
        });
        data.todos = items;
    }
    const aiWin = windowRegistry.ai;
    if (aiWin) {
        const log = aiWin.querySelector('[id^="ai-log-"]');
        if (log) {
            const msgs = [];
            log.querySelectorAll('p').forEach(p => {
                const text = p.textContent || '';
                const isUser = text.startsWith('You:');
                msgs.push({ role: isUser ? 'user' : 'assistant', text: isUser ? text.slice(4).trim() : text });
            });
            data.aiChat = msgs;
        }
    }
    return data;
}

function applyUserData(data) {
    if (!data) return;
    if (data.notes) {
        setTimeout(() => {
            const notesWin = windowRegistry.notes;
            if (notesWin) {
                const ta = notesWin.querySelector('textarea');
                if (ta) ta.value = data.notes;
            }
        }, 100);
    }
    if (data.todos) {
        setTimeout(() => {
            const todoWin = windowRegistry.todo;
            if (todoWin) renderTodoItems(todoWin, data.todos);
        }, 100);
    }
    if (data.aiChat) {
        setTimeout(() => {
            const aiWin = windowRegistry.ai;
            if (aiWin) {
                const log = aiWin.querySelector('[id^="ai-log-"]');
                if (log) {
                    log.innerHTML = '';
                    data.aiChat.forEach(msg => {
                        const p = document.createElement('p');
                        p.textContent = (msg.role === 'user' ? 'You: ' : '') + msg.text;
                        p.style.color = msg.role === 'user' ? '#88ff88' : '#88ccff';
                        log.appendChild(p);
                    });
                    log.scrollTop = log.scrollHeight;
                }
            }
        }, 100);
    }
}

function saveUserSession() {
    if (!currentUser) return;
    const accounts = loadAccounts();
    if (accounts[currentUser]) {
        accounts[currentUser].data = collectUserData();
        saveAccounts(accounts);
    }
}

function bootUser(username, password) {
    const accounts = loadAccounts();
    const emoji = emojiInput.value.trim() || '\u{1F464}';
    if (accounts[username]) {
        if (hashPW(password) !== accounts[username].password) {
            bootStatus.textContent = 'Wrong password!';
            return false;
        }
        currentUser = username;
        usernameDisplay.textContent = `${accounts[username].emoji || emoji} ${username}`;
        if (!booted) {
            applyWp();
            createDesktopIcons();
            booted = true;
        }
        bootScreen.classList.add('hidden');
        desktop.classList.remove('hidden');
        applyUserData(accounts[username].data);
        return true;
    } else {
        accounts[username] = { password: hashPW(password), emoji, data: {} };
        saveAccounts(accounts);
        currentUser = username;
        usernameDisplay.textContent = `${emoji} ${username}`;
        if (!booted) {
            applyWp();
            createDesktopIcons();
            booted = true;
        }
        bootScreen.classList.add('hidden');
        desktop.classList.remove('hidden');
        return true;
    }
}

function populateBootScreen() {
    const accounts = loadAccounts();
    bootStatus.textContent = '';
    if (bootState === 'lock') {
        bootSubtitle.textContent = `Enter password for ${currentUser}`;
        usernameInput.value = currentUser;
        usernameInput.disabled = true;
        passwordInput.value = '';
        passwordInput.focus();
        bootBtn.textContent = 'UNLOCK';
        emojiInput.closest('.boot-input-row').style.display = 'none';
        document.getElementById('password-row').style.display = 'flex';
    } else {
        bootSubtitle.textContent = 'Welcome, Space Cadet!';
        usernameInput.disabled = false;
        passwordInput.value = '';
        emojiInput.closest('.boot-input-row').style.display = 'flex';
        document.getElementById('password-row').style.display = 'flex';
        const recent = Object.keys(accounts);
        if (recent.length > 0) {
            const lastUser = recent[recent.length - 1];
            usernameInput.value = lastUser;
            bootSubtitle.textContent = `Welcome back, ${lastUser}!`;
        }
        passwordInput.focus();
        bootBtn.textContent = 'LOGIN';
    }
}

function handleBoot() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) { bootStatus.textContent = 'Fill all fields!'; return; }
    bootUser(username, password);
}

usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') passwordInput.focus(); });
passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleBoot(); });
bootBtn.addEventListener('click', handleBoot);

function minimizeWindow(id) {
    const win = document.getElementById(id);
    if (!win) return;
    win.classList.add('minimizing');
    setTimeout(() => {
        win.classList.add('hidden');
        win.classList.remove('minimizing');
        if (!minimizedWindows.includes(id)) minimizedWindows.push(id);
        updateTaskbar();
    }, 200);
}

function closeWindow(id) {
    const win = document.getElementById(id);
    if (win) win.remove();
    openWindows = openWindows.filter(w => w !== id);
    minimizedWindows = minimizedWindows.filter(w => w !== id);
    Object.keys(windowRegistry).forEach(k => { if (windowRegistry[k] && windowRegistry[k].id === id) delete windowRegistry[k]; });
    if (cleanups[id]) { cleanups[id](); delete cleanups[id]; }
    updateTaskbar();
    if (openWindows.length === 0) { showDesktopState = false; lastDesktopState = []; }
}

function maximizeWindow(id) {
    const win = document.getElementById(id);
    if (!win) return;
    win.classList.toggle('maximized');
    updateTaskbar();
}

function updateTaskbar() {
    taskbar.querySelectorAll('.taskbar-btn').forEach(btn => {
        const app = btn.dataset.app;
        const isOpen = openWindows.some(w => w.startsWith(app + '-'));
        const isMinimized = minimizedWindows.some(w => w.startsWith(app + '-'));
        btn.classList.toggle('active', isOpen && !isMinimized);
        btn.classList.toggle('minimized', isMinimized);
    });
}

function focusWindow(id) {
    if (lockInput) return;
    const win = document.getElementById(id);
    if (!win) return;
    windowZ++;
    win.style.zIndex = windowZ;
    win.classList.remove('minimized-style');
    minimizedWindows = minimizedWindows.filter(w => w !== id);
    openWindows = openWindows.filter(w => w !== id);
    openWindows.push(id);
    updateTaskbar();
}

function toggleWindow(type) {
    if (lockInput) return;
    const existing = Object.keys(windowRegistry).find(k => windowRegistry[k] && windowRegistry[k].id && windowRegistry[k].id.startsWith(type + '-'));
    if (existing && windowRegistry[existing]) {
        const winId = windowRegistry[existing].id;
        const win = document.getElementById(winId);
        if (win && !win.classList.contains('hidden')) {
            if (minimizedWindows.includes(winId)) {
                focusWindow(winId);
            } else {
                minimizeWindow(winId);
            }
        } else if (win) {
            win.classList.remove('hidden');
            minimizedWindows = minimizedWindows.filter(w => w !== id);
            focusWindow(winId);
        } else {
            createWindow(type);
        }
    } else {
        createWindow(type);
    }
}

function createWindow(type) {
    if (lockInput) return;
    const app = apps[type];
    if (!app) return;
    const id = type + '-' + Date.now();
    const win = document.createElement('div');
    win.className = 'window';
    win.id = id;
    windowZ++;
    win.style.zIndex = windowZ;
    const title = app.title;
    win.innerHTML = `<div class="window-header" data-window-id="${id}"><span class="window-title">${title}</span><div class="window-controls"><button class="win-btn win-min" data-action="minimize" data-win="${id}">\u{2014}</button><button class="win-btn win-max" data-action="maximize" data-win="${id}">\u{25A1}</button><button class="win-btn win-close" data-action="close" data-win="${id}">\u2715</button></div></div><div class="window-content"></div>`;
    desktop.appendChild(win);
    const content = win.querySelector('.window-content');
    app.createContent(content, id);
    openWindows.push(id);
    if (!openWindows.includes(id)) openWindows.push(id);
    updateTaskbar();

    const header = win.querySelector('.window-header');
    let offX, offY;
    const onStart = (e) => {
        if (lockInput) return;
        if (e.target.closest('.window-controls')) return;
        focusWindow(id);
        const ev = e.touches ? e.touches[0] : e;
        const rect = win.getBoundingClientRect();
        offX = ev.clientX - rect.left;
        offY = ev.clientY - rect.top;
        isDragging = true;
        const onMove = (e2) => {
            if (lockInput) return;
            const ev2 = e2.touches ? e2.touches[0] : e2;
            let x = ev2.clientX - offX;
            let y = ev2.clientY - offY;
            x = Math.max(0, Math.min(x, window.innerWidth - rect.width));
            y = Math.max(0, Math.min(y, window.innerHeight - rect.height));
            win.style.left = x + 'px';
            win.style.top = y + 'px';
            win.style.transform = 'none';
        };
        const onEnd = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd);
    };
    header.addEventListener('mousedown', onStart);
    header.addEventListener('touchstart', onStart, { passive: true });

    win.addEventListener('mousedown', () => focusWindow(id));
    win.addEventListener('touchstart', () => focusWindow(id), { passive: true });

    win.querySelector('.win-min').addEventListener('click', () => minimizeWindow(id));
    win.querySelector('.win-max').addEventListener('click', () => maximizeWindow(id));
    win.querySelector('.win-close').addEventListener('click', () => closeWindow(id));

    const initialX = Math.max(0, (window.innerWidth - 400) / 2 + Math.random() * 40 - 20);
    const initialY = Math.max(0, (window.innerHeight - 350) / 2 + Math.random() * 40 - 20);
    win.style.left = initialX + 'px';
    win.style.top = initialY + 'px';
    win.style.width = '400px';
    win.style.height = '350px';

    windowRegistry[type] = win;
    return win;
}

// Taskbar event delegation
taskbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.taskbar-btn');
    if (btn) toggleWindow(btn.dataset.app);
});

// Taskbar hover preview
taskbar.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.taskbar-btn');
    if (!btn) return;
    const app = btn.dataset.app;
    const win = windowRegistry[app];
    if (!win) return;
    if (document.getElementById('preview-' + app)) return;
    const preview = document.createElement('div');
    preview.id = 'preview-' + app;
    preview.style.cssText = 'position:fixed;bottom:48px;left:' + btn.offsetLeft + 'px;width:200px;height:150px;background:rgba(10,25,49,0.95);border:1px solid rgba(51,255,51,0.3);border-radius:6px;z-index:99999;overflow:hidden;pointer-events:none;';
    const clone = win.cloneNode(true);
    clone.style.cssText = 'width:100%;height:100%;transform:scale(0.5);transform-origin:top left;pointer-events:none;';
    preview.appendChild(clone);
    document.body.appendChild(preview);
});

taskbar.addEventListener('mouseout', (e) => {
    const btn = e.target.closest('.taskbar-btn');
    if (!btn) return;
    const app = btn.dataset.app;
    const preview = document.getElementById('preview-' + app);
    if (preview) preview.remove();
});

// Desktop event delegation
desktop.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenuState.x = e.clientX;
    contextMenuState.y = e.clientY;
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.classList.remove('hidden');
});

document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    if (!startMenu.contains(e.target) && !e.target.closest('.profile-logo')) startMenu.classList.add('hidden');
});

// Build context menu
contextMenu.innerHTML = '<div class="cm-item" data-action="refresh">\u{1F504} Refresh</div><div class="cm-item" data-action="view">\u{1F441} Show/Hide Desktop Icons</div><div class="cm-item-wrap"><div class="cm-item has-sub" data-action="sort">\u{1F4CB} Sort by</div><div class="cm-submenu"><div class="cm-item" data-sort="name">Name</div><div class="cm-item" data-sort="size">Size</div><div class="cm-item" data-sort="type">Type</div><div class="cm-item" data-sort="date">Date modified</div></div></div><div class="cm-separator"></div><div class="cm-item" data-action="new-text">\u{1F4DD} New Text Document</div>';
contextMenu.querySelectorAll('.cm-item').forEach(function(item){
    item.onclick = function(){
        var action = item.dataset.action;
        if (action === 'sort') return;
        contextMenu.classList.add('hidden');
        if (action === 'refresh') {}
        else if (action === 'view') {
            var icons = document.getElementById('desktop-icons');
            icons.style.display = icons.style.display === 'none' ? '' : 'none';
        } else if (action === 'new-text') {
            alert('New text document would be created on desktop');
        }
    };
});
contextMenu.querySelectorAll('.cm-submenu .cm-item').forEach(function(item){
    item.onclick = function(){
        contextMenu.classList.add('hidden');
        var method = item.dataset.sort;
        var container = document.getElementById('desktop-icons');
        var items = Array.from(container.children);
        if (method === 'name') {
            items.sort(function(a,b){ return a.querySelector('span').textContent.localeCompare(b.querySelector('span').textContent); });
        } else if (method === 'size') {
            items.sort(function(a,b){ return b.textContent.length - a.textContent.length; });
        } else if (method === 'type') {
            items.sort(function(a,b){ return (a.dataset.app||'').localeCompare(b.dataset.app||''); });
        } else if (method === 'date') {
            items.sort(function(){ return Math.random() - 0.5; });
        }
        items.forEach(function(item){ container.appendChild(item); });
    };
});

// Apply saved background
function applyBg() {
    if (!currentUser) return;
    const accounts = loadAccounts();
    if (accounts[currentUser] && accounts[currentUser].bg) {
        document.getElementById('desktop').style.background = accounts[currentUser].bg;
        document.body.style.background = accounts[currentUser].bg;
    }
}

// Profile / Start Menu
document.querySelector('.profile-logo')?.addEventListener('click', (e) => {
    e.stopPropagation();
    buildStartMenu();
    startMenu.classList.toggle('hidden');
});

document.getElementById('show-desktop-btn')?.addEventListener('click', () => {
    if (showDesktopState) {
        showDesktopState = false;
        lastDesktopState.forEach(id => {
            const win = document.getElementById(id);
            if (win) { win.classList.remove('hidden'); focusWindow(id); }
        });
        lastDesktopState = [];
    } else {
        showDesktopState = true;
        lastDesktopState = [...openWindows];
        openWindows.forEach(id => {
            const win = document.getElementById(id);
            if (win) win.classList.add('hidden');
        });
    }
});

function buildStartMenu() {
    const accounts = loadAccounts();
    const userData = currentUser && accounts[currentUser] ? accounts[currentUser] : null;
    const emoji = userData ? (userData.emoji || '\u{1F464}') : '\u{1F464}';
    const name = currentUser || 'User';
    const appsList = [
        {t:'notes', i:'📝', l:'Notepad'},
        {t:'calendar', i:'📅', l:'Calendar'},
        {t:'calc', i:'🧮', l:'Calculator'},
        {t:'todo', i:'✅', l:'Todo'},
        {t:'ai', i:'🤖', l:'AI Chat'},
        {t:'settings', i:'⚙️', l:'Settings'},
        {t:'taskmgr', i:'📊', l:'Task Manager'},
        {t:'gaminghub', i:'🎮', l:'Gaming Hub'},
        {t:'highscores', i:'🏆', l:'High Scores'},
        {t:'wallpapers', i:'🖼', l:'Wallpapers'},
    ];
    startMenu.innerHTML = '' +
        '<div class="start-header"><span>' + emoji + '</span><span>' + name + '</span></div>' +
        '<div class="start-apps">' + appsList.map(a => '<button class="start-app-item" data-app="' + a.t + '"><span>' + a.i + '</span><span>' + a.l + '</span></button>').join('') + '</div>' +
        '<div class="start-footer">' +
        '<button data-action="lock-input">\u{1F510} Lock Input</button>' +
        '<button data-action="lock">\u{1F512} Lock</button>' +
        '<button data-action="signout">\u{1F6AA} Sign Out</button>' +
        '<button data-action="restart">\u{1F504} Restart</button>' +
        '<button data-action="shutdown">\u{23FB} Shut Down</button>' +
        '</div>';
    startMenu.querySelector('.start-apps').addEventListener('click', (e) => {
        const btn = e.target.closest('.start-app-item');
        if (btn) { toggleWindow(btn.dataset.app); startMenu.classList.add('hidden'); }
    });
    startMenu.querySelector('.start-footer').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        startMenu.classList.add('hidden');
        if (action === 'lock-input') { lockInputFn(); }
        else if (action === 'lock') { lockSession(); }
        else if (action === 'signout') { signOut(); }
        else if (action === 'restart') { restartSystem(); }
        else if (action === 'shutdown') { shutdownSystem(); }
    });
}

function lockSession() {
    saveUserSession();
    currentUser = null;
    bootState = 'lock';
    desktop.classList.add('hidden');
    bootScreen.classList.remove('hidden');
    populateBootScreen();
}

function signOut() {
    saveUserSession();
    currentUser = null;
    bootState = 'boot';
    openWindows.forEach(id => { const win = document.getElementById(id); if (win) win.remove(); });
    openWindows = [];
    minimizedWindows = [];
    Object.keys(windowRegistry).forEach(k => delete windowRegistry[k]);
    Object.keys(cleanups).forEach(k => { if (cleanups[k]) cleanups[k](); delete cleanups[k]; });
    desktop.classList.add('hidden');
    bootScreen.classList.remove('hidden');
    populateBootScreen();
}

function restartSystem() {
    saveUserSession();
    location.reload();
}

function shutdownSystem() {
    saveUserSession();
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#33ff33;font-family:monospace;font-size:1.2rem;">Shutting down...</div>';
    setTimeout(() => { document.body.innerHTML = ''; }, 2000);
}

function lockInputFn() {
    lockInput = true;
    const overlay = document.createElement('div');
    overlay.id = 'lock-input-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;color:#33ff33;font-family:monospace;font-size:1.5rem;cursor:not-allowed;';
    overlay.textContent = '\u{1F510} INPUT LOCKED - Press Ctrl+Alt to unlock';
    document.body.appendChild(overlay);
    document.addEventListener('keydown', lockKeyHandler);
    document.addEventListener('keyup', lockKeyUpHandler);
}

let lockKeys = { ctrl: false, alt: false };
function lockKeyHandler(e) {
    if (!lockInput) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Control') lockKeys.ctrl = true;
    if (e.key === 'Alt') lockKeys.alt = true;
    if (lockKeys.ctrl && lockKeys.alt) {
        lockInput = false;
        document.getElementById('lock-input-overlay')?.remove();
        document.removeEventListener('keydown', lockKeyHandler);
        document.removeEventListener('keyup', lockKeyUpHandler);
        lockKeys = { ctrl: false, alt: false };
    }
}
function lockKeyUpHandler(e) {
    if (e.key === 'Control') lockKeys.ctrl = false;
    if (e.key === 'Alt') lockKeys.alt = false;
}

// Alt+Tab
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && e.altKey) {
        e.preventDefault();
        if (!isAltTab) {
            isAltTab = true;
            altTabOverlay.classList.remove('hidden');
            altTabGrid.innerHTML = '';
            const visible = openWindows.filter(id => {
                const win = document.getElementById(id);
                return win && !win.classList.contains('hidden');
            });
            if (visible.length === 0) return;
            visible.forEach(id => {
                const win = document.getElementById(id);
                if (!win) return;
                const card = document.createElement('div');
                card.className = 'alt-tab-card';
                const title = win.querySelector('.window-title')?.textContent || 'Window';
                const type = Object.keys(windowRegistry).find(k => windowRegistry[k] && windowRegistry[k].id === id) || '';
                card.innerHTML = '<div class="alt-tab-icon">' + (apps[type]?.icon || '\u{1F5C4}') + '</div><div class="alt-tab-title">' + title + '</div>';
                card.dataset.winId = id;
                altTabGrid.appendChild(card);
            });
            altTabIndex = 0;
            updateAltTabSelection();
        } else {
            altTabIndex = (altTabIndex + 1) % altTabGrid.children.length;
            updateAltTabSelection();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Tab' && isAltTab && !e.altKey) {
        e.preventDefault();
        isAltTab = false;
        altTabOverlay.classList.add('hidden');
        const selected = altTabGrid.children[altTabIndex];
        if (selected) {
            const winId = selected.dataset.winId;
            const win = document.getElementById(winId);
            if (win) {
                win.classList.remove('hidden');
                minimizedWindows = minimizedWindows.filter(w => w !== winId);
                focusWindow(winId);
            }
        }
    }
});

function updateAltTabSelection() {
    altTabGrid.querySelectorAll('.alt-tab-card').forEach((card, i) => {
        card.classList.toggle('selected', i === altTabIndex);
    });
}

// System Tray clock
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const el = document.getElementById('clock');
    if (el) el.innerHTML = '<div>' + time + '</div><div style="font-size:0.6rem;">' + date + '</div>';
}
setInterval(updateClock, 1000);
updateClock();

// Desktop Icons
const iconApps = [
    {t:'notes', i:'📝', l:'Notepad'},
    {t:'calendar', i:'📅', l:'Calendar'},
    {t:'calc', i:'🧮', l:'Calculator'},
    {t:'todo', i:'✅', l:'Todo'},
    {t:'ai', i:'🤖', l:'AI Chat'},
    {t:'settings', i:'⚙️', l:'Settings'},
    {t:'taskmgr', i:'📊', l:'Task Manager'},
    {t:'gaminghub', i:'🎮', l:'Gaming Hub'},
    {t:'highscores', i:'🏆', l:'High Scores'},
    {t:'wallpapers', i:'🖼', l:'Wallpapers'},
];
const container = document.getElementById('desktop-icons');

function createDesktopIcons() {
    container.innerHTML = '';
    iconApps.forEach(app => {
        const div = document.createElement('div');
        div.className = 'desktop-icon';
        div.dataset.app = app.t;
        div.innerHTML = '<div class="desktop-icon-img">' + app.i + '</div><span>' + app.l + '</span>';
        div.addEventListener('click', (e) => {
            if (div.classList.contains('selected')) {
                toggleWindow(app.t);
                div.classList.remove('selected');
            } else {
                container.querySelectorAll('.desktop-icon').forEach(ic => ic.classList.remove('selected'));
                div.classList.add('selected');
            }
        });
        div.addEventListener('dblclick', () => { toggleWindow(app.t); });
        container.appendChild(div);
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.desktop-icon')) {
        container.querySelectorAll('.desktop-icon').forEach(ic => ic.classList.remove('selected'));
    }
});

// Snap Assist
let snapGuide = null;
function createSnapGuide(rect) {
    snapGuide = document.createElement('div');
    snapGuide.id = 'snap-guide';
    snapGuide.style.cssText = 'position:fixed;border:2px dashed rgba(51,255,51,0.4);background:rgba(51,255,51,0.03);z-index:99998;pointer-events:none;';
    snapGuide.style.left = rect.left + 'px';
    snapGuide.style.top = rect.top + 'px';
    snapGuide.style.width = rect.width + 'px';
    snapGuide.style.height = rect.height + 'px';
    desktop.appendChild(snapGuide);
}

// Override createWindow to add snap drag support
const origCreateWindow = createWindow;
createWindow = function(type) {
    const win = origCreateWindow(type);
    if (!win) return win;
    const header = win.querySelector('.window-header');
    const origStart = header._listeners ? null : null;
    if (!win._snapSetup) {
        win._snapSetup = true;
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-controls')) return;
            const onMove2 = (e2) => {
                if (lockInput || !isDragging) return;
                const cx = e2.clientX, cy = e2.clientY;
                const tw = window.innerWidth, th = window.innerHeight;
                const snapThreshold = 80;
                if (snapGuide) { snapGuide.remove(); snapGuide = null; }
                if (cy < snapThreshold && cx < snapThreshold) {
                    createSnapGuide({ left:0, top:0, width:tw/2-20, height:th/2-20 });
                } else if (cy < snapThreshold && cx > tw - snapThreshold) {
                    createSnapGuide({ left:tw/2+20, top:0, width:tw/2-20, height:th/2-20 });
                } else if (cy > th - snapThreshold && cx < snapThreshold) {
                    createSnapGuide({ left:0, top:th/2+20, width:tw/2-20, height:th/2-20 });
                } else if (cy > th - snapThreshold && cx > tw - snapThreshold) {
                    createSnapGuide({ left:tw/2+20, top:th/2+20, width:tw/2-20, height:th/2-20 });
                } else if (cx < snapThreshold) {
                    createSnapGuide({ left:0, top:0, width:tw/2, height:th });
                } else if (cx > tw - snapThreshold) {
                    createSnapGuide({ left:tw/2, top:0, width:tw/2, height:th });
                } else if (cy < snapThreshold) {
                    createSnapGuide({ left:0, top:0, width:tw, height:th/2 });
                } else {
                    if (snapGuide) { snapGuide.remove(); snapGuide = null; }
                }
            };
            const onUp2 = (e2) => {
                if (snapGuide) {
                    const guide = snapGuide;
                    snapGuide = null;
                    win.style.left = guide.style.left;
                    win.style.top = guide.style.top;
                    win.style.width = guide.style.width;
                    win.style.height = guide.style.height;
                    win.style.transform = 'none';
                    guide.remove();
                }
                document.removeEventListener('mousemove', onMove2);
                document.removeEventListener('mouseup', onUp2);
            };
            document.addEventListener('mousemove', onMove2);
            document.addEventListener('mouseup', onUp2);
        });
    }
    return win;
};

// Re-register apps that were already opened
bootUser = (function(orig) {
    return function(username, password) {
        const result = orig.call(this, username, password);
        if (booted) applyBg();
        return result;
    };
})(bootUser);

// Apps
const apps = {
    notes: {
        title: '\u{1F4DD} Notepad',
        icon: '\u{1F4DD}',
        createContent: (el, id) => {
            el.style.padding = '0';
            const ta = document.createElement('textarea');
            ta.style.cssText = 'width:100%;height:100%;background:rgba(0,0,0,0.3);color:#33ff33;border:none;padding:8px;font-family:monospace;font-size:0.9rem;resize:none;outline:none;';
            ta.placeholder = 'Type your notes here...';
            el.appendChild(ta);
        }
    },
    todo: {
        title: '\u2705 Todo',
        icon: '\u2705',
        createContent: (el, id) => {
            el.style.padding = '8px';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.gap = '8px';
            const inputRow = document.createElement('div');
            inputRow.style.display = 'flex';
            inputRow.style.gap = '4px';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Add todo...';
            input.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);color:#33ff33;border:1px solid rgba(51,255,51,0.3);padding:4px 8px;border-radius:4px;font-family:monospace;outline:none;';
            const addBtn = document.createElement('button');
            addBtn.textContent = '+';
            addBtn.style.cssText = 'padding:4px 12px;background:rgba(51,255,51,0.2);border:1px solid #33ff33;color:#33ff33;border-radius:4px;cursor:pointer;font-family:monospace;';
            inputRow.appendChild(input);
            inputRow.appendChild(addBtn);
            const list = document.createElement('div');
            list.id = 'todo-items-' + id;
            list.style.cssText = 'flex:1;overflow-y:auto;';
            el.appendChild(inputRow);
            el.appendChild(list);
            function addTodo() {
                const text = input.value.trim();
                if (!text) return;
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(51,255,51,0.1);';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.style.cssText = 'accent-color:#33ff33;cursor:pointer;';
                const span = document.createElement('span');
                span.textContent = text;
                span.style.cssText = 'flex:1;color:#33ff33;font-size:0.85rem;';
                const del = document.createElement('button');
                del.textContent = '\u2715';
                del.style.cssText = 'background:none;border:none;color:#ff4444;cursor:pointer;font-size:0.8rem;padding:0 4px;';
                del.onclick = () => item.remove();
                item.appendChild(cb);
                item.appendChild(span);
                item.appendChild(del);
                list.appendChild(item);
                input.value = '';
                input.focus();
            }
            addBtn.onclick = addTodo;
            input.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
        }
    },
    calendar: {
        title: '\u{1F4C5} Calendar',
        icon: '\u{1F4C5}',
        createContent: (el) => {
            el.style.padding = '8px';
            el.style.textAlign = 'center';
            el.style.fontFamily = 'monospace';
            const now = new Date();
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const m = now.getMonth(), y = now.getFullYear();
            const first = new Date(y, m, 1).getDay();
            const last = new Date(y, m + 1, 0).getDate();
            let html = '<div style="font-size:1.1rem;margin-bottom:8px;color:#33ff33;">' + months[m] + ' ' + y + '</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:0.75rem;">';
            days.forEach(d => html += '<div style="color:rgba(51,255,51,0.5);padding:2px;">' + d + '</div>');
            for (let i = 0; i < first; i++) html += '<div></div>';
            for (let d = 1; d <= last; d++) {
                const isToday = d === now.getDate() ? 'background:rgba(51,255,51,0.3);border-radius:4px;' : '';
                html += '<div style="padding:4px;color:#33ff33;' + isToday + '">' + d + '</div>';
            }
            html += '</div>';
            el.innerHTML = html;
        }
    },
    calc: {
        title: '\u{1F9EE} Calculator',
        icon: '\u{1F9EE}',
        createContent: (el) => {
            el.style.padding = '4px';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            const display = document.createElement('input');
            display.type = 'text';
            display.readOnly = true;
            display.style.cssText = 'width:100%;padding:8px;background:rgba(0,0,0,0.4);color:#33ff33;border:1px solid rgba(51,255,51,0.3);border-radius:4px;font-family:monospace;font-size:1.1rem;text-align:right;box-sizing:border-box;margin-bottom:4px;outline:none;';
            display.value = '0';
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:3px;';
            const btns = [
                'sin','cos','tan','log','ln',
                'sqrt','x2','x3','xn','n!',
                'pi','e','(','),','±',
                '1/x','7','8','9','/',
                '4','5','6','*',
                '1','2','3','-',
                '0','.','C','=','+'
            ];
            btns.forEach(label => {
                const btn = document.createElement('button');
                btn.textContent = label;
                btn.style.cssText = 'padding:6px 0;background:rgba(51,255,51,0.1);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;font-family:monospace;font-size:0.85rem;';
                if (label === '=') btn.style.background = 'rgba(51,255,51,0.3)';
                if (label === 'C') btn.style.color = '#ff6666';
                btn.onclick = () => {
                    if (label === 'C') { display.value = '0'; return; }
                    if (label === '=') {
                        try {
                            let expr = display.value;
                            expr = expr.replace(/sin/g,'Math.sin').replace(/cos/g,'Math.cos').replace(/tan/g,'Math.tan').replace(/log/g,'Math.log10').replace(/ln/g,'Math.log').replace(/sqrt/g,'Math.sqrt').replace(/x2/g,'**2').replace(/x3/g,'**3').replace(/xn/g,'**').replace(/n!/g,'*').replace(/π/g,'Math.PI').replace(/pi/g,'Math.PI').replace(/e(?![xp])/g,'Math.E').replace(/±/g,'*-1').replace(/1\/x/g,'1/');
                            const result = Function('"use strict";return (' + expr + ')')();
                            display.value = result.toString();
                        } catch { display.value = 'Error'; }
                        return;
                    }
                    if (label === '±') { display.value = display.value.startsWith('-') ? display.value.slice(1) : '-' + display.value; return; }
                    if (label === '1/x') { try { display.value = (1 / parseFloat(display.value)).toString(); } catch { display.value = 'Error'; } return; }
                    if (display.value === '0' && !'+-*/.'.includes(label)) display.value = '';
                    display.value += label === 'n!' ? '!' : label === 'pi' || label === 'π' ? 'π' : label === 'e' ? 'e' : label === 'sqrt' ? 'sqrt(' : label === 'x2' ? '**2' : label === 'x3' ? '**3' : label === 'xn' ? '**' : label === 'sin' ? 'sin(' : label === 'cos' ? 'cos(' : label === 'tan' ? 'tan(' : label === 'log' ? 'log(' : label === 'ln' ? 'ln(' : label;
                };
                grid.appendChild(btn);
            });
            el.appendChild(display);
            el.appendChild(grid);
        }
    },
    ai: {
        title: '\u{1F916} AI Chat',
        icon: '\u{1F916}',
        createContent: (el, id) => {
            el.style.padding = '8px';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.gap = '8px';
            const log = document.createElement('div');
            log.id = 'ai-log-' + id;
            log.style.cssText = 'flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:4px;padding:8px;font-size:0.85rem;';
            log.innerHTML = '<p style="color:#88ccff;">Welcome to AI Chat! Type a message below.</p>';
            const inputRow = document.createElement('div');
            inputRow.style.display = 'flex';
            inputRow.style.gap = '4px';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Type a message...';
            input.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);color:#33ff33;border:1px solid rgba(51,255,51,0.3);padding:4px 8px;border-radius:4px;font-family:monospace;outline:none;';
            const sendBtn = document.createElement('button');
            sendBtn.textContent = 'Send';
            sendBtn.style.cssText = 'padding:4px 12px;background:rgba(51,255,51,0.2);border:1px solid #33ff33;color:#33ff33;border-radius:4px;cursor:pointer;font-family:monospace;';
            inputRow.appendChild(input);
            inputRow.appendChild(sendBtn);
            el.appendChild(log);
            el.appendChild(inputRow);
            const responses = [
                "Interesting! Tell me more about that.", "I'm processing that information...", "That's a great question!",
                "Let me think about that...", "Here's what I know about that topic.", "I can help you with that.",
                "That's fascinating!", "I see what you mean.", "Good point!", "Let me look that up for you."
            ];
            function sendMessage() {
                const text = input.value.trim();
                if (!text) return;
                const userP = document.createElement('p');
                userP.textContent = 'You: ' + text;
                userP.style.color = '#88ff88';
                log.appendChild(userP);
                input.value = '';
                setTimeout(() => {
                    const aiP = document.createElement('p');
                    aiP.textContent = responses[Math.floor(Math.random() * responses.length)];
                    aiP.style.color = '#88ccff';
                    log.appendChild(aiP);
                    log.scrollTop = log.scrollHeight;
                }, 500 + Math.random() * 1000);
                log.scrollTop = log.scrollHeight;
            }
            sendBtn.onclick = sendMessage;
            input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
        }
    },
    highscores: {
        title: '\u{1F3C6} High Scores',
        icon: '\u{1F3C6}',
        createContent: (el) => {
            el.style.padding = '8px';
            el.style.overflow = 'auto';
            const scores = JSON.parse(localStorage.getItem('cyberos_highscores') || '{}');
            let html = '<div style="text-align:center;margin-bottom:8px;font-size:1rem;color:#33ff33;">\u{1F3C6} High Scores</div>';
            const allGames = {'snake':'Snake','tictactoe':'Tic Tac Toe','solitaire':'Solitaire','minesweeper':'Minesweeper','blackjack':'Blackjack','memory':'Memory','2048':'2048','pacman':'Pac-Man'};
            Object.entries(allGames).forEach(([key, gameName]) => {
                const val = scores[key];
                const display = val ? '<span style="color:#ffcc00;">' + val + '</span>' : '<span style="color:rgba(51,255,51,0.3);">---</span>';
                html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(51,255,51,0.1);font-size:0.85rem;"><span>' + gameName + '</span><span>' + display + '</span></div>';
            });
            el.innerHTML = html;
        }
    },
    wallpapers: {
        title: '\u{1F5BC} Wallpapers',
        icon: '\u{1F5BC}',
        createContent: (el) => {
            const list = Object.entries(wallpapers);
            const cols = 4;
            el.style.overflow = 'auto';
            el.style.display = 'grid';
            el.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
            el.style.gap = '6px';
            el.style.padding = '8px';
            list.forEach(([id, wp]) => {
                const card = document.createElement('div');
                const isActive = wpCurrent === id;
                card.style.cssText = 'border:2px solid ' + (isActive ? '#33ff33' : 'rgba(51,255,51,0.2)') + ';border-radius:6px;padding:10px 4px;text-align:center;cursor:pointer;transition:all 0.15s;background:' + (isActive ? 'rgba(51,255,51,0.1)' : 'rgba(10,25,49,0.3)');
                card.innerHTML = '<div style="font-size:1.8rem;line-height:1.4;">' + wp.icon + '</div><div style="font-size:0.7rem;">' + wp.name + '</div>';
                card.onclick = function() {
                    startWallpaper(id);
                    el.querySelectorAll(':scope > div').forEach(function(c) { c.style.borderColor = 'rgba(51,255,51,0.2)'; c.style.background = 'rgba(10,25,49,0.3)'; });
                    card.style.borderColor = '#33ff33';
                    card.style.background = 'rgba(51,255,51,0.1)';
                };
                el.appendChild(card);
            });
        }
    },
    settings: {
        title: '\u2699\uFE0F Settings',
        icon: '\u2699\uFE0F',
        createContent: function(el) {
            el.style.display = 'flex';
            el.style.flexDirection = 'row';
            el.style.padding = '0';
            var nav = document.createElement('div');
            nav.className = 'settings-nav';
            var pages = {personalize:'\u{1F3A8} Personalize',display:'\u{1F4FA} Display',about:'\u2139\uFE0F About'};
            var currentPage = 'personalize';
            var content = document.createElement('div');
            content.className = 'settings-content';
            function renderPage(page) {
                nav.querySelectorAll('.settings-nav-item').forEach(function(n){n.classList.toggle('active',n.dataset.page===page);});
                currentPage = page;
                if (page === 'personalize') {
                    var accentColors = ['#33ff33','#00ccff','#ff6633','#cc33ff','#ffcc00','#33ff99','#ff3366','#ffffff'];
                    var currentAccent = localStorage.getItem('cyberos_accent') || '#33ff33';
                    var html = '<div style="margin-bottom:8px;font-weight:bold;">Accent Color</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">';
                    accentColors.forEach(function(c){html+='<div style="width:28px;height:28px;background:'+c+';border-radius:4px;cursor:pointer;border:2px solid '+(c===currentAccent?'var(--fg)':'transparent')+';" data-accent="'+c+'"></div>';});
                    html += '</div>';
                    var currentBg = document.getElementById('desktop').style.background || '#020813';
                    var hexBg = '#020813';
                    try { var t = document.getElementById('desktop').style.background; if (t && t.startsWith('#')) hexBg = t; } catch(e){}
                    html += '<div style="margin-bottom:8px;font-weight:bold;">Desktop Background</div><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><input type="color" id="bg-colorpicker" value="'+hexBg+'" style="width:40px;height:40px;border:2px solid var(--border);border-radius:4px;cursor:pointer;background:none;padding:2px;"><button id="bg-apply-btn" style="padding:4px 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--fg);cursor:pointer;font-size:0.8rem;">Apply</button><span style="font-size:0.8rem;opacity:0.7;">Choose any color</span></div><div style="font-weight:bold;">Wallpaper</div><div style="margin-top:4px;font-size:0.75rem;opacity:0.7;">Open Wallpapers app to change</div>';
                    content.innerHTML = html;
                    content.querySelector('#bg-apply-btn').onclick = function(){
                        var bg = content.querySelector('#bg-colorpicker').value;
                        stopWallpaper();
                        document.getElementById('matrix-canvas').style.display = 'none';
                        document.getElementById('desktop').style.background = bg;
                        document.body.style.background = bg;
                        if (currentUser) { var acc = loadAccounts(); if (acc[currentUser]) { acc[currentUser].bg = bg; acc[currentUser].wp = ''; saveAccounts(acc); } }
                    };
                    content.querySelectorAll('[data-accent]').forEach(function(el2){
                        el2.onclick = function(){
                            var clr = el2.dataset.accent;
                            localStorage.setItem('cyberos_accent', clr);
                            document.documentElement.style.setProperty('--fg', clr);
                            document.documentElement.style.setProperty('--fg-bright', clr);
                            document.documentElement.style.setProperty('--border', clr);
                            document.documentElement.style.setProperty('--accent', clr);
                            document.documentElement.style.setProperty('--shadow', clr+'66');
                            content.querySelectorAll('[data-accent]').forEach(function(s){s.style.borderColor='transparent';});
                            el2.style.borderColor='var(--fg)';
                        };
                    });
                } else if (page === 'display') {
                    var isLight = document.body.classList.contains('light-theme');
                    var transparency = localStorage.getItem('cyberos_transparency') || '85';
                    var acrylic = localStorage.getItem('cyberos_acrylic') === '1';
                    content.innerHTML = '<div class="setting-row"><span>\u{2600}\uFE0F Theme</span><label><input type="checkbox" '+(isLight?'checked':'')+' id="theme-toggle"> <span style="font-size:0.7rem;">'+(isLight?'Light':'Dark')+'</span></label></div><div class="setting-row"><span>\u{1F4F1} Transparency</span><span style="font-size:0.7rem;opacity:0.7;">'+(acrylic?'Blur':'Solid')+'</span></div><div class="setting-row" style="border:none;"><span style="font-size:0.7rem;">Window Opacity</span><input type="range" min="30" max="100" value="'+transparency+'" id="transparency-slider" style="flex:1;max-width:120px;accent-color:var(--accent);"> <span id="transparency-label" style="font-size:0.7rem;width:30px;text-align:right;">'+transparency+'%</span></div>';
                    var themeCb = content.querySelector('#theme-toggle');
                    themeCb.onchange = function(){
                        document.body.classList.toggle('light-theme', themeCb.checked);
                        content.querySelector('#theme-toggle ~ span').textContent = themeCb.checked ? 'Light' : 'Dark';
                        localStorage.setItem('cyberos_theme', themeCb.checked ? 'light' : 'dark');
                        var icon = document.getElementById('tray-nightlight');
                        if (icon) icon.textContent = themeCb.checked ? '\u{2600}\uFE0F' : '\u{1F319}';
                        var trSlider = content.querySelector('#transparency-slider');
                        if (trSlider) {
                            var alpha = trSlider.value / 100;
                            var base = themeCb.checked ? '255,255,255' : '2,8,19';
                            document.body.style.setProperty('--win-bg', 'rgba('+base+','+alpha+')');
                        }
                    };
                    var trSlider = content.querySelector('#transparency-slider');
                    trSlider.oninput = function(){
                        var v = this.value;
                        document.getElementById('transparency-label').textContent = v + '%';
                        var alpha = v / 100;
                        var base = document.body.classList.contains('light-theme') ? '255,255,255' : '2,8,19';
                        document.body.style.setProperty('--win-bg', 'rgba('+base+','+alpha+')');
                        localStorage.setItem('cyberos_transparency', v);
                    };
                } else if (page === 'about') {
                    var accounts = loadAccounts();
                    var ud = currentUser && accounts[currentUser] ? accounts[currentUser] : {};
                    content.innerHTML = '<div class="setting-row"><span>User</span><span style="font-size:0.8rem;">'+(ud.emoji||'')+' '+currentUser+'</span></div><div class="setting-row"><span>OS Version</span><span style="font-size:0.8rem;">Cyber OS v2.0</span></div><div class="setting-row"><span>Windows</span><span style="font-size:0.8rem;">'+(window.navigator.platform||'PC')+'</span></div><div class="setting-row"><span>Resolution</span><span style="font-size:0.8rem;">'+window.innerWidth+'\u00D7'+window.innerHeight+'</span></div>';
                }
            }
            Object.entries(pages).forEach(function(_a){
                var key=_a[0],val=_a[1];
                var item = document.createElement('div');
                item.className = 'settings-nav-item' + (key==='personalize'?' active':'');
                item.dataset.page = key;
                item.textContent = val;
                item.onclick = function(){ renderPage(key); };
                nav.appendChild(item);
            });
            renderPage('personalize');
            el.appendChild(nav);
            el.appendChild(content);
        }
    },
    taskmgr: {
        title: '\u{1F4CA} Task Manager',
        icon: '\u{1F4CA}',
        createContent: function(el, id) {
            el.style.padding = '0';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            var tabs = document.createElement('div');
            tabs.className = 'taskmgr-tabs';
            var tabData = [{k:'processes',l:'Processes'},{k:'performance',l:'Performance'}];
            var currentTab = 'processes';
            var body = document.createElement('div');
            body.className = 'taskmgr-body';
            var selectedProcess = null;
            function renderTab(tab) {
                currentTab = tab;
                tabs.querySelectorAll('.taskmgr-tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
                if (tab === 'processes') {
                    var html = '<div style="display:flex;gap:8px;padding:2px 8px;font-weight:bold;font-size:0.7rem;border-bottom:1px solid rgba(51,255,51,0.1);"><span style="flex:1;">Name</span><span style="width:50px;text-align:right;">CPU</span><span style="width:50px;text-align:right;">Memory</span><span style="width:40px;text-align:right;">PID</span></div>';
                    var procs = openWindows.length > 0 ? openWindows : ['system','idle'];
                    var usedMem = Math.floor(Math.random()*40+30);
                    procs.forEach(function(w,i){
                        var name = w === 'system' ? 'System' : w === 'idle' ? 'System Idle' : (windowRegistry[Object.keys(windowRegistry).find(function(k){return windowRegistry[k]&&windowRegistry[k].id===w;})] ? w : 'Process '+(i+1));
                        var cpu = (Math.random()*5+(i===0?3:0)).toFixed(1);
                        var mem = (Math.random()*20+(i<3?10:2)).toFixed(1);
                        var pid = 1000 + i*4 + Math.floor(Math.random()*3);
                        var sel = selectedProcess === w ? ' style="background:rgba(51,255,51,0.15);"' : '';
                        html += '<div class="taskmgr-row" data-proc="'+w+'"'+sel+'><span class="tm-name">'+name+'</span><span class="tm-cpu">'+cpu+'%</span><span class="tm-mem">'+mem+'MB</span><span class="tm-pid">'+pid+'</span></div>';
                    });
                    html += '<div style="padding:6px 8px;font-size:0.65rem;opacity:0.5;border-top:1px solid rgba(51,255,51,0.05);">CPU: '+(Math.random()*30+10).toFixed(0)+'% &middot; Memory: '+usedMem+'% &middot; Processes: '+procs.length+'</div>';
                    body.innerHTML = html;
                    body.querySelectorAll('.taskmgr-row').forEach(function(row){
                        row.onclick = function(){ selectedProcess = row.dataset.proc; body.querySelectorAll('.taskmgr-row').forEach(function(r){r.style.background='';}); row.style.background='rgba(51,255,51,0.15)'; };
                    });
                } else {
                    var cpuUsage = Math.floor(Math.random()*40+10);
                    var memUsage = Math.floor(Math.random()*30+40);
                    body.innerHTML = '<div style="padding:10px;"><div style="margin-bottom:12px;"><div style="font-size:0.8rem;margin-bottom:4px;">CPU &nbsp; <span style="color:#88ff88;">'+cpuUsage+'%</span></div><div style="background:rgba(51,255,51,0.1);border-radius:3px;height:16px;overflow:hidden;"><div style="background:#33ff33;width:'+cpuUsage+'%;height:100%;border-radius:3px;transition:width 0.3s;"></div></div></div><div><div style="font-size:0.8rem;margin-bottom:4px;">Memory &nbsp; <span style="color:#88ccff;">'+memUsage+'%</span></div><div style="background:rgba(51,255,51,0.1);border-radius:3px;height:16px;overflow:hidden;"><div style="background:#88ccff;width:'+memUsage+'%;height:100%;border-radius:3px;transition:width 0.3s;"></div></div></div><div style="margin-top:12px;font-size:0.65rem;opacity:0.5;">Updating every 2 seconds...</div></div>';
                }
            }
            tabData.forEach(function(t){
                var tb = document.createElement('div');
                tb.className = 'taskmgr-tab' + (t.k==='processes'?' active':'');
                tb.dataset.tab = t.k;
                tb.textContent = t.l;
                tb.onclick = function(){ renderTab(t.k); };
                tabs.appendChild(tb);
            });
            var footer = document.createElement('div');
            footer.className = 'taskmgr-footer';
            var endBtn = document.createElement('button');
            endBtn.textContent = 'End Task';
            endBtn.onclick = function(){
                if (!selectedProcess || selectedProcess === 'system' || selectedProcess === 'idle') { showToast('Task Manager','Cannot end system process','info'); return; }
                closeWindow(selectedProcess);
                selectedProcess = null;
                showToast('Task Manager','Task ended successfully','info');
            };
            footer.appendChild(endBtn);
            renderTab('processes');
            el.appendChild(tabs);
            el.appendChild(body);
            el.appendChild(footer);
            var tmr = setInterval(function(){ renderTab(currentTab); }, 2000);
            cleanups[id] = function(){ clearInterval(tmr); };
        }
    },
    gaminghub: {
        title: '\u{1F3AE} Gaming Hub',
        icon: '\u{1F3AE}',
        createContent: (el, id) => {
            const games = [
                {g:'snake', i:'\u{1F40D}', n:'Snake', d:'Classic arcade snake game'},
                {g:'tictactoe', i:'\u274C', n:'Tic Tac Toe', d:'Play against AI'},
                {g:'solitaire', i:'\u{1F0CF}', n:'Solitaire', d:'Classic card game'},
                {g:'minesweeper', i:'\u{1F4A3}', n:'Minesweeper', d:'Find the mines'},
                {g:'blackjack', i:'\u2660\uFE0F', n:'Blackjack', d:'Beat the dealer'},
                {g:'memory', i:'\u{1F0CF}', n:'Memory', d:'Match the pairs (10 levels)'},
                {g:'game2048', i:'\u{1F3B2}', n:'2048', d:'Merge tiles to 2048'},
                {g:'pacman', i:'\u{1F47E}', n:'Pac-Man', d:'Classic arcade game'},
            ];
            el.style.overflow = 'auto';
            el.innerHTML = '<div style="text-align:center;margin-bottom:12px;font-size:1.1rem;padding-top:4px;">\u{1F3AE} Gaming Hub</div><div class="gaminghub-grid">' + games.map(function(g) { return '<div class="gaminghub-card" data-game="' + g.g + '"><span class="gaminghub-icon">' + g.i + '</span><span class="gaminghub-name">' + g.n + '</span><span class="gaminghub-desc">' + g.d + '</span></div>'; }).join('') + '</div><div style="text-align:center;margin-top:8px;"><button id="hs-btn-' + id + '" style="margin:0;padding:6px 16px;font-size:0.85rem;">\u{1F3C6} High Scores</button></div>';
            el.querySelectorAll('.gaminghub-card').forEach(function(card) {
                card.onclick = function() { toggleWindow(card.dataset.game); };
            });
            document.getElementById('hs-btn-' + id).onclick = function() { toggleWindow('highscores'); };
        }
    }
};

// Wallpaper system
function hslToRgb(h,s,l){var c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h*6%2-1)),m=l-c/2;var r,g,b;if(h<1/6){r=c;g=x;b=0}else if(h<2/6){r=x;g=c;b=0}else if(h<3/6){r=0;g=c;b=x}else if(h<4/6){r=0;g=x;b=c}else if(h<5/6){r=x;g=0;b=c}else{r=c;g=0;b=x}return[(r+m)*255|0,(g+m)*255|0,(b+m)*255|0];}

function imageWp(url){return function(c,ctx){var img=new Image();img.crossOrigin='anonymous';var ld=!1;img.onload=function(){ld=!0;};img.src=url;return{draw:function(){if(!ld||!img.width)return;var s=Math.max(c.width/img.width,c.height/img.height);ctx.drawImage(img,(c.width-img.width*s)/2,(c.height-img.height*s)/2,img.width*s,img.height*s);},cleanup:function(){}};};}

var wallpapers = {
    matrix: {icon:'\u{1F4CB}',name:'Matrix Rain',interval:50,init:function(c,ctx){var fs=14,chars='\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C8\u30CA\u30CB\u30CC\u30CD\u30CE\u30CF\u30D2\u30D5\u30D8\u30DB\u30DE\u30DF\u30E0\u30E1\u30E2\u30E4\u30E6\u30E8\u30E9\u30EA\u30EB\u30EC\u30ED\u30EF\u30F2\u30F30123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';var cols,dr;function rs(){c.width=innerWidth;c.height=innerHeight;cols=Math.ceil(c.width/fs);dr=new Array(cols);for(var i=0;i<cols;i++)dr[i]=Math.floor(Math.random()*-c.height/fs);}rs();addEventListener('resize',rs);return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.08)';ctx.fillRect(0,0,c.width,c.height);ctx.font=fs+'px monospace';for(var i=0;i<dr.length;i++){var ch=chars[Math.random()*chars.length|0];ctx.fillStyle=Math.random()>0.98?'#ff6666':Math.random()>0.9?'#ff2222':'#880000';ctx.fillText(ch,i*fs,dr[i]*fs);if(dr[i]*fs>c.height&&Math.random()>0.975)dr[i]=0;dr[i]++;}},cleanup:function(){removeEventListener('resize',rs);}};}},
    stars: {icon:'\u{2B50}',name:'Starfield',interval:50,init:function(c,ctx){var stars=new Array(200);for(var i=0;i<200;i++)stars[i]={x:Math.random()*c.width,y:Math.random()*c.height,z:Math.random()*3+1};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.15)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<stars.length;i++){var s=stars[i];s.z-=0.05;if(s.z<0){s.x=Math.random()*c.width;s.y=Math.random()*c.height;s.z=3+Math.random()*2;}var sx=(s.x-c.width/2)/s.z+c.width/2,sy=(s.y-c.height/2)/s.z+c.height/2,sz=4/s.z;ctx.fillStyle='rgba(255,255,255,'+(1/s.z)+')';ctx.fillRect(sx,sy,sz,sz);}}};}},
    aurora: {icon:'\u{1F30C}',name:'Aurora',interval:50,init:function(c,ctx){var t=0,bands=5;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.02)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;for(var b=0;b<bands;b++){ctx.beginPath();for(var x=0;x<=c.width;x+=5){var y=c.height*0.4+Math.sin(x*0.01+t+b)*30+Math.sin(x*0.005+t*0.7+b*2)*20+Math.cos(x*0.008+t*0.5+b)*15+b*20;ctx.lineTo(x,y);}ctx.strokeStyle='hsla('+(180+b*30+t*20%360)+',80%,60%,0.15)';ctx.lineWidth=3;ctx.stroke();}}};}},
    rain: {icon:'\u{1F327}',name:'Rain',interval:50,init:function(c,ctx){var drops=new Array(150);for(var i=0;i<150;i++)drops[i]={x:Math.random()*c.width,y:Math.random()*c.height,s:2+Math.random()*3,l:10+Math.random()*20};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.1)';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='rgba(100,150,255,0.4)';ctx.lineWidth=1.5;for(var i=0;i<drops.length;i++){var d=drops[i];d.y+=d.s;d.x-=0.5;if(d.y>c.height){d.y=-d.l;d.x=Math.random()*c.width;}ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-2,d.y-d.l);ctx.stroke();}}};}},
    snow: {icon:'\u{2744}',name:'Snow',interval:50,init:function(c,ctx){var flakes=new Array(120);for(var i=0;i<120;i++)flakes[i]={x:Math.random()*c.width,y:Math.random()*c.height,r:1+Math.random()*3,s:0.5+Math.random()*2,w:Math.random()*2-1};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.08)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<flakes.length;i++){var f=flakes[i];f.y+=f.s;f.x+=f.w;if(f.y>c.height){f.y=-5;f.x=Math.random()*c.width;}ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,6.28);ctx.fillStyle='rgba(255,255,255,0.7)';ctx.fill();}}};}},
    bubbles: {icon:'\u{1F4E6}',name:'Bubbles',interval:50,init:function(c,ctx){var bbls=new Array(40);for(var i=0;i<40;i++)bbls[i]={x:Math.random()*c.width,y:Math.random()*c.height,r:5+Math.random()*25,s:0.3+Math.random()*1,w:Math.sin(Math.random()*6.28)*0.5};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.04)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<bbls.length;i++){var b=bbls[i];b.y-=b.s;b.x+=Math.sin(b.y*0.05)*0.3;if(b.y<-b.r){b.y=c.height+b.r;b.x=Math.random()*c.width;}ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,6.28);ctx.strokeStyle='rgba(100,200,255,0.3)';ctx.lineWidth=1.5;ctx.stroke();ctx.beginPath();ctx.arc(b.x-b.r*0.3,b.y-b.r*0.3,b.r*0.2,0,6.28);ctx.fillStyle='rgba(255,255,255,0.2)';ctx.fill();}}};}},
    fire: {icon:'\u{1F525}',name:'Fire',interval:50,init:function(c,ctx){var pts=new Array(80);for(var i=0;i<80;i++)pts[i]={x:Math.random()*c.width,y:c.height,r:10+Math.random()*30,dy:-2-Math.random()*4,dx:(Math.random()-0.5)*1.5};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.06)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<pts.length;i++){var p=pts[i];p.x+=p.dx;p.y+=p.dy;p.r*=0.98;if(p.r<2||p.y<0){p.x=Math.random()*c.width;p.y=c.height+Math.random()*20;p.r=20+Math.random()*30;}var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);g.addColorStop(0,'rgba(255,255,200,'+(0.4*p.r/40)+')');g.addColorStop(0.4,'rgba(255,150,50,'+(0.3*p.r/40)+')');g.addColorStop(1,'rgba(255,50,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fill();}}};}},
    waves: {icon:'\u{1F30A}',name:'Waves',interval:50,init:function(c,ctx){var t=0,n=6;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.03)';ctx.fillRect(0,0,c.width,c.height);t+=0.03;for(var i=0;i<n;i++){ctx.beginPath();for(var x=0;x<=c.width;x+=4){var y=c.height/2+Math.sin(x*0.008+t+i*1.2)*40+Math.sin(x*0.015+t*0.8+i)*25;ctx.lineTo(x,y);}ctx.strokeStyle='hsla('+(200+i*30+t*30%360)+',70%,'+(50+i*5)+'%,0.08)';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();for(var x=0;x<=c.width;x+=4){var y=c.height/2+Math.sin(x*0.008+t+i*1.2+3.14)*40+Math.sin(x*0.015+t*0.8+i)*25;ctx.lineTo(x,y);}ctx.stroke();}}};}},
    particles: {icon:'\u{2728}',name:'Particles',interval:50,init:function(c,ctx){var ps=new Array(60);for(var i=0;i<60;i++)ps[i]={x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-0.5)*2,vy:(Math.random()-0.5)*2,h:Math.random()*360};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.05)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<ps.length;i++){var p=ps[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1;ctx.fillStyle='hsla('+p.h+',80%,60%,0.6)';ctx.beginPath();ctx.arc(p.x,p.y,3,0,6.28);ctx.fill();p.h=(p.h+0.5)%360;}}};}},
    neon: {icon:'\u{1F4F1}',name:'Neon Grid',interval:50,init:function(c,ctx){var t=0,gap=40;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.02)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;ctx.strokeStyle='hsla('+(t*50%360)+',100%,60%,0.06)';ctx.lineWidth=1;for(var x=0;x<c.width;x+=gap){ctx.beginPath();ctx.moveTo(x,0);for(var y=0;y<c.height;y+=5){ctx.lineTo(x+Math.sin(y*0.02+t)*5,y);}ctx.stroke();}for(var y=0;y<c.height;y+=gap){ctx.beginPath();ctx.moveTo(0,y);for(var x=0;x<c.width;x+=5){ctx.lineTo(x,y+Math.sin(x*0.02+t)*5);}ctx.stroke();}}};}},
    pulse: {icon:'\u{1F4A1}',name:'Color Pulse',interval:100,init:function(c,ctx){var t=0;return{draw:function(){t+=0.005;var h=t*60%360;ctx.fillStyle='hsla('+h+',50%,10%,1)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<5;i++){var y=c.height/2+Math.sin(t+i)*c.height*0.3;var g=ctx.createRadialGradient(c.width/2,y,0,c.width/2,y,200+i*50);g.addColorStop(0,'hsla('+(h+i*30%360)+',80%,60%,0.1)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);}}};}},
    circuit: {icon:'\u{1F5A5}',name:'Circuit Board',interval:100,init:function(c,ctx){var traces=new Array(30);for(var i=0;i<30;i++)traces[i]={x:Math.random()*c.width,y:Math.random()*c.height,dx:2,dy:0,life:200};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.05)';ctx.fillRect(0,0,c.width,c.height);traces.forEach(function(t){t.life--;if(t.life<0){t.x=Math.random()*c.width;t.y=Math.random()*c.height;t.life=200+Math.random()*300;t.dx=Math.random()>0.5?2:-2;t.dy=0;}if(Math.random()<0.03){var tmp=t.dx;t.dx=t.dy;t.dy=tmp;}t.x+=t.dx;t.y+=t.dy;if(t.x<0||t.x>c.width||t.y<0||t.y>c.height)t.life=0;ctx.fillStyle='rgba(0,255,100,'+(t.life/500)+')';ctx.fillRect(t.x,t.y,3,3);if(t.dy!==0){ctx.fillRect(t.x,t.y-1,1,3);}});}};}},
    galaxy: {icon:'\u{1F30C}',name:'Galaxy Spiral',interval:50,init:function(c,ctx){var t=0,stars=new Array(800);for(var i=0;i<800;i++)stars[i]={a:Math.random()*6.28,d:Math.pow(Math.random(),0.5)*200,s:Math.random()*2+0.5};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.08)';ctx.fillRect(0,0,c.width,c.height);t+=0.005;var cx=c.width/2,cy=c.height/2;for(var i=0;i<stars.length;i++){var s=stars[i],a=s.a+t*0.5+s.d*0.001,dist=s.d*(1+Math.sin(s.a*3+t)*0.1),x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist;ctx.fillStyle='rgba(255,255,255,'+(0.3+s.s/5)+')';ctx.beginPath();ctx.arc(x,y,s.s*0.5,0,6.28);ctx.fill();}}};}},
    tunnel: {icon:'\u{1F573}',name:'Tunnel',interval:50,init:function(c,ctx){var t=0;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.1)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;var cx=c.width/2,cy=c.height/2;for(var i=20;i>0;i--){var r=i*15+Math.sin(t+i*0.5)*10,a=t+i*0.3,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;ctx.strokeStyle='hsla('+(i*18+t*50%360)+',80%,'+(60-i*2)+'%,'+(0.3-i*0.01)+')';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r,0,6.28);ctx.stroke();}}};}},
    plasma: {icon:'\u{1F300}',name:'Plasma',interval:50,init:function(c,ctx){var t=0,img=ctx.createImageData(c.width,c.height),d=img.data;return{draw:function(){t+=0.02;var w=c.width,h=c.height;for(var y=0;y<h;y+=2){for(var x=0;x<w;x+=2){var v=Math.sin(x*0.01+t)+Math.sin(y*0.01+t)+Math.sin((x+y)*0.005+t*0.7)+Math.sin(Math.sqrt(x*x+y*y)*0.008+t*0.5);var hue=(v*90+180+t*20)%360,i=(y*w+x)*4,clr=hslToRgb(hue/360,0.6,0.5);d[i]=clr[0];d[i+1]=clr[1];d[i+2]=clr[2];d[i+3]=200;}}ctx.putImageData(img,0,0);}};}},
    gravity: {icon:'\u{1F30D}',name:'Gravity',interval:50,init:function(c,ctx){var ps=new Array(80);for(var i=0;i<80;i++)ps[i]={x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.04)';ctx.fillRect(0,0,c.width,c.height);var cx=c.width/2,cy=c.height/2;for(var i=0;i<ps.length;i++){var p=ps[i],dx=cx-p.x,dy=cy-p.y,d=Math.sqrt(dx*dx+dy*dy)||1,pull=0.01;p.vx+=dx/d*pull;p.vy+=dy/d*pull;p.x+=p.vx;p.y+=p.vy;ctx.fillStyle='rgba(100,200,255,0.5)';ctx.beginPath();ctx.arc(p.x,p.y,2,0,6.28);ctx.fill();for(var j=i+1;j<ps.length;j++){var o=ps[j];if(Math.abs(o.x-p.x)<60&&Math.abs(o.y-p.y)<60){ctx.strokeStyle='rgba(100,200,255,0.05)';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(o.x,o.y);ctx.stroke();}}}}};}},
    rings: {icon:'\u{26AA}',name:'Rings',interval:50,init:function(c,ctx){var rings=[];return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.05)';ctx.fillRect(0,0,c.width,c.height);if(Math.random()<0.02)rings.push({x:Math.random()*c.width,y:Math.random()*c.height,r:5,life:1});for(var i=rings.length-1;i>=0;i--){var r=rings[i];r.r+=1.5;r.life-=0.005;ctx.strokeStyle='hsla('+(180+r.life*100)+',80%,60%,'+(r.life*0.3)+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,6.28);ctx.stroke();if(r.life<=0)rings.splice(i,1);}}};}},
    spiral: {icon:'\u{1F300}',name:'Spiral',interval:50,init:function(c,ctx){var t=0,pts=new Array(200);for(var i=0;i<200;i++)pts[i]={a:i*0.1,d:i*0.5,s:i};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.06)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;var cx=c.width/2,cy=c.height/2;for(var i=0;i<pts.length;i++){var p=pts[i],a=p.a+t,d=p.d+Math.sin(t+p.s)*10,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;ctx.fillStyle='hsla('+(p.s*2+t*50%360)+',80%,60%,0.5)';ctx.beginPath();ctx.arc(x,y,2+Math.sin(t+p.s)*1.5,0,6.28);ctx.fill();}}};}},
    hex: {icon:'\u{2B21}',name:'Hexagons',interval:100,init:function(c,ctx){var t=0,s=25;return{draw:function(){t+=0.01;ctx.fillStyle='rgba(0,0,0,0.03)';ctx.fillRect(0,0,c.width,c.height);ctx.lineWidth=1;for(var row=-1;row<c.height/s+2;row++){for(var col=-1;col<c.width/(s*1.5)+2;col++){var x=col*s*1.5+(row%2?0.75*s:0),y=row*s*0.866;ctx.strokeStyle='hsla('+((row*30+col*20+t*50)%360)+',60%,50%,0.08)';ctx.beginPath();for(var i=0;i<6;i++){var a=i*1.047;if(i===0){ctx.moveTo(x+s*Math.cos(a),y+s*Math.sin(a));}else{ctx.lineTo(x+s*Math.cos(a),y+s*Math.sin(a));}}ctx.closePath();ctx.stroke();}}}};}},
    ocean: {icon:'\u{1F30A}',name:'Ocean',interval:50,init:function(c,ctx){var t=0,bands=30;return{draw:function(){ctx.fillStyle='rgba(0,5,15,0.04)';ctx.fillRect(0,0,c.width,c.height);t+=0.015;for(var i=0;i<bands;i++){var y=c.height/bands*i;ctx.beginPath();ctx.moveTo(0,y);for(var x=0;x<=c.width;x+=5){var dy=Math.sin(x*0.01+t+i*0.3)*8+Math.sin(x*0.005+t*0.7+i*0.5)*5;ctx.lineTo(x,y+dy);}ctx.strokeStyle='hsla('+(200+i*2%360)+',50%,'+(60-i*0.5)+'%,0.04)';ctx.lineWidth=1;ctx.stroke();}}};}},
    moraine: {icon:'\u{1F5FC}',name:'Moraine Lake',interval:10000,init:imageWp('https://images.pexels.com/photos/417074/pexels-photo-417074.jpeg')},
    skogafoss: {icon:'\u{1F4A7}',name:'Skogafoss',interval:10000,init:imageWp('https://images.pexels.com/photos/2387873/pexels-photo-2387873.jpeg')},
    tablemountain: {icon:'\u{1F3D4}',name:'Table Mountain',interval:10000,init:imageWp('https://images.pexels.com/photos/1659438/pexels-photo-1659438.jpeg')},
    milkyway: {icon:'\u{1F30C}',name:'Milky Way',interval:10000,init:imageWp('https://images.pexels.com/photos/1252890/pexels-photo-1252890.jpeg')},
    aurorasky: {icon:'\u{1F4AB}',name:'Aurora Sky',interval:10000,init:imageWp('https://images.pexels.com/photos/1693095/pexels-photo-1693095.jpeg')},
    nebula: {icon:'\u{2728}',name:'Nebula',interval:10000,init:imageWp('https://images.pexels.com/photos/9160637/pexels-photo-9160637.jpeg')}
};

var wpInterval = null, wpCleanup = null, wpCurrent = 'matrix';

function stopWallpaper() {
    if (wpInterval) { clearInterval(wpInterval); wpInterval = null; }
    if (wpCleanup) { wpCleanup(); wpCleanup = null; }
}

function startWallpaper(id) {
    stopWallpaper();
    var canvas = document.getElementById('matrix-canvas');
    canvas.style.display = '';
    var ctx = canvas.getContext('2d');
    var wp = wallpapers[id];
    if (!wp) return;
    var result = wp.init(canvas, ctx);
    wpInterval = setInterval(result.draw, wp.interval || 50);
    wpCleanup = result.cleanup || function(){};
    wpCurrent = id;
    if (currentUser) {
        var accounts = loadAccounts();
        if (accounts[currentUser]) { accounts[currentUser].wp = id; saveAccounts(accounts); }
    }
}

function applyWp() {
    if (!currentUser) return;
    var acc = loadAccounts();
    if (acc[currentUser] && acc[currentUser].wp) startWallpaper(acc[currentUser].wp);
    else startWallpaper('matrix');
}

// === Toast Notifications ===
function showToast(title, body, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<div class="toast-title">' + title + '</div><div class="toast-body">' + body + '</div>';
    container.appendChild(t);
    setTimeout(function(){ t.classList.add('toast-out'); setTimeout(function(){ t.remove(); }, 300); }, 3500);
    t.onclick = function(){ t.classList.add('toast-out'); setTimeout(function(){ t.remove(); }, 300); };
}

// === Calendar Flyout ===
document.getElementById('clock').addEventListener('click', function(e) {
    e.stopPropagation();
    var flyout = document.getElementById('calendar-flyout');
    document.getElementById('action-center').classList.add('hidden');
    if (!flyout.classList.contains('hidden')) { flyout.classList.add('hidden'); return; }
    var now = new Date();
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var m = now.getMonth(), y = now.getFullYear();
    var first = new Date(y, m, 1).getDay();
    var last = new Date(y, m + 1, 0).getDate();
    var html = '<div class="cal-flyout-header">' + months[m] + ' ' + y + '</div>';
    html += '<div class="cal-flyout-grid">';
    days.forEach(function(d){ html += '<div class="cal-day header">' + d + '</div>'; });
    for (var i = 0; i < first; i++) html += '<div></div>';
    for (var d = 1; d <= last; d++) {
        var isToday = d === now.getDate() ? ' today' : '';
        html += '<div class="cal-day' + isToday + '">' + d + '</div>';
    }
    html += '</div>';
    html += '<div class="cal-flyout-time">' + now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</div>';
    flyout.innerHTML = html;
    flyout.classList.remove('hidden');
});

// === Action Center ===
document.getElementById('tray-action-center').addEventListener('click', function(e) {
    e.stopPropagation();
    var ac = document.getElementById('action-center');
    document.getElementById('calendar-flyout').classList.add('hidden');
    if (!ac.classList.contains('hidden')) { ac.classList.add('hidden'); return; }
    var html = '<div class="ac-header">\u{1F4AC} Action Center</div><div class="ac-toggles">';
    var isLight = document.body.classList.contains('light-theme');
    var toggles = [
        {id:'ac-wifi',icon:'\u{1F4F6}',label:'Wi-Fi',on:true},
        {id:'ac-bt',icon:'\u{1F5A5}',label:'Bluetooth',on:false},
        {id:'ac-nl',icon:isLight?'\u{2600}\uFE0F':'\u{1F319}',label:'Theme',on:isLight}
    ];
    toggles.forEach(function(t){
        html += '<div class="ac-toggle' + (t.on?' active':'') + '" data-ac="'+t.id+'"><span class="ac-icon">'+t.icon+'</span><span class="ac-label">'+t.label+'</span></div>';
    });
    html += '</div><div class="ac-volume"><span>\u{1F50A}</span><input type="range" min="0" max="100" value="75" id="ac-volume-slider"></div>';
    ac.innerHTML = html;
    ac.classList.remove('hidden');
    ac.querySelectorAll('.ac-toggle').forEach(function(tog){
        tog.onclick = function(){
            tog.classList.toggle('active');
            if (tog.dataset.ac === 'ac-nl') {
                var on = tog.classList.contains('active');
                document.body.classList.toggle('light-theme', on);
                localStorage.setItem('cyberos_theme', on ? 'light' : 'dark');
                tog.querySelector('.ac-icon').textContent = on ? '\u{2600}\uFE0F' : '\u{1F319}';
                var icon = document.getElementById('tray-nightlight');
                if (icon) icon.textContent = on ? '\u{2600}\uFE0F' : '\u{1F319}';
                var tr2 = localStorage.getItem('cyberos_transparency');
                if (tr2) {
                    var a2 = parseInt(tr2) / 100;
                    var base2 = on ? '255,255,255' : '2,8,19';
                    document.body.style.setProperty('--win-bg', 'rgba('+base2+','+a2+')');
                }
            }
            var label = tog.querySelector('.ac-label').textContent;
            var state = tog.classList.contains('active') ? 'ON' : 'OFF';
            showToast('Action Center', label + ' ' + state, 'info');
        };
    });
    var volSlider = ac.querySelector('#ac-volume-slider');
    volSlider.oninput = function(){
        var v = this.value;
        document.getElementById('tray-volume').textContent = v > 50 ? '\u{1F50A}' : v > 0 ? '\u{1F509}' : '\u{1F507}';
    };
});

// === Theme (Dark/Light mode) ===
function toggleTheme(light) {
    document.body.classList.toggle('light-theme', light);
    localStorage.setItem('cyberos_theme', light ? 'light' : 'dark');
    var tr = localStorage.getItem('cyberos_transparency');
    if (tr) {
        var a = parseInt(tr) / 100;
        var base = light ? '255,255,255' : '2,8,19';
        document.body.style.setProperty('--win-bg', 'rgba('+base+','+a+')');
    }
}

// Init theme on load
(function(){
    if (localStorage.getItem('cyberos_theme') === 'light') { document.body.classList.add('light-theme'); }
    // Init transparency
    var tr = localStorage.getItem('cyberos_transparency');
    if (tr) {
        var a = parseInt(tr)/100;
        var base = document.body.classList.contains('light-theme') ? '255,255,255' : '2,8,19';
        document.body.style.setProperty('--win-bg', 'rgba('+base+','+a+')');
    }
    // Init accent
    var accent = localStorage.getItem('cyberos_accent');
    if (accent) { document.documentElement.style.setProperty('--fg', accent); document.documentElement.style.setProperty('--fg-bright', accent); document.documentElement.style.setProperty('--border', accent); document.documentElement.style.setProperty('--accent', accent); document.documentElement.style.setProperty('--shadow', accent+'66'); }
})();

// === Search Bar ===
var searchInput = document.getElementById('search-input');
var searchResults = document.getElementById('search-results');
var allApps = [
    {t:'notes',i:'\u{1F4DD}',l:'Notepad'},{t:'todo',i:'\u2705',l:'Todo'},{t:'calendar',i:'\u{1F4C5}',l:'Calendar'},
    {t:'calc',i:'\u{1F9EE}',l:'Calculator'},{t:'ai',i:'\u{1F916}',l:'AI Chat'},{t:'gaminghub',i:'\u{1F3AE}',l:'Gaming Hub'},
    {t:'highscores',i:'\u{1F3C6}',l:'High Scores'},{t:'wallpapers',i:'\u{1F5BC}',l:'Wallpapers'},
    {t:'settings',i:'\u2699\uFE0F',l:'Settings'},{t:'taskmgr',i:'\u{1F4CA}',l:'Task Manager'}
];
searchInput.addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    if (!q) { searchResults.classList.add('hidden'); return; }
    var matches = allApps.filter(function(a){ return a.l.toLowerCase().includes(q) || a.t.toLowerCase().includes(q); });
    if (matches.length === 0) { searchResults.classList.add('hidden'); return; }
    searchResults.innerHTML = matches.map(function(a){ return '<div class="search-result-item" data-app="'+a.t+'"><span>'+a.i+'</span><span>'+a.l+'</span></div>'; }).join('');
    searchResults.classList.remove('hidden');
});
searchResults.addEventListener('click', function(e) {
    var item = e.target.closest('.search-result-item');
    if (!item) return;
    toggleWindow(item.dataset.app);
    searchResults.classList.add('hidden');
    searchInput.value = '';
});
document.addEventListener('click', function(e) {
    if (!e.target.closest('#taskbar-search')) searchResults.classList.add('hidden');
});

// === Emoji Picker (Win+.) ===
var emojiCats = {
    'Smileys':['\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F606}','\u{1F605}','\u{1F923}','\u{1F602}','\u{1F642}','\u{1F643}','\u{1F609}','\u{1F60A}','\u{1F607}','\u{1F60D}','\u{1F929}','\u{1F618}','\u{1F617}','\u{1F61A}','\u{1F619}','\u{1F61B}','\u{1F61C}','\u{1F92A}','\u{1F928}','\u{1F9D0}','\u{1F913}','\u{1F60E}','\u{1F921}','\u{1F920}','\u{1F973}','\u{1F976}','\u{1F974}','\u{1F635}'],
    'Gestures':['\u{1F44B}','\u{1F91A}','\u{1F590}','\u{270B}','\u{1F44C}','\u{1F44D}','\u{1F44E}','\u{270A}','\u{1F44A}','\u{1F91B}','\u{1F91C}','\u{1F44F}','\u{1F64C}','\u{1F450}','\u{1F932}','\u{1F91D}','\u{1F64F}'],
    'Nature':['\u{1F436}','\u{1F431}','\u{1F434}','\u{1F40E}','\u{1F435}','\u{1F433}','\u{1F437}','\u{1F43B}','\u{1F431}','\u{1F438}','\u{1F985}','\u{1F986}','\u{1F989}','\u{1F98A}','\u{1F99D}','\u{1F984}','\u{2600}','\u{1F319}','\u{2B50}','\u{1F31F}','\u{1F30C}','\u{1F308}','\u{1F33F}','\u{1F340}','\u{1F338}','\u{1F490}'],
    'Objects':['\u{1F4A1}','\u{1F526}','\u{1F4FB}','\u{1F4F1}','\u{1F4BB}','\u{1F5A5}','\u{1F4D6}','\u{2709}','\u{1F4E3}','\u{23F3}','\u{23F0}','\u{1F3B5}','\u{1F3B6}','\u{1F3A8}','\u{1F3AC}','\u{1F3AE}','\u{1F3B0}','\u{1F697}','\u{1F680}','\u{1F6F8}','\u{1F6EB}'],
    'Symbols':['\u{2764}','\u{1F5A4}','\u{2764}\uFE0F\u200D\u{1F525}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F90E}','\u{1F5E3}','\u{1F4AC}','\u{1F4A6}','\u{1F4A3}','\u{26A0}','\u{1F6AB}','\u{1F4B0}','\u{1F4B5}','\u{1F3C6}','\u{1F3B1}']
};
function openEmojiPicker() {
    var picker = document.getElementById('emoji-picker');
    if (!picker.classList.contains('hidden')) { picker.classList.add('hidden'); return; }
    var cats = Object.keys(emojiCats);
    picker.innerHTML = '<div class="ep-cats">' + cats.map(function(c,i){ return '<div class="ep-cat'+(i===0?' active':'')+'" data-cat="'+c+'">'+c+'</div>'; }).join('') + '</div><div class="ep-grid" id="ep-grid"></div>';
    var grid = picker.querySelector('#ep-grid');
    function showCat(cat) {
        grid.innerHTML = emojiCats[cat].map(function(e){ return '<div class="ep-item">'+e+'</div>'; }).join('');
        picker.querySelectorAll('.ep-cat').forEach(function(c){ c.classList.toggle('active', c.dataset.cat === cat); });
    }
    showCat(cats[0]);
    picker.querySelectorAll('.ep-cat').forEach(function(c){
        c.onclick = function(){ showCat(c.dataset.cat); };
    });
    grid.addEventListener('click', function(e){
        var item = e.target.closest('.ep-item');
        if (!item) return;
        var emoji = item.textContent;
        var activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            var start = activeEl.selectionStart, end = activeEl.selectionEnd;
            activeEl.value = activeEl.value.substring(0, start) + emoji + activeEl.value.substring(end);
            activeEl.selectionStart = activeEl.selectionEnd = start + emoji.length;
        }
        picker.classList.add('hidden');
    });
    picker.classList.remove('hidden');
}
document.addEventListener('click', function(e) {
    if (!e.target.closest('#emoji-picker')) document.getElementById('emoji-picker').classList.add('hidden');
});

// === Snap Layouts (Win+Z) ===
function showSnapLayouts() {
    var menu = document.getElementById('snap-layout-menu');
    if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
    var focusedWin = null;
    if (openWindows.length > 0) {
        var lastId = openWindows[openWindows.length - 1];
        var lastWin = document.getElementById(lastId);
        if (lastWin && !lastWin.classList.contains('hidden')) focusedWin = lastWin;
    }
    if (!focusedWin) { showToast('Snap Layouts', 'Open a window first', 'info'); return; }
    var rect = focusedWin.getBoundingClientRect();
    var layouts = [
        {name:'Left half',cols:2,preview:[1,1]},
        {name:'Right half',cols:2,preview:[0,1]},
        {name:'Left 2/3',cols:2,preview:[2,1]},
        {name:'Right 2/3',cols:2,preview:[1,2]},
        {name:'Four quarters',cols:4,preview:[1,1,1,1]}
    ];
    menu.innerHTML = '<div style="font-size:0.75rem;margin-bottom:6px;text-align:center;font-weight:bold;">Snap Layouts</div><div class="snap-layout-grid" style="grid-template-columns:repeat(5,1fr);gap:4px;">';
    layouts.forEach(function(l, idx){
        menu.innerHTML += '<div class="snap-layout-option" data-layout="'+idx+'"><div class="sl-preview">' + l.preview.map(function(p){ return '<div style="flex:'+p+'"></div>'; }).join('') + '</div><div style="font-size:0.6rem;margin-top:2px;text-align:center;">'+l.name+'</div></div>';
    });
    menu.innerHTML += '</div>';
    var mx = Math.min(rect.left, window.innerWidth - 340);
    var my = Math.max(0, rect.top - 120);
    menu.style.left = mx + 'px';
    menu.style.top = my + 'px';
    menu.classList.remove('hidden');
    menu.querySelectorAll('.snap-layout-option').forEach(function(opt){
        opt.onclick = function(){
            var idx = parseInt(opt.dataset.layout);
            var layouts_sizes = [
                {w:'50%',h:'100%',x:'0',y:'0'},
                {w:'50%',h:'100%',x:'50%',y:'0'},
                {w:'66%',h:'100%',x:'0',y:'0'},
                {w:'66%',h:'100%',x:'33%',y:'0'},
                {w:'50%',h:'50%',x:'0',y:'0'}
            ];
            var ls = layouts_sizes[idx];
            if (ls) {
                focusedWin.style.left = ls.x;
                focusedWin.style.top = ls.y;
                focusedWin.style.width = ls.w;
                focusedWin.style.height = ls.h;
            }
            menu.classList.add('hidden');
        };
    });
}
document.addEventListener('click', function(e) {
    if (!e.target.closest('#snap-layout-menu')) document.getElementById('snap-layout-menu').classList.add('hidden');
});

// === Keyboard shortcuts ===
document.addEventListener('keydown', function(e) {
    // Win+. = Emoji picker
    if (e.key === '.' && (e.metaKey || (e.ctrlKey && e.altKey))) {
        e.preventDefault();
        openEmojiPicker();
    }
    // Win+Z = Snap layouts
    if (e.key === 'z' && (e.metaKey || (e.ctrlKey && e.shiftKey))) {
        e.preventDefault();
        showSnapLayouts();
    }
    // Ctrl+Shift+Esc = Task Manager
    if (e.key === 'Escape' && e.shiftKey && e.ctrlKey) {
        e.preventDefault();
        toggleWindow('taskmgr');
    }
    // Ctrl+Shift+I = Settings
    if (e.key === 'I' && e.shiftKey && e.ctrlKey) {
        e.preventDefault();
        toggleWindow('settings');
    }
});

// === System Tray click handlers ===
document.getElementById('tray-volume').addEventListener('click', function(e) {
    e.stopPropagation();
    var popup = document.getElementById('volume-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'volume-popup';
        popup.innerHTML = '<span>\u{1F50A}</span><input type="range" min="0" max="100" value="75" id="vp-slider"><span id="vp-label">75%</span>';
        document.body.appendChild(popup);
        popup.querySelector('#vp-slider').oninput = function(){
            document.getElementById('vp-label').textContent = this.value + '%';
            document.getElementById('tray-volume').textContent = this.value > 50 ? '\u{1F50A}' : this.value > 0 ? '\u{1F509}' : '\u{1F507}';
        };
    }
    popup.classList.toggle('hidden');
    setTimeout(function(){ if (popup && !popup.classList.contains('hidden')) popup.classList.add('hidden'); }, 3000);
});
document.addEventListener('click', function(e) {
    var popup = document.getElementById('volume-popup');
    if (popup && !e.target.closest('#volume-popup') && !e.target.closest('#tray-volume')) popup.classList.add('hidden');
});

document.getElementById('tray-network').addEventListener('click', function() {
    showToast('Network Status', 'Connected to CyberNet \u{1F4F6} (Signal: Excellent)', 'info');
});
document.getElementById('tray-battery').addEventListener('click', function() {
    showToast('Battery', '85% remaining \u{1F50B} - Approximately 4h 30m left', 'info');
});
document.getElementById('tray-nightlight').addEventListener('click', function(e) {
    e.stopPropagation();
    var isLight = !document.body.classList.contains('light-theme');
    toggleTheme(isLight);
    this.textContent = isLight ? '\u{2600}\uFE0F' : '\u{1F319}';
    showToast('Theme', isLight ? 'Light mode \u{2600}\uFE0F' : 'Dark mode \u{1F319}', 'info');
});

// Init theme icon
(function(){
    var nl = document.getElementById('tray-nightlight');
    if (nl) nl.textContent = document.body.classList.contains('light-theme') ? '\u{2600}\uFE0F' : '\u{1F319}';
})();

// Toast on boot
setTimeout(function(){ showToast('Cyber OS', 'Welcome back' + (currentUser ? ' ' + currentUser : '') + '! \u{1F680}', 'info'); }, 1500);

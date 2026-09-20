/* ============================================================
   AURORA OS — core logic (pure, DOM-free, testable)
   Exposed as global `Core` in the browser and via module.exports in Node.
   ============================================================ */
(function () {
    'use strict';

    /* ---------- generic helpers ---------- */

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function fmtBytes(n) {
        if (!n || n < 0) n = 0;
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = 0;
        while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
        return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
    }

    function fmtUptime(ms) {
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        var parts = [];
        if (h) parts.push(h + 'h');
        if (h || m) parts.push(m + 'm');
        parts.push(sec + 's');
        return parts.join(' ');
    }

    /* ---------- virtual file system ----------
       Node shapes:
         folder: { type:'folder', children: { name: node } }
         file:   { type:'file', kind:'text', content:'...' }
       Paths are arrays of segment names; [] = root.
    ------------------------------------------------ */

    function defaultFS() {
        return {
            type: 'folder',
            children: {
                'Documents': {
                    type: 'folder',
                    children: {
                        'Welcome.txt': {
                            type: 'file', kind: 'text',
                            content:
                                'Welcome to Aurora OS! ✨\n\n' +
                                'Everything here runs inside your browser — windows, files,\n' +
                                'notes, even the music (synthesized live).\n\n' +
                                'Try these:\n' +
                                '  • Press Ctrl+K (or ⌘K) to open Aurora Search\n' +
                                '  • Chat with Aurora AI — it opens apps, does math, tells jokes\n' +
                                '  • Play 2048, Minesweeper, Snake, Memory & Tic-Tac-Toe in the Arcade\n' +
                                '  • Open the Terminal and type: neofetch\n' +
                                '  • Right-click the desktop for quick actions\n\n' +
                                'Your files and notes are saved to this browser automatically.\n'
                        },
                        'Polar Trip Ideas.txt': {
                            type: 'file', kind: 'text',
                            content:
                                'Northern lights expedition\n' +
                                '==========================\n' +
                                '- Chase the aurora above the lake\n' +
                                '- Hot cocoa in a glass igloo\n' +
                                '- Midnight snowshoe hike\n' +
                                '- Photograph the green shimmer\n'
                        }
                    }
                },
                'Pictures': {
                    type: 'folder',
                    children: {
                        'wallpaper-notes.txt': {
                            type: 'file', kind: 'text',
                            content: 'Six wallpapers ship with Aurora OS:\nAurora Night, Iridescent Glass, Deep Nebula,\nFrost Crystal, Dusk Hills, Morning Dunes.\n\nChange them in System Settings → Wallpaper.\n'
                        }
                    }
                },
                'readme.txt': {
                    type: 'file', kind: 'text',
                    content: 'Aurora OS v1.0 "Borealis"\nA desktop that lives in your browser.\n'
                }
            }
        };
    }

    function fsGet(root, path) {
        var node = root;
        for (var i = 0; i < path.length; i++) {
            if (!node || node.type !== 'folder') return null;
            node = node.children[path[i]];
        }
        return node || null;
    }

    function fsParentOf(path) { return path.slice(0, -1); }

    /* ---------- calculator ---------- */

    function calcCompute(a, b, op) {
        a = parseFloat(a); b = parseFloat(b);
        if (op === '+') return a + b;
        if (op === '−') return a - b;
        if (op === '×') return a * b;
        if (op === '÷') return b === 0 ? NaN : a / b;
        return b;
    }

    function fmtCalc(n) {
        if (!isFinite(n)) return 'Error';
        // trim float noise, cap length
        var s = String(Math.round(n * 1e10) / 1e10);
        if (s.replace('-', '').replace('.', '').length > 12) {
            s = n.toExponential(6).replace(/\.?0+e/, 'e');
        }
        return s;
    }

    /* ---------- 2048 ---------- */

    function emptyGrid() {
        return [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ];
    }

    // slide a single row to the LEFT; returns {row, gained, moved}
    function slideRow(row) {
        var arr = row.filter(function (v) { return v !== 0; });
        var out = [];
        var gained = 0;
        for (var i = 0; i < arr.length; i++) {
            if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
                var merged = arr[i] * 2;
                out.push(merged);
                gained += merged;
                i++; // skip the merged partner
            } else {
                out.push(arr[i]);
            }
        }
        while (out.length < row.length) out.push(0);
        var moved = out.join(',') !== row.join(',');
        return { row: out, gained: gained, moved: moved };
    }

    // dir: 'left' | 'right' | 'up' | 'down'; returns {grid, gained, moved}
    function moveGrid(grid, dir) {
        var N = 4;
        var gained = 0, moved = false;
        var out = emptyGrid();

        function getLine(i) {
            var line = [];
            for (var j = 0; j < N; j++) {
                if (dir === 'left') line.push(grid[i][j]);
                else if (dir === 'right') line.push(grid[i][N - 1 - j]);
                else if (dir === 'up') line.push(grid[j][i]);
                else line.push(grid[N - 1 - j][i]); // down
            }
            return line;
        }
        function setLine(i, line) {
            for (var j = 0; j < N; j++) {
                if (dir === 'left') out[i][j] = line[j];
                else if (dir === 'right') out[i][N - 1 - j] = line[j];
                else if (dir === 'up') out[j][i] = line[j];
                else out[N - 1 - j][i] = line[j];
            }
        }

        for (var i = 0; i < N; i++) {
            var res = slideRow(getLine(i));
            setLine(i, res.row);
            gained += res.gained;
            if (res.moved) moved = true;
        }
        return { grid: out, gained: gained, moved: moved };
    }

    function emptyCells(grid) {
        var cells = [];
        for (var r = 0; r < 4; r++)
            for (var c = 0; c < 4; c++)
                if (grid[r][c] === 0) cells.push([r, c]);
        return cells;
    }

    function addRandomTile(grid) {
        var cells = emptyCells(grid);
        if (!cells.length) return false;
        var cell = cells[Math.floor(Math.random() * cells.length)];
        grid[cell[0]][cell[1]] = Math.random() < 0.9 ? 2 : 4;
        return true;
    }

    function hasMoves(grid) {
        if (emptyCells(grid).length) return true;
        for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 4; c++) {
                var v = grid[r][c];
                if (r + 1 < 4 && grid[r + 1][c] === v) return true;
                if (c + 1 < 4 && grid[r][c + 1] === v) return true;
            }
        }
        return false;
    }

    function gridHas(grid, v) {
        for (var r = 0; r < 4; r++)
            for (var c = 0; c < 4; c++)
                if (grid[r][c] === v) return true;
        return false;
    }

    /* ---------- 2048 tile engine (animated, identity-preserving) ----------
       tiles: [{id, r, c, v}]. Returns {tiles, ghosts, gained, moved}:
       ghosts are absorbed tiles (id + target position) that should animate
       into their merge target, then vanish.
    ------------------------------------------------ */
    function moveTiles(tiles, dir) {
        var byPos = {};
        tiles.forEach(function (t) { byPos[t.r + ',' + t.c] = t; });
        var out = [], ghosts = [];
        var gained = 0, moved = false;
        var horiz = (dir === 'left' || dir === 'right');
        var forward = (dir === 'left' || dir === 'up');
        var mapPos = function (p) { return forward ? p : 3 - p; };
        var coord = function (t) { return horiz ? t.c : t.r; };

        for (var line = 0; line < 4; line++) {
            var lineTiles = [];
            for (var i = 0; i < 4; i++) {
                var idx = forward ? i : 3 - i;
                var r = horiz ? line : idx;
                var c = horiz ? idx : line;
                var t = byPos[r + ',' + c];
                if (t) lineTiles.push(t);
            }
            var pos = 0, i2 = 0;
            while (i2 < lineTiles.length) {
                var cur = lineTiles[i2], nxt = lineTiles[i2 + 1];
                if (nxt && nxt.v === cur.v) {
                    var kept = { id: cur.id, v: cur.v * 2, r: cur.r, c: cur.c };
                    if (horiz) kept.c = mapPos(pos); else kept.r = mapPos(pos);
                    var g = { id: nxt.id, r: nxt.r, c: nxt.c };
                    if (horiz) g.c = mapPos(pos); else g.r = mapPos(pos);
                    out.push(kept); ghosts.push(g);
                    gained += kept.v;
                    moved = true;
                    i2 += 2;
                } else {
                    var keep = { id: cur.id, v: cur.v, r: cur.r, c: cur.c };
                    if (horiz) keep.c = mapPos(pos); else keep.r = mapPos(pos);
                    if (coord(cur) !== mapPos(pos)) moved = true;
                    out.push(keep);
                    i2 += 1;
                }
                pos++;
            }
        }
        return { tiles: out, ghosts: ghosts, gained: gained, moved: moved };
    }

    /* ---------- Minesweeper ---------- */
    function buildMinefield(rows, cols, mines, safeR, safeC) {
        var forbidden = {};
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
            var fr = safeR + dr, fc = safeC + dc;
            if (fr >= 0 && fr < rows && fc >= 0 && fc < cols) forbidden[fr + ',' + fc] = true;
        }
        var avail = [];
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++)
            if (!forbidden[r + ',' + c]) avail.push([r, c]);
        var count = Math.min(mines, avail.length);
        /* Fisher-Yates on a copy */
        var pool = avail.slice();
        for (var i = pool.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        var mineSet = {};
        for (var k = 0; k < count; k++) mineSet[pool[k][0] + ',' + pool[k][1]] = true;
        var counts = [];
        for (var r2 = 0; r2 < rows; r2++) {
            var row = [];
            for (var c2 = 0; c2 < cols; c2++) {
                if (mineSet[r2 + ',' + c2]) { row.push(-1); continue; }
                var n = 0;
                for (var dr2 = -1; dr2 <= 1; dr2++) for (var dc2 = -1; dc2 <= 1; dc2++) {
                    if (!dr2 && !dc2) continue;
                    var nr = r2 + dr2, nc = c2 + dc2;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && mineSet[nr + ',' + nc]) n++;
                }
                row.push(n);
            }
            counts.push(row);
        }
        return { mines: mineSet, counts: counts };
    }

    function floodReveal(counts, revealed, r, c) {
        var rows = counts.length, cols = counts[0].length;
        var stack = [[r, c]];
        while (stack.length) {
            var cell = stack.pop();
            var cr = cell[0], cc = cell[1];
            var key = cr + ',' + cc;
            if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
            if (revealed[key]) continue;
            revealed[key] = true;
            if (counts[cr][cc] === 0) {
                for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    stack.push([cr + dr, cc + dc]);
                }
            }
        }
        return revealed;
    }

    /* ---------- Tic-tac-toe ---------- */
    var TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

    function tttWinner(b) {
        for (var i = 0; i < TTT_LINES.length; i++) {
            var L = TTT_LINES[i];
            if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[0]] === b[L[2]]) return b[L[0]];
        }
        var full = true;
        for (var j = 0; j < 9; j++) if (!b[j]) { full = false; break; }
        return full ? 'draw' : null;
    }

    function tttBestMove(board, me) {
        var opp = me === 'X' ? 'O' : 'X';
        function score(b, turn, depth) {
            var w = tttWinner(b);
            if (w === me) return 10 - depth;
            if (w === opp) return depth - 10;
            if (w === 'draw') return 0;
            var best = turn === me ? -Infinity : Infinity;
            for (var i = 0; i < 9; i++) if (!b[i]) {
                b[i] = turn;
                var s = score(b, turn === me ? opp : me, depth + 1);
                b[i] = null;
                if (turn === me ? s > best : s < best) best = s;
            }
            return best;
        }
        var bestI = -1, bestS = -Infinity;
        for (var i = 0; i < 9; i++) if (!board[i]) {
            board[i] = me;
            var s = score(board, opp, 1);
            board[i] = null;
            if (s > bestS) { bestS = s; bestI = i; }
        }
        return bestI;
    }

    /* ---------- safe math expression evaluator (chatbot) ---------- */
    function safeEval(expr) {
        var s = String(expr)
            .replace(/×/g, '*').replace(/÷/g, '/')
            .replace(/\s+/g, '');
        if (!s || !/^[-+*/%^().0-9]+$/.test(s)) return NaN;
        var i = 0;
        function peek() { return s[i]; }
        function parseExpr() {
            var v = parseTerm();
            while (peek() === '+' || peek() === '-') {
                var op = s[i++];
                var t = parseTerm();
                v = op === '+' ? v + t : v - t;
            }
            return v;
        }
        function parseTerm() {
            var v = parseFactor();
            while (peek() === '*' || peek() === '/' || peek() === '%') {
                var op = s[i++];
                var t = parseFactor();
                v = op === '*' ? v * t : op === '/' ? v / t : v % t;
            }
            return v;
        }
        function parseFactor() {
            if (peek() === '-') { i++; return -parseFactor(); }
            if (peek() === '+') { i++; return parseFactor(); }
            if (peek() === '(') {
                i++;
                var v = parseExpr();
                if (peek() !== ')') return NaN;
                i++;
                if (peek() === '^') { i++; return Math.pow(v, parseFactor()); }
                return v;
            }
            var j = i;
            while (j < s.length && /[\d.]/.test(s[j])) j++;
            if (j === i) return NaN;
            var num = parseFloat(s.slice(i, j));
            i = j;
            if (peek() === '^') { i++; return Math.pow(num, parseFactor()); }
            return num;
        }
        var v = parseExpr();
        return (i === s.length && isFinite(v)) ? v : NaN;
    }

    var Core = {
        clamp: clamp,
        esc: esc,
        fmtBytes: fmtBytes,
        fmtUptime: fmtUptime,
        defaultFS: defaultFS,
        fsGet: fsGet,
        fsParentOf: fsParentOf,
        calcCompute: calcCompute,
        fmtCalc: fmtCalc,
        emptyGrid: emptyGrid,
        slideRow: slideRow,
        moveGrid: moveGrid,
        moveTiles: moveTiles,
        emptyCells: emptyCells,
        addRandomTile: addRandomTile,
        hasMoves: hasMoves,
        gridHas: gridHas,
        buildMinefield: buildMinefield,
        floodReveal: floodReveal,
        tttWinner: tttWinner,
        tttBestMove: tttBestMove,
        safeEval: safeEval
    };

    if (typeof window !== 'undefined') window.Core = Core;
    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})();

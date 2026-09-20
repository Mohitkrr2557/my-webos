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
                                'notes, even the music app (it synthesizes sound live).\n\n' +
                                'Try these:\n' +
                                '  • Press Ctrl+K (or ⌘K) to open Aurora Search\n' +
                                '  • Right-click the desktop for quick actions\n' +
                                '  • Open the Terminal and type: neofetch\n' +
                                '  • Pick a new wallpaper in System Settings\n\n' +
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
        emptyCells: emptyCells,
        addRandomTile: addRandomTile,
        hasMoves: hasMoves,
        gridHas: gridHas
    };

    if (typeof window !== 'undefined') window.Core = Core;
    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})();

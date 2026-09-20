# ◍ Aurora OS — a desktop that lives in your browser

**Aurora OS** is a complete web-based operating system with a **glassmorphic aurora theme** — frosted-glass windows, a magnifying dock, a menu bar, live wallpapers, and a full set of working apps. Everything runs client-side in vanilla HTML/CSS/JS: no servers, no build step, no dependencies.

![Theme](wallpapers/aurora.jpg)

## The theme: "Borealis"

- 🌌 **Aurora glass** — deep-navy frosted surfaces (`backdrop-filter` blur + saturation) with teal/violet light
- 🖼 **6 AI-generated wallpapers** (aurora night, iridescent glass, nebula, frost, dusk, dunes) with a slowly drifting aurora glow overlay
- 🌗 **Dark & light modes**, 6 accent colors, brightness dimmer and night-light tint
- 🔤 System font stack (SF Pro / Segoe UI Variable) + monospace terminal

## Features

| Area | What's included |
|---|---|
| **Boot & session** | Animated boot sequence, login screen with avatar picker, lock / sleep / restart / shut down |
| **Window manager** | Drag, 8-way resize, zoom (double-click title bar), minimize-to-dock genie animation, focus/z-order management, traffic-light buttons |
| **Dock** | macOS-style magnification, bounce on launch, running-app indicators, tooltips |
| **Menu bar** | Aurora menu, live clock + mini-calendar popover, battery (Battery API), network status (online/offline), Control Center |
| **Aurora Search** | `Ctrl+K` / `⌘K` spotlight — fuzzy search across apps, actions, files and notes |
| **Control Center** | Dark mode, night light, brightness, volume, accent picker, wallpaper shuffle |
| **Persistence** | Everything (files, notes, settings, high scores, events) is saved to `localStorage` |

## Apps (11)

- **Files** — virtual file system with folders, text files, rename, move-to-trash
- **Trash** — real trash folder with restore-by-drag-free simplicity and "Empty Trash"
- **Editor** — multi-window text editor with autosave
- **Notes** — multi-note sidebar, live save
- **Terminal** — `ls / cd / cat / echo / neofetch / open / theme / accent / wallpaper / uptime …` with command history (↑/↓)
- **Calculator** — full keyboard support
- **Paint** — canvas painting, brush sizes, eraser, export PNG
- **Aurora FM** — *generative music* synthesized live with the Web Audio API (3 stations) + frequency visualizer
- **2048** — the classic, keyboard + swipe, best score persisted
- **Activity** — live CPU/memory/network charts + process table + FPS
- **Calendar** — month navigation, persistent event dots
- **Settings** — theme, accent, wallpapers, storage usage, factory reset

## Run it

Just serve the folder statically — or open `index.html` directly:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Project structure

```
index.html      — markup: boot, login, desktop, dock, overlays
style.css       — the Borealis theme (CSS variables, glass, animations)
core.js         — pure logic (2048 engine, virtual FS, calculator) — unit-testable in Node
script.js       — window manager, dock, apps, spotlight, control center…
wallpapers/     — 6 generated wallpapers
legacy/         — the previous "Cyber OS" experiment this repo started from
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `⌘K` or `Ctrl+Space` | Aurora Search |
| `Esc` | Close search / menus |
| arrows (in 2048) | slide tiles |
| `↑` / `↓` (in Terminal) | command history |

---

*Built as a single-page vanilla JS project — the only “backend” is your browser.* ✨

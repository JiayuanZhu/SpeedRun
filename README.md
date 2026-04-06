# SpeedRun 🏎️

A 3D browser racing game built with Three.js and Kenney Racing Kit assets.

## ⚠️ Important: Must Run via HTTP Server

**Do NOT open `index.html` directly by double-clicking** — browsers block loading local `.glb` model files via `file://` protocol (CORS restriction), so car models won't appear.

### How to Run

**Option A — Python (recommended, no install needed)**
```bash
cd SpeedRun
python3 -m http.server 8080
```
Then open: http://localhost:8080

**Option B — Node.js**
```bash
npx serve .
```

**Option C — VS Code**
Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, then right-click `index.html` → "Open with Live Server"

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / Reverse |
| A / ← | Steer left |
| D / → | Steer right |
| Space | Drift |
| Enter | Start race |

## Features

- 🏁 Silverstone F1 circuit layout (real GPS data from TUM racetrack database)
- 🏎️ Kenney Racing Kit 3D car models (GLB)
- 🌙 Night racing with starfield sky
- 🔴⚪ F1-style red/white kerbs
- 🏟️ Grandstands, pit lane, barriers, light posts
- 👻 Ghost piece / AI opponents (3 cars)
- 🏆 Lap timer & race HUD

## Assets

- [Three.js r128](https://threejs.org/)
- [Kenney Racing Kit](https://kenney.nl/assets/racing-kit) (CC0 License)
- Track data: [TUM Racetrack Database](https://github.com/TUMFTM/racetrack-database)

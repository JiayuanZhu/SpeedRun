#!/usr/bin/env python3
"""Record SpeedRun gameplay — Phase 5 polish build."""
import subprocess, time, json, os, sys
import urllib.request, urllib.error

DISPLAY   = ":99"
CDP_PORT  = 9223
WIN_W, WIN_H = 800, 600
OUT_MP4   = "/home/horde/SpeedRun/gameplay_new.mp4"
OUT_GIF   = "/home/horde/SpeedRun/gameplay_new.gif"
RECORD_S  = 28   # seconds of raw footage

os.environ["DISPLAY"] = DISPLAY

# ── helpers ──────────────────────────────────────────────────────────────────
def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, **kw)

def popen(cmd, **kw):
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, **kw)

# ── 1. Xvfb ──────────────────────────────────────────────────────────────────
print("Starting Xvfb...", flush=True)
# Try to start; if already running that's fine
xvfb = None
r0 = run(["Xvfb", DISPLAY, "-screen", "0", f"{WIN_W}x{WIN_H}x24",
           "-ac", "+extension", "GLX", "-nolisten", "tcp"])
if r0.returncode != 0:
    # Already running — start fresh
    run(["pkill", "-f", f"Xvfb {DISPLAY}"])
    time.sleep(0.5)
    xvfb = popen(["Xvfb", DISPLAY, "-screen", "0", f"{WIN_W}x{WIN_H}x24",
                  "-ac", "+extension", "GLX"])
    time.sleep(1.5)
else:
    xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", f"{WIN_W}x{WIN_H}x24",
                              "-ac", "+extension", "GLX"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
print(f"  Xvfb running on {DISPLAY}", flush=True)

# ── 2. Chrome ─────────────────────────────────────────────────────────────────
print("Launching Chrome...", flush=True)
run(["pkill", "-f", "chrome"])
time.sleep(1)
run(["rm", "-rf", "/tmp/chrome-record"])
chrome = popen([
    "google-chrome-stable",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    # Chrome 146+: SwiftShader must be requested via ANGLE
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--user-data-dir=/tmp/chrome-record",
    f"--window-size={WIN_W},{WIN_H}", "--window-position=0,0",
    "--no-first-run", "--disable-extensions", "--disable-popup-blocking",
    "--autoplay-policy=no-user-gesture-required",
    f"--remote-debugging-port={CDP_PORT}", "--remote-allow-origins=*",
    "http://localhost:8766/",
], env={**os.environ, "DISPLAY": DISPLAY})
print(f"  Chrome pid={chrome.pid}", flush=True)

# ── 3. Wait for CDP ───────────────────────────────────────────────────────────
print("Waiting for CDP...", flush=True)
for i in range(20):
    time.sleep(1)
    try:
        urllib.request.urlopen(
            f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=2).read()
        print(f"  CDP ready (attempt {i+1})", flush=True)
        break
    except Exception:
        pass

# ── 4. WebSocket CDP connection ───────────────────────────────────────────────
try:
    import websocket
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "websocket-client", "-q"])
    import websocket

data   = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json", timeout=5).read()
pages  = json.loads(data)
# Pick the actual page tab (type=page), prefer our file
ws_url = None
for p in pages:
    if p.get("type") == "page":
        ws_url = p["webSocketDebuggerUrl"].replace("localhost", "127.0.0.1")
        if "SpeedRun" in p.get("title","") or "index.html" in p.get("url",""):
            break
if not ws_url:
    ws_url = pages[0]["webSocketDebuggerUrl"].replace("localhost", "127.0.0.1")
print(f"  WS: {ws_url}", flush=True)

ws  = websocket.create_connection(ws_url, timeout=15)
_id = [1]

def cdp(method, params=None):
    msg = {"id": _id[0], "method": method}
    if params:
        msg["params"] = params
    ws.send(json.dumps(msg))
    want = _id[0]
    _id[0] += 1
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == want:
            return r

def js(expr):
    return cdp("Runtime.evaluate", {"expression": expr, "returnByValue": True})

def kdown(code, key, vk=0):
    cdp("Input.dispatchKeyEvent", {
        "type": "keyDown", "code": code, "key": key,
        "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
    })

def kup(code, key, vk=0):
    cdp("Input.dispatchKeyEvent", {
        "type": "keyUp", "code": code, "key": key,
        "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
    })

# ── 5. Navigate & confirm page loaded ────────────────────────────────────────
print("Navigating...", flush=True)
# Enable console message capture before navigation
cdp("Runtime.enable")
cdp("Log.enable")
cdp("Page.navigate", {"url": "http://localhost:8766/"})

# Poll until gameState is defined (up to 15s)
for attempt in range(15):
    time.sleep(1)
    r   = cdp("Runtime.evaluate", {"expression": "typeof gameState", "returnByValue": True})
    typ = r.get("result",{}).get("result",{}).get("value","?")
    print(f"  [{attempt+1}s] typeof gameState = {typ}", flush=True)
    if typ == "string":
        break

r2  = cdp("Runtime.evaluate", {"expression": "gameState", "returnByValue": True})
val = r2.get("result",{}).get("result",{}).get("value","?")
print(f"  gameState = {val}", flush=True)

# Debug if still not working
if val not in ("intro","countdown","racing","finished"):
    r3 = cdp("Runtime.evaluate", {"expression": "document.title"})
    print(f"  title = {r3.get('result',{}).get('result',{}).get('value')}", flush=True)
    r4 = cdp("Runtime.evaluate", {"expression":
        "!!window.THREE + ' / errors: ' + (window._errs||[]).join('; ')"})
    print(f"  THREE + errs = {r4.get('result',{}).get('result',{}).get('value')}", flush=True)
    # Intercept JS errors
    cdp("Runtime.evaluate", {"expression": """
        window._errs=[];
        window.onerror=function(m,s,l,c,e){window._errs.push(m);};
    """})
    r5 = cdp("Runtime.evaluate", {"expression":
        "!!document.createElement('canvas').getContext('webgl2') + ' webgl2 / ' + "
        "!!document.createElement('canvas').getContext('webgl') + ' webgl'"})
    print(f"  webgl = {r5.get('result',{}).get('result',{}).get('value')}", flush=True)
    time.sleep(2)
    r6 = cdp("Runtime.evaluate", {"expression": "window._errs.join(' | ')"})
    print(f"  JS errors = {r6.get('result',{}).get('result',{}).get('value')}", flush=True)
    print("  Trying hard reload...", flush=True)
    cdp("Page.reload", {"ignoreCache": True})
    time.sleep(6)
    r7 = cdp("Runtime.evaluate", {"expression": "gameState", "returnByValue": True})
    val = r7.get("result",{}).get("result",{}).get("value","?")
    print(f"  gameState after reload = {val}", flush=True)

# ── 6. Press Enter → start countdown ─────────────────────────────────────────
print("Pressing Enter → countdown...", flush=True)
kdown("Enter", "Enter", 13)
time.sleep(0.1)
kup  ("Enter", "Enter", 13)
time.sleep(4.5)   # wait for 3-2-1-GO + slight buffer

state = js("gameState")
print(f"  gameState after countdown = {state['result']['result'].get('value')}", flush=True)

# ── 7. Start ffmpeg recording ─────────────────────────────────────────────────
print("Starting ffmpeg...", flush=True)
ffmpeg = subprocess.Popen([
    "ffmpeg", "-y",
    "-f", "x11grab", "-video_size", f"{WIN_W}x{WIN_H}",
    "-framerate", "25", "-i", DISPLAY,
    "-t", str(RECORD_S),
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-preset", "ultrafast", "-crf", "20",
    OUT_MP4,
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.3)

# ── 8. Drive! ─────────────────────────────────────────────────────────────────
# Track analysis:
#   Car starts at x=60,z=0 heading angle=PI/2 → moves in -Z direction
#   Ellipse rx=60, rz=35  (TRACK_RX / TRACK_RZ)
#   Clockwise path: right→south→left→north→right
#   LEFT key (A) increases car.angle → follows clockwise arc
#   Lap ≈ 6-7 seconds at normal speed
#
# Pattern (period ~6.5s):
#   0.0–2.5  → hold A (long clockwise curve)
#   2.5–3.2  → straight (W only)
#   3.2–5.5  → hold A again (second curve), Space drift at peak
#   5.5–6.5  → straight

print("Driving!", flush=True)
kdown("KeyW", "w", 87)     # hold accelerate throughout

t0     = time.time()
a_held = False
s_held = False   # Space/drift

LAP    = 6.5     # approximate lap period in seconds
DRIVE  = RECORD_S - 1

while time.time() - t0 < DRIVE:
    t  = (time.time() - t0) % LAP
    elapsed = time.time() - t0

    # ── Steering schedule (within each lap period) ──
    want_A = (t < 2.6) or (3.3 < t < 5.8)
    # Drift: mid of each curve
    want_S = ((0.6 < t < 2.0) or (3.9 < t < 5.2)) and elapsed > 1.5

    if want_A and not a_held:
        kdown("KeyA", "a", 65); a_held = True
    elif not want_A and a_held:
        kup("KeyA", "a", 65); a_held = False

    if want_S and not s_held:
        kdown("Space", " ", 32); s_held = True
    elif not want_S and s_held:
        kup("Space", " ", 32); s_held = False

    time.sleep(0.04)

# Release everything
kup("KeyW", "w", 87)
if a_held: kup("KeyA", "a", 65)
if s_held: kup("Space", " ", 32)

# ── 9. Wait for ffmpeg ────────────────────────────────────────────────────────
print("Waiting for recording...", flush=True)
try:
    ffmpeg.wait(timeout=35)
except subprocess.TimeoutExpired:
    ffmpeg.kill()
print(f"  MP4 size: {os.path.getsize(OUT_MP4)//1024}KB", flush=True)

# ── 10. Convert to GIF ───────────────────────────────────────────────────────
print("Converting to GIF...", flush=True)
r = subprocess.run([
    "ffmpeg", "-y", "-i", OUT_MP4,
    "-vf", (
        "fps=12,scale=640:-1:flags=lanczos,"
        "split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=single[p];"
        "[s1][p]paletteuse=dither=bayer:bayer_scale=3"
    ),
    OUT_GIF,
], capture_output=True)
if r.returncode != 0:
    print("GIF error:", r.stderr[-300:].decode(), flush=True)
else:
    print(f"  GIF size: {os.path.getsize(OUT_GIF)//1024}KB", flush=True)

# ── Cleanup ───────────────────────────────────────────────────────────────────
ws.close()
chrome.terminate()
xvfb.terminate()
print("Done!", flush=True)

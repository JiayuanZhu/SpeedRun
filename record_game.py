#!/usr/bin/env python3
"""Record SpeedRun racing game gameplay."""
import subprocess, time, json, os
import urllib.request, websocket

DISPLAY = ":99"
CDP_PORT = 9227
os.environ["DISPLAY"] = DISPLAY

# Kill old chrome
subprocess.run(["pkill", "-f", "chrome"], capture_output=True)
time.sleep(2)

# Launch Chrome
print("Launching Chrome...", flush=True)
subprocess.run(["rm", "-rf", "/tmp/chrome-sr"], capture_output=True)
chrome = subprocess.Popen([
    "google-chrome-stable", "--no-sandbox", "--disable-gpu", "--disable-software-rasterizer",
    "--user-data-dir=/tmp/chrome-sr", "--window-size=800,700", "--window-position=0,0",
    "--no-first-run", "--disable-extensions",
    f"--remote-debugging-port={CDP_PORT}", "--remote-allow-origins=*",
    "file:///home/horde/SpeedRun/index.html"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Wait for CDP
print("Waiting for CDP...", flush=True)
for i in range(15):
    time.sleep(1)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=2).read()
        print(f"CDP ready (attempt {i+1})", flush=True)
        break
    except:
        pass

# Connect
data = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json", timeout=5).read()
pages = json.loads(data)
ws_url = pages[-1]["webSocketDebuggerUrl"].replace("localhost", "127.0.0.1")
for p in pages:
    if "SpeedRun" in p.get("title", "") or "index" in p.get("url", ""):
        ws_url = p["webSocketDebuggerUrl"].replace("localhost", "127.0.0.1")
        break

ws = websocket.create_connection(ws_url, timeout=10)
mid = [1]

def cmd(method, params=None):
    c = {"id": mid[0], "method": method}
    if params: c["params"] = params
    ws.send(json.dumps(c))
    mid[0] += 1
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == mid[0] - 1:
            return r

def ev(expr):
    return cmd("Runtime.evaluate", {"expression": expr})

def key_event(etype, code, key, vk):
    cmd("Input.dispatchKeyEvent", {
        "type": etype, "key": key, "code": code, "windowsVirtualKeyCode": vk
    })

def kd(code, key, vk):
    key_event("keyDown", code, key, vk)

def ku(code, key, vk):
    key_event("keyUp", code, key, vk)

# Reload page
cmd("Page.navigate", {"url": "file:///home/horde/SpeedRun/index.html"})
time.sleep(3)

# Wait for countdown (3-2-1-GO = ~4 seconds)
print("Countdown...", flush=True)
time.sleep(5)

state = ev("gameState").get("result", {}).get("result", {}).get("value", "?")
print(f"gameState = {state}", flush=True)

# Start recording
print("Recording 18s...", flush=True)
ffmpeg = subprocess.Popen([
    "ffmpeg", "-y", "-f", "x11grab", "-video_size", "800x700",
    "-framerate", "15", "-i", DISPLAY,
    "-t", "18", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
    "/home/horde/SpeedRun/gameplay.mp4"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.5)

# Drive! Keys: W=accelerate, A=left, D=right, Space=drift
print("Driving!", flush=True)
kd("KeyW", "w", 87)  # Hold accelerate

t0 = time.time()
d_held = False
sp_held = False

while time.time() - t0 < 17:
    phase = (time.time() - t0) % 5.5

    # Turn right on curves, straight on straights, drift on some turns
    if phase < 2.2:
        # Curve: turn right
        if not d_held:
            kd("KeyD", "d", 68)
            d_held = True
        # Drift mid-curve
        if 0.5 < phase < 1.8:
            if not sp_held:
                kd("Space", " ", 32)
                sp_held = True
        else:
            if sp_held:
                ku("Space", " ", 32)
                sp_held = False
    elif phase < 3.0:
        # Straight
        if d_held:
            ku("KeyD", "d", 68)
            d_held = False
        if sp_held:
            ku("Space", " ", 32)
            sp_held = False
    elif phase < 5.0:
        # Another curve
        if not d_held:
            kd("KeyD", "d", 68)
            d_held = True
        if 3.5 < phase < 4.5:
            if not sp_held:
                kd("Space", " ", 32)
                sp_held = True
        else:
            if sp_held:
                ku("Space", " ", 32)
                sp_held = False
    else:
        # Brief straight
        if d_held:
            ku("KeyD", "d", 68)
            d_held = False
        if sp_held:
            ku("Space", " ", 32)
            sp_held = False

    time.sleep(0.05)

# Release all
ku("KeyW", "w", 87)
if d_held:
    ku("KeyD", "d", 68)
if sp_held:
    ku("Space", " ", 32)

print("Waiting for recording to finish...", flush=True)
ffmpeg.wait(timeout=25)

# Convert to GIF
print("Converting to GIF...", flush=True)
subprocess.run([
    "ffmpeg", "-y", "-i", "/home/horde/SpeedRun/gameplay.mp4",
    "-vf", "fps=12,scale=600:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=2",
    "/home/horde/SpeedRun/gameplay.gif"
], capture_output=True)

ws.close()
chrome.terminate()

for f in ["/home/horde/SpeedRun/gameplay.mp4", "/home/horde/SpeedRun/gameplay.gif"]:
    if os.path.exists(f):
        print(f"{f}: {os.path.getsize(f) // 1024}KB", flush=True)

print("ALL DONE", flush=True)

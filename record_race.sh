#!/bin/bash
set -e
export DISPLAY=:99

echo "STEP1: Launch Chrome"
pkill -f "chrome.*9226" 2>/dev/null; sleep 1
rm -rf /tmp/chrome-speedrun
google-chrome-stable --no-sandbox --disable-gpu --disable-software-rasterizer \
  --user-data-dir=/tmp/chrome-speedrun \
  --window-size=800,700 --window-position=0,0 \
  --no-first-run --disable-extensions \
  --remote-debugging-port=9226 --remote-allow-origins=* \
  "file:///home/horde/SpeedRun/index.html" &>/dev/null &
CPID=$!
echo "Chrome PID: $CPID"

echo "STEP2: Wait for CDP"
for i in $(seq 1 15); do
  sleep 1
  curl -s --connect-timeout 1 http://127.0.0.1:9226/json/version > /dev/null 2>&1 && { echo "CDP ready (attempt $i)"; break; }
done

echo "STEP3: Play and record"
python3 - <<'PYEOF'
import subprocess, time, json, random, os, sys
import urllib.request, websocket

os.environ["DISPLAY"] = ":99"

# Connect CDP
data = urllib.request.urlopen("http://127.0.0.1:9226/json", timeout=5).read()
pages = json.loads(data)
ws_url = None
for p in pages:
    if "SpeedRun" in p.get("title","") or "index.html" in p.get("url",""):
        ws_url = p["webSocketDebuggerUrl"].replace("localhost","127.0.0.1")
        break
if not ws_url:
    ws_url = pages[-1]["webSocketDebuggerUrl"].replace("localhost","127.0.0.1")

ws = websocket.create_connection(ws_url, timeout=10)
mid = [1]

def cmd(method, params=None):
    c = {"id": mid[0], "method": method}
    if params: c["params"] = params
    ws.send(json.dumps(c)); mid[0] += 1
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == mid[0]-1: return r

def ev(expr): return cmd("Runtime.evaluate", {"expression": expr})

def key_down(code):
    km = {"ArrowLeft":37,"ArrowRight":39,"ArrowUp":38,"ArrowDown":40,"Space":32,
          "KeyW":87,"KeyA":65,"KeyS":83,"KeyD":68}
    kn = {"Space":" ","KeyW":"w","KeyA":"a","KeyS":"s","KeyD":"d"}.get(code, code)
    cmd("Input.dispatchKeyEvent",{"type":"keyDown","key":kn,"code":code,
        "windowsVirtualKeyCode":km.get(code,0)})

def key_up(code):
    km = {"ArrowLeft":37,"ArrowRight":39,"ArrowUp":38,"ArrowDown":40,"Space":32,
          "KeyW":87,"KeyA":65,"KeyS":83,"KeyD":68}
    kn = {"Space":" ","KeyW":"w","KeyA":"a","KeyS":"s","KeyD":"d"}.get(code, code)
    cmd("Input.dispatchKeyEvent",{"type":"keyUp","key":kn,"code":code,
        "windowsVirtualKeyCode":km.get(code,0)})

# Reload for fresh race
cmd("Page.navigate", {"url": "file:///home/horde/SpeedRun/index.html"})
time.sleep(2)

# Wait for countdown to finish (4 seconds: 3,2,1,GO)
print("Waiting for countdown...", flush=True)
time.sleep(5)

# Verify game is racing
state = ev("gameState").get("result",{}).get("result",{}).get("value","?")
print(f"gameState = {state}", flush=True)

# Start recording
print("Recording...", flush=True)
ffmpeg = subprocess.Popen(["ffmpeg","-y","-f","x11grab","-video_size","800x700",
    "-framerate","15","-i",":99","-t","18","-c:v","libx264","-pix_fmt","yuv420p",
    "-preset","ultrafast","/home/horde/SpeedRun/gameplay.mp4"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.5)

# Drive! Accelerate and steer around the oval track
# The track is an ellipse - we need to turn right continuously (clockwise)
print("Driving!", flush=True)
t0 = time.time()
held_keys = set()

def press(code):
    if code not in held_keys:
        key_down(code); held_keys.add(code)

def release(code):
    if code in held_keys:
        key_up(code); held_keys.discard(code)

# Always hold W to accelerate
press("KeyW")

while time.time() - t0 < 17:
    elapsed = time.time() - t0
    
    # Get car angle to determine where on track we are
    # Simple strategy: alternate between turning right and straight
    # with occasional drifts
    phase = elapsed % 6  # 6 second cycle
    
    if phase < 2.5:
        # Turning right (curve section)
        press("KeyD")
        release("KeyA")
        # Drift on some turns
        if phase > 0.5 and phase < 2.0:
            press("Space")
        else:
            release("Space")
    elif phase < 3.5:
        # Straight section
        release("KeyD")
        release("KeyA")
        release("Space")
    elif phase < 5.5:
        # Another turn
        press("KeyD")
        release("KeyA")
        if phase > 4.0 and phase < 5.0:
            press("Space")
        else:
            release("Space")
    else:
        # Brief straight
        release("KeyD")
        release("KeyA")
        release("Space")
    
    time.sleep(0.05)

# Release all
for k in list(held_keys):
    release(k)

# Get score info
try:
    s = ev("document.querySelector ? 'ok' : 'no'")
    print(f"Game state: {ev('gameState').get('result',{}).get('result',{}).get('value','?')}", flush=True)
except: pass

print("Waiting for recording...", flush=True)
ffmpeg.wait(timeout=25)

# Convert to GIF
print("Converting to GIF...", flush=True)
subprocess.run(["ffmpeg","-y","-i","/home/horde/SpeedRun/gameplay.mp4",
    "-vf","fps=12,scale=600:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=2",
    "/home/horde/SpeedRun/gameplay.gif"], capture_output=True)

ws.close()
for f in ["/home/horde/SpeedRun/gameplay.mp4","/home/horde/SpeedRun/gameplay.gif"]:
    if os.path.exists(f): print(f"{f}: {os.path.getsize(f)//1024}KB", flush=True)
print("DONE", flush=True)
PYEOF

echo "STEP4: Cleanup"
kill $CPID 2>/dev/null
echo "ALL_DONE"

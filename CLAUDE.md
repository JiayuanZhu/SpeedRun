# SpeedRun - 2D F1 Racing Game

## Project Plan

Build a top-down 2D F1 racing game in a single `index.html` file using Canvas 2D.

### Phase 1: Basic track + car rendering ✅
- Draw an oval/circuit track (gray asphalt + red/white kerbs + green grass)
- Render a player car (colored rectangle with direction)
- Camera follows the player car
- WASD/Arrow keys for basic movement

### Phase 2: Physics system
- Acceleration/deceleration with inertia
- Steering with angular velocity
- Friction model (different on road vs grass)
- Speed reduction off-track

### Phase 3: Drift system
- Space/Shift key triggers drift mode
- Reduced tire friction during drift → sideways sliding
- Black tire marks trail effect
- Brief speed boost when exiting drift

### Phase 4: Track definition + lap system
- Define track with waypoints/checkpoints
- Lap counter (3 laps to finish)
- Lap timing (current + best)
- Start/finish line detection

### Phase 5: AI opponents
- 3 AI cars following the track path
- Different colors for each car
- Simple speed variation
- Position/ranking calculation (1st-4th)

### Phase 6: UI + Polish
- Speed gauge (km/h)
- Lap counter display
- Current/best lap time
- Position ranking
- Countdown 3-2-1-GO!
- Mini-map (top-right corner)
- R key to restart
- Speed lines/particle effects

## Tech
- Single index.html file
- Canvas 2D rendering at 60fps
- No external dependencies

## Commit after EACH phase completion.

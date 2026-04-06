# SpeedRun 3D 资产升级计划

## 目标
用 Kenney Racing Kit 的真实 GLB 模型替换游戏中所有程序生成的几何体，提升视觉质量。

## 现有代码结构分析

### 当前几何体位置（game.js）
- **玩家赛车** `carGroup`：BoxGeometry 盒子 + 轮子圆柱体，约 L150~L220
- **AI 赛车** `createAICar()`：同上，只是颜色不同，L225~L280
- **赛道** `track`：程序生成的椭圆面 + 护栏 TorusGeometry，L60~L140
- **背景草地**：PlaneGeometry 绿色大平面，L55~L60
- **装饰物**：无（目前全空）

### GLTFLoader 引入方式
- Three.js 当前通过 `<script src="three.min.js">` 引入（版本 r128）
- GLTFLoader 需单独加载，r128 对应路径：
  `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js`

---

## 分阶段计划

### Phase A — 引入 GLTFLoader + 玩家赛车替换
**任务：**
1. 在 index.html 加入 GLTFLoader CDN script
2. 封装 `loadGLB(path, callback)` 异步加载函数
3. 加载 `raceCarRed.glb`，scale=2，Y轴旋转对齐朝向
4. 加载完成前保留原 BoxGeometry 占位，加载后替换 mesh
5. 验证：玩家赛车变成红色 F1 车模型，操控正常

**commit:** `phase-a-player-car-glb`

---

### Phase B — AI 赛车替换
**任务：**
1. 加载 `raceCarOrange.glb`、`raceCarGreen.glb`、`raceCarWhite.glb`
2. 替换 3 辆 AI 赛车的 mesh
3. 保持 AI 路径跟踪逻辑不变

**commit:** `phase-b-ai-cars-glb`

---

### Phase C — 赛道边装饰（树木 + 看台）
**任务：**
1. 沿赛道外侧均匀放置 8~12 棵 `treeLarge.glb`
2. 赛道直道两侧各放 2 个 `grandStand.glb`
3. 使用实例化或直接 clone，固定摆放不影响碰撞

**commit:** `phase-c-track-scenery`

---

### Phase D — 护栏 + 围栏
**任务：**
1. 赛道内缘用 `barrierRed.glb` 替换现有 TorusGeometry 护栏
2. 赛道外缘用 `fenceStraight.glb` 围合
3. 调整碰撞检测仍用原有椭圆逻辑（视觉替换，不改物理）

**commit:** `phase-d-barriers-fences`

---

### Phase E — 路灯 + 旗帜点缀（可选）
**任务：**
1. 起跑线两侧放 `flagCheckers.glb` 旗帜
2. 直道处放 2~4 根 `lightPostModern.glb`

**commit:** `phase-e-details`

---

## 技术注意点

| 问题 | 解决方案 |
|------|---------|
| 路径含空格 | `encodeURIComponent` 或直接用 `%20`：`GLTF%20format/raceCarRed.glb` |
| 模型默认朝向 | Kenney 车模型面朝 +Z，需 `model.rotation.y = Math.PI / 2` 或按实测调整 |
| 模型 scale | 赛车约 scale=2，树约 scale=3，看台约 scale=4，按视觉效果调整 |
| 异步加载 | 游戏循环开始前不等待，加载完后 `carGroup.clear(); carGroup.add(model)` |
| r128 兼容 | GLTFLoader r128 版本，不要用 ES Module 版本 |

---

## 执行顺序
按 A → B → C → D → E 推进，每完成一个 Phase 汇报一次。

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import type { Cell, Direction, Screen } from "./constants";

export const BACKGROUND = "#050713";
type R = DeepReadonly<CoilState>;
type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};
interface Sprites {
  readonly heads: readonly ImageBitmap[];
  readonly body: ImageBitmap;
  readonly corner: ImageBitmap;
  readonly tail: ImageBitmap;
}
interface Press {
  readonly id: number;
  readonly index: number;
}

export interface CoilState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly mode: typeof C.MODE;
  readonly score: number;
  readonly best: number;
  readonly combo: number;
  readonly comboWindow: number;
  readonly muted: boolean;
  readonly ticks: number;
  readonly simTime: number;
  readonly dir: Direction;
  readonly turns: readonly Direction[];
  readonly snake: readonly Cell[];
  readonly pellet: Cell | null;
  readonly obstacles: readonly Cell[];
  readonly steering: boolean;
  readonly travel: boolean;
  readonly pelletRespawn: boolean;
  readonly nextPellet: Cell | null;
  readonly accumulator: number;
  readonly biteTime: number;
  readonly presses: readonly Press[];
  readonly sprites: Sprites;
}
export type CoilSnapshot = Pick<
  CoilState,
  | "screen"
  | "menuIndex"
  | "titleIndex"
  | "mode"
  | "score"
  | "best"
  | "combo"
  | "comboWindow"
  | "muted"
  | "ticks"
  | "simTime"
  | "dir"
  | "turns"
  | "snake"
  | "pellet"
  | "obstacles"
  | "steering"
  | "travel"
  | "pelletRespawn"
  | "nextPellet"
> & { readonly version: number };
export interface CoilDebugApi {
  readonly version: number;
  reset(s: R): CoilState;
  reconcile(s: R): CoilState;
  snapshot(s: R): CoilSnapshot;
  menuItemRect(s: R, i: number): Rect | null;
  setScreen(s: R, v: Screen): CoilState;
  setMenuIndex(s: R, v: number): CoilState;
  setScore(s: R, v: number): CoilState;
  setBest(s: R, v: number): CoilState;
  setCombo(s: R, v: number): CoilState;
  setComboWindow(s: R, v: number): CoilState;
  setSnake(s: R, v: readonly Cell[]): CoilState;
  setDirection(s: R, v: Direction): CoilState;
  clearTurns(s: R): CoilState;
  setSnakeSteering(s: R, v: boolean): CoilState;
  setSnakeTravel(s: R, v: boolean): CoilState;
  setPellet(s: R, col: number, row: number): CoilState;
  clearPellet(s: R): CoilState;
  setPelletRespawn(s: R, v: boolean): CoilState;
  setNextPellet(s: R, col: number, row: number): CoilState;
  drawPelletCell(s: R): Cell | null;
}

const vectors: Record<Direction, Cell> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};
const cells = (v: readonly DeepReadonly<Cell>[]): Cell[] =>
  v.map(({ col, row }) => ({ col, row }));
const eq = (a: DeepReadonly<Cell>, b: DeepReadonly<Cell>) =>
  a.col === b.col && a.row === b.row;
const id = (a: DeepReadonly<Cell>) => `${a.col},${a.row}`;
const interior = (a: DeepReadonly<Cell>) =>
  a.col >= C.INTERIOR_MIN_COL &&
  a.col <= C.INTERIOR_MAX_COL &&
  a.row >= C.INTERIOR_MIN_ROW &&
  a.row <= C.INTERIOR_MAX_ROW;
function cp(s: R, p: Partial<CoilState> = {}): CoilState {
  return {
    ...s,
    turns: [...s.turns],
    snake: cells(s.snake),
    pellet: s.pellet ? { ...s.pellet } : null,
    obstacles: cells(s.obstacles),
    nextPellet: s.nextPellet ? { ...s.nextPellet } : null,
    presses: s.presses.map((x) => ({ ...x })),
    sprites: s.sprites as Sprites,
    ...p,
  };
}
function initial(sprites: Sprites, muted = false): CoilState {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    mode: C.MODE,
    score: 0,
    best: 0,
    combo: 1,
    comboWindow: 0,
    muted,
    ticks: 0,
    simTime: 0,
    dir: C.START_DIR,
    turns: [],
    snake: cells(C.START_CELLS),
    pellet: null,
    obstacles: cells(C.OBSTACLE_CELLS),
    steering: true,
    travel: true,
    pelletRespawn: true,
    nextPellet: null,
    accumulator: 0,
    biteTime: 0,
    presses: [],
    sprites,
  };
}
function items(screen: Screen): readonly string[] {
  if (screen === "title") return C.TITLE_ITEMS;
  if (screen === "paused") return C.PAUSE_ITEMS;
  if (screen === "gameover" || screen === "cleared") return C.OVER_ITEMS;
  if (screen === "howto") return ["BACK"];
  return [];
}
function rect(screen: Screen, i: number): Rect | null {
  if (!Number.isInteger(i) || i < 0 || i >= items(screen).length) return null;
  const w = screen === "paused" ? 320 : 360;
  const y =
    screen === "title"
      ? 432
      : screen === "howto"
        ? 610
        : screen === "paused"
          ? 342
          : 470;
  return { x: C.STAGE_CX - w / 2, y: y + i * 72, w, h: 58 };
}
function valid(s: R): Cell[] {
  const used = new Set(s.snake.map(id));
  s.obstacles.forEach((x) => used.add(id(x)));
  if (s.pellet) used.add(id(s.pellet));
  const out: Cell[] = [];
  for (let row = C.INTERIOR_MIN_ROW; row <= C.INTERIOR_MAX_ROW; row++)
    for (let col = C.INTERIOR_MIN_COL; col <= C.INTERIOR_MAX_COL; col++)
      if (!used.has(`${col},${row}`)) out.push({ col, row });
  return out;
}
function spawn(s: R): { pellet: Cell | null; nextPellet: null } {
  const v = valid(s);
  const posed = s.nextPellet && v.find((x) => eq(x, s.nextPellet!));
  return {
    pellet: v.length
      ? posed
        ? { ...posed }
        : v[Math.floor(Math.random() * v.length)]!
      : null,
    nextPellet: null,
  };
}
function whole(v: number, n: string, min = 0) {
  if (!Number.isInteger(v) || v < min) throw new Error(`Coil: invalid ${n}`);
}
function snap(s: R): CoilSnapshot {
  return {
    version: C.COIL_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    mode: C.MODE,
    score: s.score,
    best: s.best,
    combo: s.combo,
    comboWindow: s.comboWindow,
    muted: s.muted,
    ticks: s.ticks,
    simTime: s.simTime,
    dir: s.dir,
    turns: [...s.turns],
    snake: cells(s.snake),
    pellet: s.pellet ? { ...s.pellet } : null,
    obstacles: cells(s.obstacles),
    steering: s.steering,
    travel: s.travel,
    pelletRespawn: s.pelletRespawn,
    nextPellet: s.nextPellet ? { ...s.nextPellet } : null,
  };
}
function debug(sprites: Sprites): CoilDebugApi {
  return {
    version: C.COIL_DEBUG_VERSION,
    reset: (s) => initial(sprites, s.muted),
    reconcile: (s) => cp(s),
    snapshot: snap,
    menuItemRect: (s, i) => {
      whole(i, "menu index");
      return rect(s.screen, i);
    },
    setScreen: (s, v) => {
      if (!C.SCREENS.includes(v)) throw Error("Coil: invalid screen");
      return cp(s, { screen: v });
    },
    setMenuIndex: (s, v) => {
      whole(v, "menu index");
      const n = items(s.screen).length;
      if ((!n && v !== 0) || (n && v >= n))
        throw Error("Coil: menu index is not on this screen");
      return cp(s, { menuIndex: v });
    },
    setScore: (s, v) => {
      whole(v, "score");
      return cp(s, { score: v });
    },
    setBest: (s, v) => {
      whole(v, "best");
      return cp(s, { best: v });
    },
    setCombo: (s, v) => {
      whole(v, "combo", 1);
      if (v > C.COMBO_MAX) throw Error("Coil: invalid combo");
      return cp(s, { combo: v });
    },
    setComboWindow: (s, v) => {
      if (!Number.isFinite(v) || v < 0 || v > C.COMBO_WINDOW)
        throw Error("Coil: invalid combo window");
      return cp(s, { comboWindow: v });
    },
    setSnake: (s, v) => {
      if (!v.length) throw Error("Coil: invalid snake chain");
      const seen = new Set<string>();
      v.forEach((x, i) => {
        if (
          !interior(x) ||
          s.obstacles.some((o) => eq(o, x)) ||
          seen.has(id(x)) ||
          (i &&
            Math.abs(x.col - v[i - 1]!.col) +
              Math.abs(x.row - v[i - 1]!.row) !==
              1)
        )
          throw Error("Coil: invalid snake chain");
        seen.add(id(x));
      });
      return cp(s, { snake: cells(v) });
    },
    setDirection: (s, v) => {
      if (!C.DIRECTIONS.includes(v)) throw Error("Coil: invalid direction");
      return cp(s, { dir: v });
    },
    clearTurns: (s) => cp(s, { turns: [] }),
    setSnakeSteering: (s, v) => {
      if (typeof v !== "boolean") throw Error("Coil: invalid steering");
      return cp(s, { steering: v, turns: v ? [...s.turns] : [] });
    },
    setSnakeTravel: (s, v) => {
      if (typeof v !== "boolean") throw Error("Coil: invalid travel");
      return cp(s, { travel: v });
    },
    setPellet: (s, col, row) => {
      whole(col, "pellet col");
      whole(row, "pellet row");
      const x = { col, row };
      if (
        !interior(x) ||
        s.snake.some((y) => eq(x, y)) ||
        s.obstacles.some((y) => eq(x, y))
      )
        throw Error("Coil: invalid pellet cell");
      return cp(s, { pellet: x });
    },
    clearPellet: (s) => cp(s, { pellet: null }),
    setPelletRespawn: (s, v) => {
      if (typeof v !== "boolean") throw Error("Coil: invalid pellet respawn");
      return cp(s, { pelletRespawn: v });
    },
    setNextPellet: (s, col, row) => {
      whole(col, "next pellet col");
      whole(row, "next pellet row");
      if (col >= C.GRID_COLS || row >= C.GRID_ROWS)
        throw Error("Coil: invalid next pellet cell");
      return cp(s, { nextPellet: { col, row } });
    },
    drawPelletCell: (s) => {
      const v = valid(s);
      return v.length ? v[Math.floor(Math.random() * v.length)]! : null;
    },
  };
}

function round(s: R, a: UpdateApi): CoilState {
  const b = cp(s, {
    screen: "playing",
    menuIndex: 0,
    score: 0,
    combo: 1,
    comboWindow: 0,
    dir: C.START_DIR,
    turns: [],
    snake: cells(C.START_CELLS),
    obstacles: cells(C.OBSTACLE_CELLS),
    accumulator: 0,
    biteTime: 0,
    presses: [],
  });
  a.audio.loop(C.CUES.music);
  return { ...b, ...spawn(b) };
}
function title(s: R, a: UpdateApi) {
  a.audio.stop(C.CUES.music);
  return cp(s, {
    screen: "title",
    menuIndex: s.titleIndex,
    accumulator: 0,
    presses: [],
  });
}
function accept(s: R, a: UpdateApi): CoilState {
  if (s.screen === "title") {
    const x = cp(s, { titleIndex: s.menuIndex });
    return s.menuIndex ? cp(x, { screen: "howto", menuIndex: 0 }) : round(x, a);
  }
  if (s.screen === "howto") return title(s, a);
  if (s.screen === "paused") {
    if (!s.menuIndex) return cp(s, { screen: "playing", menuIndex: 0 });
    return s.menuIndex === 1 ? round(s, a) : title(s, a);
  }
  if (s.screen === "gameover" || s.screen === "cleared")
    return s.menuIndex ? title(s, a) : round(s, a);
  return cp(s);
}
function drain(s: CoilState) {
  if (s.comboWindow <= 0) return s;
  const w = Math.max(0, s.comboWindow - C.TICK_SECONDS);
  return cp(s, { comboWindow: w, combo: w ? s.combo : 1 });
}
function tick(s: CoilState, a: UpdateApi): [CoilState, boolean] {
  let dir = s.dir;
  const turns = [...s.turns];
  if (s.steering && turns.length) {
    const q = turns.shift()!;
    const h = dir === "left" || dir === "right";
    if (h !== (q === "left" || q === "right")) dir = q;
  }
  let n = cp(s, { dir, turns, ticks: s.ticks + 1 });
  if (!s.travel) return [drain(n), false];
  const d = vectors[dir],
    head = s.snake[0]!,
    nh = { col: head.col + d.col, row: head.row + d.row },
    ate = !!s.pellet && eq(nh, s.pellet),
    solid = ate ? s.snake : s.snake.slice(0, -1);
  if (
    !interior(nh) ||
    s.obstacles.some((x) => eq(x, nh)) ||
    solid.some((x) => eq(x, nh))
  ) {
    a.audio.play(C.CUES.death);
    a.audio.stop(C.CUES.music);
    return [
      cp(n, { screen: "gameover", menuIndex: 0, accumulator: 0, turns: [] }),
      true,
    ];
  }
  n = cp(n, { snake: [nh, ...cells(ate ? s.snake : s.snake.slice(0, -1))] });
  if (ate) {
    const combo = s.comboWindow > 0 ? Math.min(C.COMBO_MAX, s.combo + 1) : 1,
      score = s.score + C.PELLET_POINTS * combo;
    a.audio.play(C.CUES.eat);
    if (combo > s.combo) a.audio.play(C.CUES.comboUp);
    n = cp(n, {
      score,
      best: Math.max(s.best, score),
      combo,
      comboWindow: C.COMBO_WINDOW,
      biteTime: C.BITE_SECONDS,
      pellet: null,
    });
    if (s.pelletRespawn) {
      const p = spawn(n);
      n = cp(n, p);
      if (!p.pellet) {
        a.audio.stop(C.CUES.music);
        return [
          cp(n, { screen: "cleared", menuIndex: 0, accumulator: 0 }),
          true,
        ];
      }
    }
  }
  return [drain(n), false];
}

function pointer(s: CoilState, a: UpdateApi): CoilState {
  if (s.screen === "playing") return s;
  let n = s,
    p = [...s.presses];
  for (const e of a.input.pointerSamples()) {
    const i = items(n.screen).findIndex((_, j) => {
      const r = rect(n.screen, j)!;
      return e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h;
    });
    if (i >= 0 && e.type !== "up") n = cp(n, { menuIndex: i });
    if (e.type === "down") {
      p = p.filter((x) => x.id !== e.id);
      if (i >= 0) p.push({ id: e.id, index: i });
    }
    if (e.type === "up") {
      const q = p.find((x) => x.id === e.id);
      p = p.filter((x) => x.id !== e.id);
      if (q && q.index === i)
        n = accept(cp(n, { menuIndex: i, presses: p }), a);
    }
  }
  return cp(n, { presses: p });
}

const angle = (d: Direction) =>
  ({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 })[d];
const between = (a: DeepReadonly<Cell>, b: DeepReadonly<Cell>): Direction =>
  b.col > a.col
    ? "right"
    : b.col < a.col
      ? "left"
      : b.row > a.row
        ? "down"
        : "up";
function sprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  c: DeepReadonly<Cell>,
  r: number,
) {
  ctx.save();
  ctx.translate(
    C.BOARD_X + (c.col + 0.5) * C.CELL,
    C.BOARD_Y + (c.row + 0.5) * C.CELL,
  );
  ctx.rotate(r);
  ctx.drawImage(img, -16, -16, 32, 32);
  ctx.restore();
}
function snake(s: R, ctx: CanvasRenderingContext2D) {
  ctx.imageSmoothingEnabled = false;
  const f =
    s.biteTime <= 0
      ? 0
      : Math.min(3, 1 + Math.floor((1 - s.biteTime / C.BITE_SECONDS) * 3));
  sprite(ctx, s.sprites.heads[f]!, s.snake[0]!, angle(s.dir));
  for (let i = 1; i < s.snake.length - 1; i++) {
    const c = s.snake[i]!,
      a = between(c, s.snake[i - 1]!),
      b = between(c, s.snake[i + 1]!);
    if ((a === "left" && b === "right") || (a === "right" && b === "left"))
      sprite(ctx, s.sprites.body, c, 0);
    else if ((a === "up" && b === "down") || (a === "down" && b === "up"))
      sprite(ctx, s.sprites.body, c, Math.PI / 2);
    else {
      const q = new Set([a, b]);
      sprite(
        ctx,
        s.sprites.corner,
        c,
        q.has("right") && q.has("down")
          ? 0
          : q.has("down") && q.has("left")
            ? Math.PI / 2
            : q.has("left") && q.has("up")
              ? Math.PI
              : -Math.PI / 2,
      );
    }
  }
  if (s.snake.length > 1) {
    const t = s.snake[s.snake.length - 1]!;
    sprite(
      ctx,
      s.sprites.tail,
      t,
      angle(between(t, s.snake[s.snake.length - 2]!)),
    );
  }
}
function txt(
  ctx: CanvasRenderingContext2D,
  v: string,
  x: number,
  y: number,
  size: number,
  color = "#e8fbff",
) {
  ctx.font = `800 ${size}px ui-monospace,Menlo,monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#071020";
  ctx.fillText(v, x + 3, y + 4);
  ctx.fillStyle = color;
  ctx.fillText(v, x, y);
}
function board(s: R, ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#080d20";
  ctx.fillRect(
    C.BOARD_X,
    C.BOARD_Y,
    C.GRID_COLS * C.CELL,
    C.GRID_ROWS * C.CELL,
  );
  ctx.strokeStyle = "#12234a";
  ctx.lineWidth = 1;
  for (let x = 1; x < C.GRID_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(C.BOARD_X + x * 32 + 0.5, C.BOARD_Y + 32);
    ctx.lineTo(C.BOARD_X + x * 32 + 0.5, C.BOARD_Y + 544);
    ctx.stroke();
  }
  for (let y = 1; y < C.GRID_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(C.BOARD_X + 32, C.BOARD_Y + y * 32 + 0.5);
    ctx.lineTo(C.BOARD_X + 928, C.BOARD_Y + y * 32 + 0.5);
    ctx.stroke();
  }
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++)
      if (!x || !y || x === C.GRID_COLS - 1 || y === C.GRID_ROWS - 1) {
        ctx.fillStyle = (x + y) % 2 ? "#182954" : "#142348";
        ctx.fillRect(C.BOARD_X + x * 32, C.BOARD_Y + y * 32, 32, 32);
        ctx.strokeStyle = "#3656a3";
        ctx.strokeRect(C.BOARD_X + x * 32 + 3, C.BOARD_Y + y * 32 + 3, 26, 26);
      }
  ctx.strokeStyle = "#6f52ff";
  ctx.lineWidth = 3;
  ctx.strokeRect(C.BOARD_X + 1.5, C.BOARD_Y + 1.5, 957, 573);
  if (s.pellet) {
    const x = C.BOARD_X + (s.pellet.col + 0.5) * 32,
      y = C.BOARD_Y + (s.pellet.row + 0.5) * 32;
    ctx.shadowColor = "#ff3bac";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ff3bac";
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  snake(s, ctx);
}
function hud(s: R, ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#080b19";
  ctx.fillRect(0, 0, C.STAGE_W, C.BOARD_Y);
  txt(ctx, C.SCORE_LABEL, 220, 30, 16, "#7188b8");
  txt(ctx, String(s.score).padStart(5, "0"), 220, 68, 32, "#25f4ee");
  txt(ctx, C.BEST_LABEL, 410, 30, 16, "#7188b8");
  txt(ctx, String(s.best).padStart(5, "0"), 410, 68, 32);
  txt(ctx, C.MODE_LABEL, 895, 52, 22, "#9c7cff");
  txt(
    ctx,
    s.muted ? "SOUND OFF" : "SOUND ON",
    1080,
    52,
    16,
    s.muted ? "#ff668f" : "#7188b8",
  );
  if (s.combo > 1) {
    txt(ctx, `x${s.combo}`, 650, 45, 36, "#ff3bac");
    ctx.fillStyle = "#24213e";
    ctx.fillRect(570, 82, 160, 8);
    ctx.fillStyle = "#ff3bac";
    ctx.fillRect(570, 82, (160 * s.comboWindow) / C.COMBO_WINDOW, 8);
  }
}
function menu(s: R, ctx: CanvasRenderingContext2D) {
  items(s.screen).forEach((v, i) => {
    const r = rect(s.screen, i)!,
      on = i === s.menuIndex;
    ctx.fillStyle = on ? "#6f52ff" : "#101a35";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = on ? "#25f4ee" : "#263965";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    txt(
      ctx,
      (on ? "› " : "") + v,
      C.STAGE_CX,
      r.y + 29,
      23,
      on ? "#fff" : "#9fb4d9",
    );
  });
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "rgba(5,7,19,.93)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#6f52ff";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

export const game: Game<CoilState, CoilDebugApi> = {
  async initialize(api: InitApi<CoilState>) {
    C.ACTIONS.forEach((x) =>
      api.input.register(x, { keys: [...C.BINDINGS[x]] }),
    );
    const [heads, body, corner, tail] = await Promise.all([
      Promise.all(C.SPRITE_PATHS.head.map((x) => api.assets.loadImage(x))),
      api.assets.loadImage(C.SPRITE_PATHS.body),
      api.assets.loadImage(C.SPRITE_PATHS.corner),
      api.assets.loadImage(C.SPRITE_PATHS.tail),
    ]);
    await Promise.all(
      Object.entries(C.CUE_PATHS).map(([x, p]) => api.audio.load(x, p)),
    );
    const sprites = { heads, body, corner, tail },
      s = initial(sprites);
    for (const [n, f] of [
      ["screen", (x: R) => x.screen],
      ["score", (x: R) => x.score],
      ["best", (x: R) => x.best],
      ["combo", (x: R) => x.combo],
      ["combo window", (x: R) => x.comboWindow],
      ["direction", (x: R) => x.dir],
      ["length", (x: R) => x.snake.length],
      ["head", (x: R) => `${x.snake[0]!.col},${x.snake[0]!.row}`],
      [
        "pellet",
        (x: R) => (x.pellet ? `${x.pellet.col},${x.pellet.row}` : "none"),
      ],
    ] as const)
      api.diagnostics.register(n, f);
    return [s, debug(sprites)];
  },
  update(s: R, a: UpdateApi, dt: number) {
    let n = cp(s, { muted: a.audio.muted() });
    if (a.input.pressed("mute")) {
      a.audio.setMuted(!a.audio.muted());
      n = cp(n, { muted: a.audio.muted() });
    }
    if (n.screen === "playing") {
      if (a.input.pressed("back") || a.input.pressed("pause"))
        n = cp(n, { screen: "paused", menuIndex: 0 });
      else if (n.steering)
        for (const d of C.DIRECTIONS)
          if (a.input.pressed(d) && n.turns.length < C.TURN_QUEUE_MAX)
            n = cp(n, { turns: [...n.turns, d] });
    } else {
      const z = items(n.screen).length;
      if (a.input.pressed("up"))
        n = cp(n, { menuIndex: (n.menuIndex - 1 + z) % z });
      if (a.input.pressed("down"))
        n = cp(n, { menuIndex: (n.menuIndex + 1) % z });
      if (a.input.pressed("confirm")) n = accept(n, a);
      else if (
        n.screen === "paused" &&
        (a.input.pressed("back") || a.input.pressed("pause"))
      )
        n = cp(n, { screen: "playing", menuIndex: 0 });
      else if (
        a.input.pressed("back") &&
        (n.screen === "howto" ||
          n.screen === "gameover" ||
          n.screen === "cleared")
      )
        n = title(n, a);
    }
    n = pointer(n, a);
    if (n.screen !== "playing") return cp(n, { muted: a.audio.muted() });
    n = cp(n, {
      simTime: n.simTime + dt,
      accumulator: n.accumulator + dt,
      biteTime: Math.max(0, n.biteTime - dt),
    });
    while (n.accumulator + 1e-10 >= C.TICK_SECONDS) {
      n = cp(n, { accumulator: n.accumulator - C.TICK_SECONDS });
      const [x, end] = tick(n, a);
      n = x;
      if (end) break;
    }
    return cp(n, { best: Math.max(n.best, n.score), muted: a.audio.muted() });
  },
  render(s: R, a: RenderApi) {
    const ctx = a.ctx;
    ctx.imageSmoothingEnabled = false;
    if (s.screen === "title") {
      board(s, ctx);
      ctx.fillStyle = "rgba(5,7,19,.8)";
      ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
      txt(ctx, C.TITLE_TEXT, C.STAGE_CX, 185, 112, "#25f4ee");
      txt(ctx, C.TAGLINE_TEXT, C.STAGE_CX, 265, 24, "#9c7cff");
      txt(ctx, C.BEST_LABEL, C.STAGE_CX, 330, 16, "#7188b8");
      txt(ctx, String(s.best).padStart(5, "0"), C.STAGE_CX, 368, 32);
      menu(s, ctx);
      return;
    }
    hud(s, ctx);
    board(s, ctx);
    if (s.screen === "playing") return;
    ctx.fillStyle = "rgba(2,4,13,.68)";
    ctx.fillRect(0, C.BOARD_Y, C.STAGE_W, C.STAGE_H - C.BOARD_Y);
    if (s.screen === "howto") {
      panel(ctx, 275, 135, 730, 455);
      txt(ctx, "HOW TO PLAY", C.STAGE_CX, 180, 42, "#25f4ee");
      [
        "THE COIL NEVER STOPS — TURN AHEAD OF THE NEXT TICK.",
        "TURN 90° ONLY. YOU CAN'T DOUBLE BACK.",
        "EAT PULSES TO GROW. WALLS AND YOUR BODY ARE FATAL.",
        "CHAIN QUICK EATS TO RAISE x2 … x5.",
        "LET THE COMBO BAR EMPTY AND IT FALLS BACK TO x1.",
        "MOVE: ARROWS / WASD     PAUSE: P / ESC",
        "CONFIRM: ENTER / SPACE   MUTE: M",
      ].forEach((v, i) =>
        txt(
          ctx,
          v,
          C.STAGE_CX,
          245 + i * 43,
          i < 5 ? 18 : 16,
          i < 5 ? "#dce9ff" : "#9c7cff",
        ),
      );
      menu(s, ctx);
      return;
    }
    panel(ctx, 430, 205, 420, s.screen === "paused" ? 400 : 420);
    if (s.screen === "paused")
      txt(ctx, "PAUSED", C.STAGE_CX, 275, 48, "#25f4ee");
    else {
      txt(
        ctx,
        s.screen === "gameover" ? C.GAMEOVER_TEXT : C.CLEARED_TEXT,
        C.STAGE_CX,
        270,
        44,
        s.screen === "gameover" ? "#ff668f" : "#25f4ee",
      );
      txt(ctx, C.SCORE_LABEL, 545, 350, 15, "#7188b8");
      txt(ctx, String(s.score), 545, 386, 30);
      txt(ctx, C.BEST_LABEL, 735, 350, 15, "#7188b8");
      txt(ctx, String(s.best), 735, 386, 30);
    }
    menu(s, ctx);
  },
};

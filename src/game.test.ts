import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import { COMBO_WINDOW, TICK_SECONDS } from "./constants";
import { game, type CoilState } from "./game";

async function setup() {
  const registered = new Map<string, (s: Readonly<CoilState>) => unknown>();
  const image = createCanvas(32, 32) as unknown as ImageBitmap;
  const api = {
    input: { register: vi.fn(), layout: vi.fn() },
    assets: { loadImage: vi.fn(async () => image) },
    audio: { load: vi.fn(async () => undefined) },
    diagnostics: {
      register: (n: string, f: (s: Readonly<CoilState>) => unknown) =>
        registered.set(n, f),
    },
  } as unknown as InitApi<CoilState>;
  const [state, debug] = await game.initialize(api);
  return { state, debug, registered };
}

function updater() {
  const pressed = new Set<string>();
  const audio = { muted: false, played: [] as string[], looped: false };
  const api = {
    input: {
      pressed: (name: string) => pressed.delete(name),
      pointerSamples: () => [],
    },
    audio: {
      muted: () => audio.muted,
      setMuted: (v: boolean) => {
        audio.muted = v;
      },
      play: (v: string) => audio.played.push(v),
      loop: () => {
        audio.looped = true;
      },
      stop: () => {
        audio.looped = false;
      },
      looping: () => audio.looped,
    },
  } as unknown as UpdateApi;
  return { api, press: (v: string) => pressed.add(v), audio };
}

describe("Coil simulation", () => {
  it("initializes its assets, debug state, and diagnostics", async () => {
    const { state, debug, registered } = await setup();
    expect(debug.snapshot(state)).toMatchObject({
      screen: "title",
      score: 0,
      dir: "right",
      pellet: null,
      version: 1,
    });
    expect([...registered.keys()]).toContain("pellet");
  });

  it("starts, advances on fixed ticks, eats, grows, and scores", async () => {
    const { state, debug } = await setup();
    const u = updater();
    u.press("confirm");
    let s = game.update(state, u.api, 0);
    s = debug.setPelletRespawn(s, false);
    s = debug.setPellet(s, 16, 8);
    s = game.update(s, u.api, TICK_SECONDS);
    expect(debug.snapshot(s)).toMatchObject({
      score: 10,
      combo: 1,
      comboWindow: COMBO_WINDOW - TICK_SECONDS,
      ticks: 1,
    });
    expect(s.snake).toHaveLength(4);
    expect(u.audio.played).toContain("eat");
  });

  it("buffers perpendicular turns and detects walls", async () => {
    const { state, debug } = await setup();
    const u = updater();
    let s = debug.setScreen(state, "playing");
    s = debug.setSnake(s, [{ col: 1, row: 1 }]);
    s = debug.setDirection(s, "left");
    s = game.update(s, u.api, TICK_SECONDS);
    expect(s.screen).toBe("gameover");
    expect(u.audio.played).toContain("death");
  });

  it("validates debug poses without mutating the source", async () => {
    const { state, debug } = await setup();
    const next = debug.setScore(state, 120);
    expect(state.score).toBe(0);
    expect(next.score).toBe(120);
    expect(() => debug.setCombo(state, 99)).toThrow();
    expect(() => debug.setSnake(state, [{ col: 0, row: 0 }])).toThrow();
    expect(debug.menuItemRect(state, 0)).not.toBeNull();
  });

  it("renders title and play screens", async () => {
    const { state, debug } = await setup();
    const canvas = createCanvas(1280, 720);
    const api = { ctx: canvas.getContext("2d") } as unknown as Parameters<
      typeof game.render
    >[1];
    game.render(state, api);
    game.render(debug.setScreen(state, "playing"), api);
    expect(canvas.toBuffer("image/png").length).toBeGreaterThan(1000);
  });
});

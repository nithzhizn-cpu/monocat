"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Phase = "menu" | "playing" | "paused" | "result";
type ItemKind = "coin" | "cashback" | "shield" | "turbo";
type HazardKind = "phishing" | "scammer" | "commission";
type SkinId = "black" | "white" | "platinum" | "lemon";

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Item = Box & {
  kind: ItemKind;
  phase: number;
};

type Hazard = Box & {
  kind: HazardKind;
  hit: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type Player = Box & {
  vy: number;
  jumps: number;
  invulnerable: number;
};

type Runtime = {
  width: number;
  height: number;
  ground: number;
  elapsed: number;
  timeLeft: number;
  distance: number;
  speed: number;
  score: number;
  coins: number;
  cashback: number;
  combo: number;
  maxCombo: number;
  hearts: number;
  hits: number;
  shield: number;
  turbo: number;
  itemTimer: number;
  hazardTimer: number;
  uiTimer: number;
  milestone: number;
  player: Player;
  items: Item[];
  hazards: Hazard[];
  particles: Particle[];
};

type RunSummary = {
  delivered: boolean;
  score: number;
  coins: number;
  cashback: number;
  maxCombo: number;
  hits: number;
  unlocked: string[];
};

type Stats = {
  best: number;
  runs: number;
  deliveries: number;
  totalCoins: number;
  achievements: string[];
  unlockedSkins: SkinId[];
  history: number[];
};

const RUN_SECONDS = 75;
const STORAGE_KEY = "mono-cat-transfer-concept-v1";

const DEFAULT_STATS: Stats = {
  best: 0,
  runs: 0,
  deliveries: 0,
  totalCoins: 0,
  achievements: [],
  unlockedSkins: ["black"],
  history: [],
};

const SKINS: Array<{
  id: SkinId;
  name: string;
  note: string;
  color: string;
  accent: string;
}> = [
  {
    id: "black",
    name: "Чорний кіт",
    note: "Базовий",
    color: "#111111",
    accent: "#ffffff",
  },
  {
    id: "white",
    name: "Білий кіт",
    note: "1 доставка",
    color: "#ffffff",
    accent: "#111111",
  },
  {
    id: "platinum",
    name: "Platinum",
    note: "8 000 очок",
    color: "#b9c0c8",
    accent: "#111111",
  },
  {
    id: "lemon",
    name: "Лимонний",
    note: "Секретний",
    color: "#dfff3f",
    accent: "#111111",
  },
];

const ACHIEVEMENTS = [
  { id: "first", icon: "✓", name: "Перший переказ" },
  { id: "clean", icon: "◇", name: "Без жодного фішингу" },
  { id: "cashback", icon: "%", name: "Мисливець за кешбеком" },
  { id: "combo", icon: "×", name: "Комбо x5" },
];

const DEMO_LEADERS = [
  { name: "кіт_у_пальті", score: 12840 },
  { name: "без_комісій", score: 10120 },
  { name: "пан_кешбек", score: 8760 },
  { name: "мурчик", score: 6430 },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const intersects = (a: Box, b: Box) =>
  a.x + 5 < b.x + b.width &&
  a.x + a.width - 5 > b.x &&
  a.y + 4 < b.y + b.height &&
  a.y + a.height - 2 > b.y;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function createRuntime(width: number, height: number): Runtime {
  const ground = height * (height < 560 ? 0.74 : 0.78);
  const playerWidth = height < 560 ? 52 : 60;
  const playerHeight = height < 560 ? 40 : 46;
  return {
    width,
    height,
    ground,
    elapsed: 0,
    timeLeft: RUN_SECONDS,
    distance: 0,
    speed: 340,
    score: 0,
    coins: 0,
    cashback: 0,
    combo: 1,
    maxCombo: 1,
    hearts: 3,
    hits: 0,
    shield: 0,
    turbo: 0,
    itemTimer: 0.55,
    hazardTimer: 1.15,
    uiTimer: 0,
    milestone: 0,
    player: {
      x: Math.max(72, width * 0.18),
      y: ground - playerHeight,
      width: playerWidth,
      height: playerHeight,
      vy: 0,
      jumps: 2,
      invulnerable: 0,
    },
    items: [],
    hazards: [],
    particles: [],
  };
}

function loadStats(): Stats {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return DEFAULT_STATS;
    return {
      ...DEFAULT_STATS,
      ...saved,
      achievements: Array.isArray(saved.achievements)
        ? saved.achievements
        : [],
      unlockedSkins: Array.isArray(saved.unlockedSkins)
        ? saved.unlockedSkins
        : ["black"],
      history: Array.isArray(saved.history) ? saved.history : [],
    };
  } catch {
    return DEFAULT_STATS;
  }
}

function saveStats(stats: Stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

export default function MonoCatGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const phaseRef = useRef<Phase>("menu");
  const selectedSkinRef = useRef<SkinId>("black");
  const lastFrameRef = useRef(0);
  const animationRef = useRef(0);
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const finishRef = useRef<(delivered: boolean) => void>(() => {});

  const [phase, setPhase] = useState<Phase>("menu");
  const [sound, setSound] = useState(true);
  const [selectedSkin, setSelectedSkin] = useState<SkinId>("black");
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [toast, setToast] = useState("Переказ готовий до відправлення");
  const [hud, setHud] = useState({
    score: 0,
    hearts: 3,
    time: RUN_SECONDS,
    coins: 0,
    combo: 1,
    progress: 0,
    shield: 0,
    turbo: 0,
  });

  useEffect(() => {
    setStats(loadStats());
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    selectedSkinRef.current = selectedSkin;
  }, [selectedSkin]);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const tone = useCallback(
    (frequency: number, duration = 0.07, volume = 0.035) => {
      if (!soundRef.current || typeof window === "undefined") return;
      try {
        const AudioCtor =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioCtor) return;
        const audio = audioRef.current || new AudioCtor();
        audioRef.current = audio;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          audio.currentTime + duration,
        );
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + duration);
      } catch {
        // Sound is a progressive enhancement.
      }
    },
    [],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const burst = useCallback(
    (x: number, y: number, color: string, amount = 12) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      for (let index = 0; index < amount; index += 1) {
        const life = 0.35 + Math.random() * 0.45;
        runtime.particles.push({
          x,
          y,
          vx: -40 + Math.random() * 160,
          vy: -120 + Math.random() * 190,
          life,
          maxLife: life,
          color,
          size: 2 + Math.random() * 5,
        });
      }
    },
    [],
  );

  const jump = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    const runtime = runtimeRef.current;
    if (!runtime || runtime.player.jumps <= 0) return;
    runtime.player.vy = -690;
    runtime.player.jumps -= 1;
    burst(
      runtime.player.x + runtime.player.width * 0.35,
      runtime.player.y + runtime.player.height,
      "#111111",
      7,
    );
    tone(runtime.player.jumps === 1 ? 430 : 560, 0.08, 0.028);
  }, [burst, tone]);

  const startGame = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const box = frame.getBoundingClientRect();
    const runtime = createRuntime(
      Math.max(320, box.width),
      Math.max(430, box.height),
    );
    runtimeRef.current = runtime;
    lastFrameRef.current = performance.now();
    setSummary(null);
    setToast("Кіт забрав переказ. Достав його до Банки!");
    setHud({
      score: 0,
      hearts: 3,
      time: RUN_SECONDS,
      coins: 0,
      combo: 1,
      progress: 0,
      shield: 0,
      turbo: 0,
    });
    setPhase("playing");
    phaseRef.current = "playing";
    tone(330, 0.12, 0.04);
  }, [tone]);

  const finishRun = useCallback(
    (delivered: boolean) => {
      const runtime = runtimeRef.current;
      if (!runtime || phaseRef.current === "result") return;
      const score = Math.max(0, Math.floor(runtime.score));
      const newAchievements: string[] = [];
      if (delivered) newAchievements.push("first");
      if (delivered && runtime.hits === 0) newAchievements.push("clean");
      if (runtime.cashback >= 7) newAchievements.push("cashback");
      if (runtime.maxCombo >= 5) newAchievements.push("combo");

      const current = loadStats();
      const achievements = Array.from(
        new Set([...current.achievements, ...newAchievements]),
      );
      const unlockedSkins = new Set<SkinId>(current.unlockedSkins);
      if (delivered || current.deliveries >= 1) unlockedSkins.add("white");
      if (score >= 8000 || current.best >= 8000)
        unlockedSkins.add("platinum");
      if (runtime.cashback >= 10) unlockedSkins.add("lemon");

      const nextStats: Stats = {
        best: Math.max(current.best, score),
        runs: current.runs + 1,
        deliveries: current.deliveries + (delivered ? 1 : 0),
        totalCoins: current.totalCoins + runtime.coins,
        achievements,
        unlockedSkins: Array.from(unlockedSkins),
        history: [score, ...current.history].slice(0, 8),
      };
      saveStats(nextStats);
      setStats(nextStats);
      setSummary({
        delivered,
        score,
        coins: runtime.coins,
        cashback: runtime.cashback,
        maxCombo: runtime.maxCombo,
        hits: runtime.hits,
        unlocked: newAchievements.filter(
          (id) => !current.achievements.includes(id),
        ),
      });
      setPhase("result");
      phaseRef.current = "result";
      if (delivered) {
        tone(520, 0.12, 0.04);
        window.setTimeout(() => tone(660, 0.14, 0.04), 100);
        window.setTimeout(() => tone(820, 0.18, 0.04), 220);
      } else {
        tone(150, 0.25, 0.045);
      }
    },
    [tone],
  );

  useEffect(() => {
    finishRef.current = finishRun;
  }, [finishRun]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === "playing") {
      setPhase("paused");
      phaseRef.current = "paused";
    } else if (phaseRef.current === "paused") {
      lastFrameRef.current = performance.now();
      setPhase("playing");
      phaseRef.current = "playing";
    }
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const rect = frame.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const runtime = runtimeRef.current;
    if (runtime) {
      const oldGround = runtime.ground;
      runtime.width = rect.width;
      runtime.height = rect.height;
      runtime.ground = rect.height * (rect.height < 560 ? 0.74 : 0.78);
      runtime.player.x = Math.min(
        runtime.player.x,
        rect.width - runtime.player.width - 24,
      );
      if (runtime.player.y + runtime.player.height >= oldGround - 3) {
        runtime.player.y = runtime.ground - runtime.player.height;
      }
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (frameRef.current) observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        jump();
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        togglePause();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jump, togglePause]);

  const spawnItem = useCallback((runtime: Runtime) => {
    const roll = Math.random();
    const kind: ItemKind =
      roll < 0.58
        ? "coin"
        : roll < 0.79
          ? "cashback"
          : roll < 0.9
            ? "shield"
            : "turbo";
    const size = kind === "cashback" ? 38 : 32;
    runtime.items.push({
      kind,
      x: runtime.width + 36,
      y:
        runtime.ground -
        72 -
        Math.random() * Math.min(190, runtime.height * 0.3),
      width: size,
      height: size,
      phase: Math.random() * Math.PI * 2,
    });
  }, []);

  const spawnHazard = useCallback((runtime: Runtime) => {
    const roll = Math.random();
    const kind: HazardKind =
      roll < 0.34 ? "phishing" : roll < 0.68 ? "scammer" : "commission";
    const config = {
      phishing: { width: 92, height: 42, air: true },
      scammer: { width: 54, height: 72, air: false },
      commission: { width: 76, height: 42, air: false },
    }[kind];
    runtime.hazards.push({
      kind,
      x: runtime.width + 54,
      y: config.air
        ? runtime.ground - 112 - Math.random() * 72
        : runtime.ground - config.height,
      width: config.width,
      height: config.height,
      hit: false,
    });
  }, []);

  const updateRuntime = useCallback(
    (runtime: Runtime, delta: number) => {
      runtime.elapsed += delta;
      runtime.timeLeft = Math.max(0, RUN_SECONDS - runtime.elapsed);
      runtime.shield = Math.max(0, runtime.shield - delta);
      runtime.turbo = Math.max(0, runtime.turbo - delta);
      runtime.player.invulnerable = Math.max(
        0,
        runtime.player.invulnerable - delta,
      );
      runtime.speed =
        335 +
        Math.min(150, runtime.elapsed * 2.1) +
        (runtime.turbo > 0 ? 135 : 0);
      runtime.distance += runtime.speed * delta;
      runtime.score +=
        delta * (22 + runtime.speed * 0.035) * Math.max(1, runtime.combo);

      runtime.player.vy += 1850 * delta;
      runtime.player.y += runtime.player.vy * delta;
      if (
        runtime.player.y + runtime.player.height >=
        runtime.ground
      ) {
        runtime.player.y = runtime.ground - runtime.player.height;
        runtime.player.vy = 0;
        runtime.player.jumps = 2;
      }

      runtime.itemTimer -= delta;
      if (runtime.itemTimer <= 0) {
        spawnItem(runtime);
        runtime.itemTimer = 0.65 + Math.random() * 0.7;
      }
      runtime.hazardTimer -= delta;
      if (runtime.hazardTimer <= 0) {
        spawnHazard(runtime);
        runtime.hazardTimer =
          Math.max(0.72, 1.42 - runtime.elapsed * 0.006) +
          Math.random() * 0.48;
      }

      for (const item of runtime.items) {
        item.x -= runtime.speed * delta;
        item.phase += delta * 4.5;
      }
      for (const hazard of runtime.hazards) {
        hazard.x -= runtime.speed * delta;
      }

      const playerBox: Box = runtime.player;
      for (const item of runtime.items) {
        const floatY = item.y + Math.sin(item.phase) * 7;
        const itemBox = { ...item, y: floatY };
        const magnet =
          item.kind === "coin" && runtime.turbo > 0
            ? 72
            : 0;
        if (
          intersects(
            {
              ...playerBox,
              x: playerBox.x - magnet,
              y: playerBox.y - magnet,
              width: playerBox.width + magnet * 2,
              height: playerBox.height + magnet * 2,
            },
            itemBox,
          )
        ) {
          const collectedX = item.x + item.width / 2;
          const collectedY = floatY + item.height / 2;
          item.x = -200;
          if (item.kind === "coin") {
            runtime.coins += 1;
            runtime.score += 90 * runtime.combo;
            runtime.combo = clamp(runtime.combo + 0.2, 1, 6);
            runtime.maxCombo = Math.max(runtime.maxCombo, runtime.combo);
            tone(620 + runtime.combo * 32, 0.045, 0.022);
            burst(collectedX, collectedY, "#111111", 5);
          } else if (item.kind === "cashback") {
            runtime.cashback += 1;
            runtime.coins += 3;
            runtime.score += 260 * runtime.combo;
            runtime.combo = clamp(runtime.combo + 0.45, 1, 6);
            runtime.maxCombo = Math.max(runtime.maxCombo, runtime.combo);
            showToast("+ кешбек до переказу");
            tone(860, 0.07, 0.035);
            burst(collectedX, collectedY, "#dfff3f", 13);
          } else if (item.kind === "shield") {
            runtime.shield = 7;
            runtime.score += 120;
            showToast("Антифішинг активовано");
            tone(520, 0.12, 0.035);
            burst(collectedX, collectedY, "#111111", 14);
          } else {
            runtime.turbo = 5;
            runtime.score += 150;
            showToast("Кешбек-турбо!");
            tone(740, 0.11, 0.035);
            burst(collectedX, collectedY, "#dfff3f", 16);
          }
        }
      }

      for (const hazard of runtime.hazards) {
        if (
          !hazard.hit &&
          intersects(playerBox, hazard) &&
          runtime.player.invulnerable <= 0
        ) {
          hazard.hit = true;
          if (runtime.shield > 0) {
            runtime.shield = 0;
            showToast("Антифішинг заблокував загрозу");
            tone(290, 0.1, 0.03);
            burst(
              runtime.player.x + runtime.player.width,
              runtime.player.y,
              "#111111",
              18,
            );
          } else {
            runtime.hearts -= 1;
            runtime.hits += 1;
            runtime.combo = 1;
            runtime.player.invulnerable = 1.35;
            showToast(
              hazard.kind === "phishing"
                ? "Ой. Це було фішингове посилання"
                : hazard.kind === "scammer"
                  ? "Шахрай просив назвати код із SMS"
                  : "Комісія зʼїла частину переказу",
            );
            tone(145, 0.18, 0.05);
            burst(
              runtime.player.x + runtime.player.width,
              runtime.player.y + runtime.player.height / 2,
              "#ff4365",
              22,
            );
            if (runtime.hearts <= 0) {
              finishRef.current(false);
              return;
            }
          }
        }
      }

      runtime.items = runtime.items.filter((item) => item.x > -80);
      runtime.hazards = runtime.hazards.filter(
        (hazard) => hazard.x + hazard.width > -80,
      );

      for (const particle of runtime.particles) {
        particle.life -= delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += 220 * delta;
      }
      runtime.particles = runtime.particles.filter(
        (particle) => particle.life > 0,
      );

      const milestone = Math.floor(runtime.elapsed / 18);
      if (milestone > runtime.milestone) {
        runtime.milestone = milestone;
        const messages = [
          "",
          "Переказ уже на півдорозі. Кіт не панікує",
          "Банка бачить переказ на горизонті",
          "Фініш близько. Бережи останні сердечка",
        ];
        showToast(messages[milestone] || "Ще трохи — і гроші у Банці");
      }

      runtime.uiTimer -= delta;
      if (runtime.uiTimer <= 0) {
        runtime.uiTimer = 0.09;
        setHud({
          score: Math.floor(runtime.score),
          hearts: runtime.hearts,
          time: Math.ceil(runtime.timeLeft),
          coins: runtime.coins,
          combo: runtime.combo,
          progress: clamp(runtime.elapsed / RUN_SECONDS, 0, 1),
          shield: runtime.shield,
          turbo: runtime.turbo,
        });
      }

      if (runtime.timeLeft <= 0) {
        runtime.score += 1200 + runtime.hearts * 350;
        finishRef.current(true);
      }
    },
    [burst, showToast, spawnHazard, spawnItem, tone],
  );

  const draw = useCallback((ctx: CanvasRenderingContext2D, runtime: Runtime) => {
    const { width: width, height: height, ground } = runtime;
    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#f8f8f4");
    sky.addColorStop(0.62, "#e9e9e4");
    sky.addColorStop(1, "#d5d5ce");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const skylineOffset = -(runtime.distance * 0.1) % 130;
    ctx.fillStyle = "#deded8";
    for (let index = -1; index < width / 130 + 2; index += 1) {
      const x = index * 130 + skylineOffset;
      const buildingHeight = 76 + ((index * 47 + 190) % 115);
      ctx.fillRect(x, ground - buildingHeight, 82, buildingHeight);
      ctx.fillStyle = "#f3f3ef";
      for (let row = 0; row < 4; row += 1) {
        ctx.fillRect(x + 16, ground - buildingHeight + 18 + row * 25, 9, 8);
        ctx.fillRect(x + 44, ground - buildingHeight + 18 + row * 25, 9, 8);
      }
      ctx.fillStyle = "#deded8";
    }

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, ground, width, height - ground);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, ground + 7, width, 3);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ffffff";
    const lineOffset = -(runtime.distance * 0.75) % 118;
    for (let x = lineOffset; x < width + 120; x += 118) {
      ctx.fillRect(x, ground + 54, 58, 4);
    }
    ctx.globalAlpha = 1;

    const finishVisible = runtime.timeLeft < 7;
    if (finishVisible) {
      const jarX =
        width -
        125 +
        Math.max(0, runtime.timeLeft - 2) * 34;
      ctx.save();
      ctx.translate(jarX, ground - 132);
      ctx.shadowColor = "#dfff3f";
      ctx.shadowBlur = 26;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 4;
      roundedRect(ctx, 0, 0, 88, 116, 20);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111111";
      roundedRect(ctx, 17, 16, 54, 8, 4);
      ctx.fill();
      ctx.font = "900 13px var(--font-geist-sans), system-ui";
      ctx.textAlign = "center";
      ctx.fillText("БАНКА", 44, 52);
      ctx.font = "900 26px var(--font-geist-sans), system-ui";
      ctx.fillText("₴", 44, 83);
      ctx.restore();
    }

    for (const item of runtime.items) {
      const y = item.y + Math.sin(item.phase) * 7;
      ctx.save();
      ctx.translate(item.x + item.width / 2, y + item.height / 2);
      const color =
        item.kind === "cashback" || item.kind === "turbo"
          ? "#dfff3f"
          : "#ffffff";
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, item.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font =
        item.kind === "cashback"
          ? "900 11px system-ui"
          : "900 17px system-ui";
      ctx.fillText(
        item.kind === "coin"
          ? "₴"
          : item.kind === "cashback"
            ? "+₴"
            : item.kind === "shield"
              ? "✓"
              : "⚡",
        0,
        1,
      );
      ctx.restore();
    }

    for (const hazard of runtime.hazards) {
      ctx.save();
      if (hazard.hit) ctx.globalAlpha = 0.18;
      ctx.translate(hazard.x, hazard.y);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ff4365";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ff4365";
      ctx.shadowBlur = 11;
      roundedRect(ctx, 0, 0, hazard.width, hazard.height, 11);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (hazard.kind === "scammer") {
        ctx.beginPath();
        ctx.arc(hazard.width / 2, 20, 11, 0, Math.PI * 2);
        ctx.fill();
        roundedRect(ctx, 13, 34, hazard.width - 26, 30, 7);
        ctx.fill();
        ctx.fillStyle = "#ff4365";
        ctx.font = "900 8px system-ui";
        ctx.fillText("ШАХРАЙ", hazard.width / 2, hazard.height - 4);
      } else {
        ctx.font = "900 9px system-ui";
        ctx.fillText(
          hazard.kind === "phishing" ? "ФІШИНГ" : "КОМІСІЯ",
          hazard.width / 2,
          hazard.height / 2 - 6,
        );
        ctx.fillStyle = "#ff4365";
        ctx.font = "900 16px system-ui";
        ctx.fillText(
          hazard.kind === "phishing" ? "fake.link" : "− 4%",
          hazard.width / 2,
          hazard.height / 2 + 9,
        );
      }
      ctx.restore();
    }

    const skin =
      SKINS.find((item) => item.id === selectedSkinRef.current) || SKINS[0];
    const player = runtime.player;
    if (
      player.invulnerable <= 0 ||
      Math.floor(player.invulnerable * 12) % 2
    ) {
      ctx.save();
      ctx.translate(
        player.x + player.width / 2,
        player.y + player.height / 2,
      );
      ctx.rotate(clamp(player.vy / 1800, -0.16, 0.18));
      if (runtime.shield > 0) {
        ctx.strokeStyle = "#dfff3f";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#dfff3f";
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, player.width * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (runtime.turbo > 0) {
        ctx.strokeStyle = "#dfff3f";
        ctx.lineWidth = 5;
        for (let line = 0; line < 3; line += 1) {
          ctx.beginPath();
          ctx.moveTo(-player.width * 0.55, -10 + line * 10);
          ctx.lineTo(-player.width * (0.9 + line * 0.18), -10 + line * 10);
          ctx.stroke();
        }
      }
      ctx.shadowColor = "rgba(0,0,0,.22)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = skin.color;
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 3;
      roundedRect(
        ctx,
        -player.width * 0.43,
        -player.height * 0.35,
        player.width * 0.72,
        player.height * 0.7,
        13,
      );
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(-player.width * 0.34, -player.height * 0.29);
      ctx.lineTo(-player.width * 0.22, -player.height * 0.62);
      ctx.lineTo(-player.width * 0.05, -player.height * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(player.width * 0.02, -player.height * 0.3);
      ctx.lineTo(player.width * 0.14, -player.height * 0.6);
      ctx.lineTo(player.width * 0.26, -player.height * 0.24);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = skin.accent;
      ctx.beginPath();
      ctx.arc(-player.width * 0.19, -4, 2.3, 0, Math.PI * 2);
      ctx.arc(player.width * 0.03, -4, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = skin.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 4);
      ctx.lineTo(0, 7);
      ctx.lineTo(4, 4);
      ctx.stroke();
      ctx.strokeStyle = skin.color;
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(player.width * 0.24, 2);
      ctx.quadraticCurveTo(
        player.width * 0.64,
        -player.height * 0.14,
        player.width * 0.48,
        -player.height * 0.5,
      );
      ctx.stroke();
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 2;
      ctx.stroke();

      const stride = Math.sin(runtime.elapsed * 18) * 7;
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-12, player.height * 0.31);
      ctx.lineTo(-12 + stride, player.height * 0.52);
      ctx.moveTo(8, player.height * 0.31);
      ctx.lineTo(8 - stride, player.height * 0.52);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 2;
      roundedRect(
        ctx,
        player.width * 0.14,
        -player.height * 0.18,
        player.width * 0.38,
        player.height * 0.42,
        5,
      );
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111111";
      ctx.font = "900 13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("₴", player.width * 0.33, 1);
      ctx.restore();
    }

    for (const particle of runtime.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    const renderFrame = (now: number) => {
      const canvas = canvasRef.current;
      const frame = frameRef.current;
      if (!canvas || !frame) {
        animationRef.current = requestAnimationFrame(renderFrame);
        return;
      }
      const rect = frame.getBoundingClientRect();
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let runtime = runtimeRef.current;
      if (!runtime) {
        runtime = createRuntime(
          Math.max(320, rect.width),
          Math.max(430, rect.height),
        );
        runtime.elapsed = 11;
        runtime.timeLeft = RUN_SECONDS;
        runtimeRef.current = runtime;
      }

      const delta = clamp((now - lastFrameRef.current) / 1000 || 0.016, 0, 0.033);
      lastFrameRef.current = now;
      if (phaseRef.current === "playing") {
        updateRuntime(runtime, delta);
      } else if (phaseRef.current === "menu") {
        runtime.distance += delta * 42;
        runtime.elapsed += delta * 0.35;
      }
      draw(ctx, runtime);
      animationRef.current = requestAnimationFrame(renderFrame);
    };
    animationRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw, updateRuntime]);

  const leaderboard = useMemo(() => {
    const scores = [
      ...DEMO_LEADERS,
      ...(stats.best > 0 ? [{ name: "ти", score: stats.best }] : []),
    ].sort((a, b) => b.score - a.score);
    return scores.slice(0, 5);
  }, [stats.best]);

  const progressPercent = Math.round(hud.progress * 100);
  const activeSkin =
    SKINS.find((skin) => skin.id === selectedSkin) || SKINS[0];

  return (
    <main className="concept-shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="wordmark__cat" aria-hidden="true">
            <i />
            <i />
            <b>•ᴗ•</b>
          </span>
          <div>
            <strong>mono Кіт</strong>
            <span>доставка переказу</span>
          </div>
        </div>
        <div className="topbar__actions">
          <span className="concept-label">неофіційний концепт</span>
          <button
            className="icon-button"
            type="button"
            aria-label={sound ? "Вимкнути звук" : "Увімкнути звук"}
            onClick={() => setSound((value) => !value)}
          >
            {sound ? "♪" : "×"}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <aside className="side-panel side-panel--mission">
          <span className="eyebrow">місія</span>
          <h2>Донеси переказ до Банки</h2>
          <p>
            75 секунд, три життя і жодного коду з SMS незнайомцям.
          </p>
          <div className="mission-route" aria-label="Маршрут переказу">
            <span className="route-cat">●</span>
            <span className="route-line">
              <i style={{ width: `${progressPercent}%` }} />
            </span>
            <span className="route-jar">₴</span>
          </div>
          <dl className="mini-stats">
            <div>
              <dt>рекорд</dt>
              <dd>{stats.best.toLocaleString("uk-UA")}</dd>
            </div>
            <div>
              <dt>доставлено</dt>
              <dd>{stats.deliveries}</dd>
            </div>
          </dl>
          <div className="legend">
            <span>
              <i className="legend__coin">₴</i> монета
            </span>
            <span>
              <i className="legend__cashback">+₴</i> кешбек
            </span>
            <span>
              <i className="legend__danger">!</i> загроза
            </span>
          </div>
        </aside>

        <section className="game-card" aria-label="Гра mono Кіт">
          <div
            ref={frameRef}
            className="canvas-frame"
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              jump();
            }}
          >
            <canvas ref={canvasRef} aria-label="Ігрове поле" />

            <div
              className={`hud ${phase === "playing" || phase === "paused" ? "is-visible" : ""}`}
            >
              <div className="hud__score">
                <small>переказ</small>
                <strong>{hud.score.toLocaleString("uk-UA")}</strong>
              </div>
              <div className="hud__time">
                <strong>{hud.time}</strong>
                <small>сек</small>
              </div>
              <div className="hud__health" aria-label={`${hud.hearts} життя`}>
                {Array.from({ length: 3 }, (_, index) => (
                  <span
                    key={index}
                    className={index < hud.hearts ? "is-full" : ""}
                  >
                    ♥
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="pause-button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={togglePause}
                aria-label={phase === "paused" ? "Продовжити" : "Пауза"}
              >
                {phase === "paused" ? "▶" : "Ⅱ"}
              </button>
            </div>

            <div
              className={`progress-strip ${phase === "playing" || phase === "paused" ? "is-visible" : ""}`}
            >
              <i style={{ width: `${progressPercent}%` }} />
              <span style={{ left: `${clamp(progressPercent, 4, 94)}%` }}>●</span>
              <b>₴</b>
            </div>

            <div
              className={`combo-badge ${hud.combo >= 1.8 && phase === "playing" ? "is-visible" : ""}`}
            >
              x{hud.combo.toFixed(1)}
            </div>

            <div
              className={`effect-pills ${phase === "playing" && (hud.shield > 0 || hud.turbo > 0) ? "is-visible" : ""}`}
            >
              {hud.shield > 0 && (
                <span>✓ антифішинг {Math.ceil(hud.shield)}с</span>
              )}
              {hud.turbo > 0 && (
                <span>⚡ турбо {Math.ceil(hud.turbo)}с</span>
              )}
            </div>

            <div
              className={`game-toast ${phase === "playing" ? "is-visible" : ""}`}
              key={toast}
              role="status"
              aria-live="polite"
            >
              {toast}
            </div>

            {phase === "menu" && (
              <div className="overlay overlay--menu">
                <div className="menu-cat" aria-hidden="true">
                  <span style={{ background: activeSkin.color }}>
                    <i />
                    <i />
                    <b style={{ color: activeSkin.accent }}>• ᴗ •</b>
                    <em>₴</em>
                  </span>
                </div>
                <span className="eyebrow">місія № 001</span>
                <h1>
                  Достав переказ.
                  <br />
                  Не ведись на шахраїв.
                </h1>
                <p>
                  Стрибай через фішинг і комісії. Збирай кешбек. Банка
                  чекає.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={startGame}
                >
                  почати доставку <span>→</span>
                </button>
                <div className="control-note">
                  <span>торкнись екрана — стрибок</span>
                  <span>можна двічі</span>
                </div>
              </div>
            )}

            {phase === "paused" && (
              <div className="overlay overlay--compact">
                <span className="eyebrow">кіт перепочиває</span>
                <h2>Пауза</h2>
                <p>Переказ нікуди не втече. Напевно.</p>
                <button
                  type="button"
                  className="primary-button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={togglePause}
                >
                  продовжити <span>▶</span>
                </button>
              </div>
            )}

            {phase === "result" && summary && (
              <div
                className="overlay overlay--result"
                role="status"
                aria-live="polite"
              >
                <div
                  className={`result-icon ${summary.delivered ? "is-success" : ""}`}
                >
                  {summary.delivered ? "✓" : "×"}
                </div>
                <span className="eyebrow">
                  {summary.delivered ? "переказ доставлено" : "маршрут втрачено"}
                </span>
                <h2>
                  {summary.delivered
                    ? "Банка стала повнішою"
                    : "Шахраї сьогодні спритні"}
                </h2>
                <div className="result-score">
                  {summary.score.toLocaleString("uk-UA")}
                  <small>очок</small>
                </div>
                <div className="result-grid">
                  <span>
                    <b>{summary.coins}</b> монет
                  </span>
                  <span>
                    <b>{summary.cashback}</b> кешбеків
                  </span>
                  <span>
                    <b>x{summary.maxCombo.toFixed(1)}</b> комбо
                  </span>
                </div>
                {summary.unlocked.length > 0 && (
                  <div className="unlock-note">
                    Нова нагорода:{" "}
                    {ACHIEVEMENTS.find(
                      (achievement) =>
                        achievement.id === summary.unlocked[0],
                    )?.name || "секрет відкрито"}
                  </div>
                )}
                <div className="result-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={startGame}
                  >
                    ще раз <span>↻</span>
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setPhase("menu");
                      phaseRef.current = "menu";
                    }}
                  >
                    до меню
                  </button>
                </div>
              </div>
            )}

            {(phase === "playing" || phase === "paused") && (
              <button
                type="button"
                className="jump-button"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  jump();
                }}
                aria-label="Стрибнути"
              >
                ↑
                <small>стрибок</small>
              </button>
            )}
          </div>
        </section>

        <aside className="side-panel side-panel--profile">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">гардероб</span>
              <h2>Обери кота</h2>
            </div>
            <span className="skin-counter">
              {stats.unlockedSkins.length}/{SKINS.length}
            </span>
          </div>
          <div className="skin-list">
            {SKINS.map((skin) => {
              const unlocked = stats.unlockedSkins.includes(skin.id);
              return (
                <button
                  type="button"
                  key={skin.id}
                  className={`${selectedSkin === skin.id ? "is-selected" : ""} ${!unlocked ? "is-locked" : ""}`}
                  onClick={() => {
                    if (unlocked) setSelectedSkin(skin.id);
                  }}
                  aria-pressed={selectedSkin === skin.id}
                  aria-label={`${skin.name}${unlocked ? "" : " — заблоковано"}`}
                >
                  <i
                    style={{
                      background: skin.color,
                      color: skin.accent,
                    }}
                  >
                    {unlocked ? "•ᴗ•" : "?"}
                  </i>
                  <span>
                    <b>{skin.name}</b>
                    <small>{unlocked ? "відкрито" : skin.note}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="achievement-block">
            <div className="panel-heading panel-heading--small">
              <h3>Нагороди</h3>
              <span>
                {stats.achievements.length}/{ACHIEVEMENTS.length}
              </span>
            </div>
            <div className="achievement-row">
              {ACHIEVEMENTS.map((achievement) => (
                <span
                  key={achievement.id}
                  className={
                    stats.achievements.includes(achievement.id)
                      ? "is-unlocked"
                      : ""
                  }
                  title={achievement.name}
                >
                  {achievement.icon}
                </span>
              ))}
            </div>
          </div>

          <div className="leaderboard">
            <div className="panel-heading panel-heading--small">
              <h3>Демо-рейтинг</h3>
              <span>цей пристрій</span>
            </div>
            <ol>
              {leaderboard.map((entry, index) => (
                <li key={`${entry.name}-${entry.score}`}>
                  <em>{index + 1}</em>
                  <span>{entry.name}</span>
                  <b>{entry.score.toLocaleString("uk-UA")}</b>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <footer className="concept-footer">
        <span>Концепт гри для презентації monobank</span>
        <span>Локальний рекорд · без реальних переказів</span>
      </footer>
    </main>
  );
}

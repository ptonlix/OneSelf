import { setTimeout as delay } from "node:timers/promises";

const RESET = "\u001b[0m";
const BOLD = "\u001b[1m";
const TEAL = "\u001b[38;2;45;212;191m";
const BLUE = "\u001b[38;2;109;139;248m";
const VIOLET = "\u001b[38;2;168;85;247m";
const LILAC = "\u001b[38;2;196;181;253m";
const INK = "\u001b[38;2;210;214;230m";
const RB = [
  "\u001b[38;2;255;99;132m",
  "\u001b[38;2;255;159;64m",
  "\u001b[38;2;255;205;86m",
  "\u001b[38;2;75;192;112m",
  "\u001b[38;2;54;162;235m",
  "\u001b[38;2;153;102;255m",
  "\u001b[38;2;201;103;246m",
] as const;

const RING = new Set([
  "1,3",
  "1,4",
  "1,5",
  "2,2",
  "2,3",
  "2,4",
  "2,5",
  "2,6",
  "3,1",
  "3,2",
  "3,6",
  "3,7",
  "4,1",
  "4,2",
  "4,6",
  "4,7",
  "5,1",
  "5,2",
  "5,6",
  "5,7",
  "6,2",
  "6,3",
  "6,4",
  "6,5",
  "6,6",
  "7,3",
  "7,4",
  "7,5",
]);

const SAT: ReadonlyArray<readonly [number, number]> = [
  [0, 4],
  [0, 6],
  [2, 8],
  [4, 8],
  [6, 8],
  [8, 6],
  [8, 4],
  [8, 2],
  [6, 0],
  [4, 0],
  [2, 0],
  [0, 2],
];

const WORD_ROWS = [
  ["█▀▀█", "█▀▀▄", "█▀▀▀", "█▀▀▀", "█▀▀▀", "█   ", "█▀▀▀"],
  ["█  █", "█  █", "█▀▀ ", "▀▀▀█", "█▀▀ ", "█   ", "█▀▀ "],
  ["▀▀▀▀", "▀  ▀", "▀▀▀▀", "▀▀▀▀", "▀▀▀▀", "▀▀▀▀", "▀   "],
] as const;

function plainMode(): boolean {
  return (
    process.env.NO_COLOR !== undefined || process.env.ONESELF_PLAIN === "1" || !process.stdout.isTTY
  );
}

function paintCell(row: number, col: number, phase: number): string {
  let satI = -1;
  if (phase === 99) satI = 1;
  else if (phase >= 8 && phase <= 19) satI = phase - 8;

  const sat = satI >= 0 ? SAT[satI] : undefined;
  if (sat) {
    const [sr, sc] = sat;
    if (row === sr && col === sc) return `${BOLD}${VIOLET}██${RESET}`;
    const trail = phase !== 99 ? SAT[satI === 0 ? 11 : satI - 1] : undefined;
    if (trail) {
      const [tr, tc] = trail;
      if (row === tr && col === tc) return `${LILAC}░░${RESET}`;
    }
  }

  if (row === 4 && col === 4) {
    if (phase === 7) return `${BOLD}${LILAC}██${RESET}`;
    if (phase >= 8 || phase === 99) return `${BOLD}${BLUE}██${RESET}`;
  }

  if (RING.has(`${row},${col}`)) {
    if (phase === 99 || phase >= 7 || row <= phase + 1) {
      if (row <= 2) return `${TEAL}██${RESET}`;
      if (row <= 4) return `${BLUE}██${RESET}`;
      return `${VIOLET}██${RESET}`;
    }
  }
  return "  ";
}

function paintWordRow(parts: readonly string[]): string {
  return parts.map((part, i) => `${BOLD}${RB[i % RB.length]}${part}${RESET}`).join(" ");
}

function drawScene(phase: number): string {
  const lines: string[] = [""];
  for (let row = 0; row < 9; row++) {
    let line = "    ";
    for (let col = 0; col < 9; col++) {
      line += paintCell(row, col, phase);
    }
    lines.push(line);
  }
  lines.push("");
  if (phase >= 12 || phase === 99) {
    for (const row of WORD_ROWS) {
      lines.push(`    ${paintWordRow(row)}`);
    }
    lines.push("");
    lines.push(`    ${BOLD}${INK}one context · every agent${RESET}`);
    lines.push(`    ${BOLD}${INK}建立一份关于你的上下文，让每个 AI 都了解你${RESET}`);
  } else {
    lines.push("", "", "", "", "", "");
  }
  return lines.join("\n");
}

/** Static rainbow wordmark (no ring animation). */
function renderBanner(): string {
  return `${drawScene(99)}\n`;
}

/**
 * Opening animation shown by install / update.
 * Animates only on a color TTY; otherwise prints the final frame.
 */
export async function showBanner(animate = true): Promise<void> {
  if (!animate || plainMode()) {
    process.stdout.write(renderBanner());
    return;
  }

  const hide = "\u001b[?25l";
  const show = "\u001b[?25h";
  const restore = (): void => {
    process.stdout.write(`${RESET}${show}`);
  };

  const onSignal = (): void => {
    restore();
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    process.stdout.write(`${hide}\u001b[2J\u001b[H`);
    for (let i = 0; i <= 19; i++) {
      process.stdout.write(`\u001b[H${drawScene(i)}`);
      await delay(45);
    }
    await delay(120);
  } finally {
    restore();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  process.stdout.write("\n");
}

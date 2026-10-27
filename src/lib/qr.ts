/**
 * Small QR code encoder for tracking links: byte mode, error correction
 * level M (about 15% of the code can be damaged), versions 1 to 10, so text of
 * up to 213 bytes. The steps follow ISO/IEC 18004 as laid out in Project
 * Nayuki's reference implementation, cut down to this one case. Pure, so it
 * runs on the server and in the browser.
 */

/** Error correction codewords per block and number of blocks, level M, versions 1-10. */
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;

/** Longest text (in UTF-8 bytes) that fits. */
export const QR_MAX_BYTES = 213;

/** Modules (bits) available for data and error correction in a version. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version - 1] * BLOCKS[version - 1];
}

// ---------- Reed-Solomon error correction over GF(2^8) ----------

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, i) => (result[i] ^= gfMultiply(coefficient, factor)));
  }
  return result;
}

// ---------- data codewords ----------

/** Mode, length, the bytes, terminator and padding, split into blocks with their error correction, interleaved. */
function codewordsFor(bytes: number[], version: number): number[] {
  const capacity = dataCodewords(version) * 8;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));

  const blockCount = BLOCKS[version - 1];
  const eccLength = ECC_PER_BLOCK[version - 1];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blockCount - (rawCodewords % blockCount);
  const shortLength = Math.floor(rawCodewords / blockCount);
  const divisor = rsDivisor(eccLength);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < blockCount; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += block.length;
    const ecc = rsRemainder(block, divisor);
    if (i < shortBlocks) block.push(0);
    blocks.push([...block, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      // Skip the padding byte of the short blocks.
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// ---------- the module grid ----------

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

class Grid {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  set(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  drawFunctionPatterns(version: number) {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [size - 4, 3],
      [3, size - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          if (x >= 0 && x < size && y >= 0 && y < size) this.set(x, y, distance !== 2 && distance !== 4);
        }
      }
    }
    const positions = alignmentPositions(version);
    const last = positions.length - 1;
    positions.forEach((px, i) =>
      positions.forEach((py, j) => {
        // No alignment pattern on top of a finder pattern.
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) this.set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }),
    );
    this.drawFormatBits(0); // Reserves the area; drawn again once the mask is chosen.
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }

  /** Error correction level M (0b00) and the mask, with BCH error correction. */
  drawFormatBits(mask: number) {
    const { size } = this;
    const data = mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, true);
  }

  /** Data in the zigzag order: two-module columns from the right, alternately upward and downward. */
  drawCodewords(codewords: number[]) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // Skip the vertical timing pattern.
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number) {
    const test = MASKS[mask];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y][x] && test(x, y)) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /** Penalty score of the current pattern; the mask with the lowest score is used. */
  penalty(): number {
    const { size, modules } = this;
    const lines: string[] = [];
    for (let i = 0; i < size; i++) {
      lines.push(modules[i].map((d) => (d ? "1" : "0")).join(""));
      lines.push(modules.map((row) => (row[i] ? "1" : "0")).join(""));
    }
    let score = 0;
    for (const line of lines) {
      // Runs of five or more modules of one colour.
      for (const run of line.match(/0{5,}|1{5,}/g) ?? []) score += run.length - 2;
      // Patterns that look like a finder pattern (the light border around the code counts).
      const padded = `0000${line}0000`;
      for (const pattern of ["00001011101", "10111010000"]) {
        for (let at = padded.indexOf(pattern); at !== -1; at = padded.indexOf(pattern, at + 1)) score += 40;
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (modules[y][x]) dark++;
        if (x < size - 1 && y < size - 1) {
          const c = modules[y][x];
          if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
        }
      }
    }
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

/**
 * The QR code for some text, as rows of modules (true is dark), without the
 * light border. Throws when the text is longer than QR_MAX_BYTES.
 */
export function encodeQr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  while (version <= MAX_VERSION && 4 + (version <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8) version++;
  if (version > MAX_VERSION) throw new Error("The text is too long for a QR code.");

  const grid = new Grid(version * 4 + 17);
  grid.drawFunctionPatterns(version);
  grid.drawCodewords(codewordsFor(bytes, version));

  let best = { mask: 0, score: Infinity };
  for (let mask = 0; mask < MASKS.length; mask++) {
    grid.applyMask(mask);
    grid.drawFormatBits(mask);
    const score = grid.penalty();
    if (score < best.score) best = { mask, score };
    grid.applyMask(mask); // Masking twice undoes it.
  }
  grid.applyMask(best.mask);
  grid.drawFormatBits(best.mask);
  return grid.modules;
}

/** Light border around the code, in modules, as the standard asks. */
export const QR_QUIET_ZONE = 4;

/** An SVG path of the dark modules (one rectangle per horizontal run), offset by the light border. */
export function qrPath(modules: boolean[][]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const start = x;
      while (x + 1 < row.length && row[x + 1]) x++;
      const width = x - start + 1;
      parts.push(`M${start + QR_QUIET_ZONE},${y + QR_QUIET_ZONE}h${width}v1h-${width}z`);
    }
  });
  return parts.join("");
}

/** A standalone SVG file of the QR code for some text, e.g. to print on a flyer. */
export function qrSvg(text: string, dark = "#0f172a"): string {
  const modules = encodeQr(text);
  const size = modules.length + QR_QUIET_ZONE * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${qrPath(modules)}" fill="${dark}"/></svg>`;
}

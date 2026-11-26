// Zero-dependency deterministic 6-state 2-symbol Turing machine simulator & recurrence prover.
// Standard 1RB notation: 6 states (A..F) separated by "_", 6 chars per state:
//   chars 0..2 = transition on reading 0 ([01][LR][A-FZ] or "---")
//   chars 3..5 = transition on reading 1 ([01][LR][A-FZ] or "---")

const MACHINE_RE = /^(?:(?:[01][LR][A-FZ]|---){2}_){5}(?:[01][LR][A-FZ]|---){2}$/;

export const MAX_SIM_STEPS = 25_000_000;
export const MAX_RECURRENCE_START = 5_000_000;
export const MAX_RECURRENCE_PERIOD = 1_000_000;

export function parseMachine(str) {
  if (typeof str !== "string" || !MACHINE_RE.test(str)) {
    return { ok: false, error: "machine must match 6-state 2-symbol 1RB notation" };
  }
  const blocks = str.split("_");
  const write = new Int8Array(12);
  const move = new Int8Array(12);
  const next = new Int8Array(12); // -1 means HALT
  for (let s = 0; s < 6; s += 1) {
    const blk = blocks[s];
    for (let sym = 0; sym < 2; sym += 1) {
      const idx = s * 2 + sym;
      const code = blk.slice(sym * 3, sym * 3 + 3);
      if (code === "---" || code[2] === "Z") {
        write[idx] = code === "---" ? 1 : code[0] === "1" ? 1 : 0;
        move[idx] = code === "---" ? 1 : code[1] === "R" ? 1 : -1;
        next[idx] = -1;
      } else {
        write[idx] = code[0] === "1" ? 1 : 0;
        move[idx] = code[1] === "R" ? 1 : -1;
        next[idx] = code.charCodeAt(2) - 65; // 'A'=0..'F'=5
      }
    }
  }
  return { ok: true, tm: { str, write, move, next } };
}

class Tape {
  constructor(initialSize = 65536) {
    this.buf = new Uint8Array(initialSize);
    this.offset = initialSize >> 1;
    this.minNonZero = Infinity;
    this.maxNonZero = -Infinity;
    this.ones = 0;
  }

  ensure(pos) {
    const idx = pos + this.offset;
    if (idx >= 0 && idx < this.buf.length) return idx;
    let newLen = this.buf.length * 2;
    while (pos + (newLen >> 1) < 0 || pos + (newLen >> 1) >= newLen) {
      newLen *= 2;
      if (newLen > 32 * 1024 * 1024) throw new Error("tape exceeded 32M cell limit");
    }
    const nextBuf = new Uint8Array(newLen);
    const newOffset = newLen >> 1;
    nextBuf.set(this.buf, newOffset - this.offset);
    this.buf = nextBuf;
    this.offset = newOffset;
    return pos + this.offset;
  }

  get(pos) {
    const idx = pos + this.offset;
    if (idx < 0 || idx >= this.buf.length) return 0;
    return this.buf[idx];
  }

  set(pos, val) {
    const idx = this.ensure(pos);
    const prev = this.buf[idx];
    if (prev === val) return;
    this.buf[idx] = val;
    if (val === 1) {
      this.ones += 1;
      if (pos < this.minNonZero) this.minNonZero = pos;
      if (pos > this.maxNonZero) this.maxNonZero = pos;
    } else {
      this.ones -= 1;
    }
  }

  tightBounds() {
    if (this.ones === 0) return { min: 0, max: -1 };
    let lo = this.minNonZero;
    let hi = this.maxNonZero;
    while (lo <= hi && this.get(lo) === 0) lo += 1;
    while (hi >= lo && this.get(hi) === 0) hi -= 1;
    this.minNonZero = lo;
    this.maxNonZero = hi;
    return { min: lo, max: hi };
  }

  snapshot() {
    const { min, max } = this.tightBounds();
    if (max < min) return { min: 0, max: -1, cells: new Uint8Array(0) };
    const cells = new Uint8Array(max - min + 1);
    for (let p = min; p <= max; p += 1) cells[p - min] = this.get(p);
    return { min, max, cells };
  }
}

function snapGet(snap, pos) {
  if (pos < snap.min || pos > snap.max) return 0;
  return snap.cells[pos - snap.min];
}

export function simulate(tm, maxSteps) {
  const tape = new Tape();
  const { write, move, next } = tm;
  let state = 0;
  let head = 0;
  let steps = 0;
  while (steps < maxSteps) {
    const sym = tape.get(head);
    const idx = state * 2 + sym;
    const w = write[idx];
    if (w !== sym) tape.set(head, w);
    head += move[idx];
    state = next[idx];
    steps += 1;
    if (state === -1) {
      return { halted: true, steps, ones: tape.ones, state, head };
    }
  }
  return { halted: false, steps, ones: tape.ones, state, head };
}

/**
 * Airtight inductive verifier for periodic (shift = 0) and translated-cycler (shift != 0)
 * non-halting certificates.
 */
export function verifyRecurrence(tm, startStep, period, shift) {
  if (
    !Number.isInteger(startStep) || startStep < 0 || startStep > MAX_RECURRENCE_START ||
    !Number.isInteger(period) || period < 1 || period > MAX_RECURRENCE_PERIOD ||
    !Number.isInteger(shift) || Math.abs(shift) > period
  ) {
    return { ok: false, error: "recurrence parameters out of bounds" };
  }
  const tape = new Tape();
  const { write, move, next } = tm;
  let state = 0;
  let head = 0;

  for (let t = 0; t < startStep; t += 1) {
    const sym = tape.get(head);
    const idx = state * 2 + sym;
    if (write[idx] !== sym) tape.set(head, write[idx]);
    head += move[idx];
    state = next[idx];
    if (state === -1) return { ok: false, error: `machine halted at step ${t + 1} before start_step` };
  }

  const state0 = state;
  const head0 = head;
  const snap0 = tape.snapshot();

  let visMin = head;
  let visMax = head;
  for (let p = 0; p < period; p += 1) {
    if (head < visMin) visMin = head;
    if (head > visMax) visMax = head;
    const sym = tape.get(head);
    const idx = state * 2 + sym;
    if (write[idx] !== sym) tape.set(head, write[idx]);
    head += move[idx];
    state = next[idx];
    if (state === -1) {
      return { ok: false, error: `machine halted during recurrence period at step ${startStep + p + 1}` };
    }
  }
  if (head < visMin) visMin = head;
  if (head > visMax) visMax = head;

  if (state !== state0) {
    return { ok: false, error: `state mismatch after period: expected ${state0}, got ${state}` };
  }
  if (head !== head0 + shift) {
    return { ok: false, error: `head shift mismatch: expected ${head0 + shift}, got ${head}` };
  }

  const snap1 = tape.snapshot();

  if (shift === 0) {
    if (snap0.min !== snap1.min || snap0.max !== snap1.max || snap0.cells.length !== snap1.cells.length) {
      return { ok: false, error: "tape bounds changed after zero-shift cycle" };
    }
    for (let i = 0; i < snap0.cells.length; i += 1) {
      if (snap0.cells[i] !== snap1.cells[i]) {
        return { ok: false, error: "tape content changed after zero-shift cycle" };
      }
    }
    return { ok: true, kind: "periodic_cycle" };
  }

  if (shift > 0) {
    if (snap0.max >= snap0.min && snap0.max > visMax) {
      return { ok: false, error: "non-zero debris right of visited window at start_step breaks induction" };
    }
    if (snap1.max >= snap1.min && snap1.max > visMax + shift) {
      return { ok: false, error: "non-zero debris right of shifted window at start_step+period breaks induction" };
    }
    for (let x = visMin; x <= visMax; x += 1) {
      if (snapGet(snap1, x + shift) !== snapGet(snap0, x)) {
        return { ok: false, error: `translated tape mismatch at offset ${x}` };
      }
    }
    return { ok: true, kind: "translated_cycler_right" };
  }

  if (snap0.max >= snap0.min && snap0.min < visMin) {
    return { ok: false, error: "non-zero debris left of visited window at start_step breaks induction" };
  }
  if (snap1.max >= snap1.min && snap1.min < visMin + shift) {
    return { ok: false, error: "non-zero debris left of shifted window at start_step+period breaks induction" };
  }
  for (let x = visMin; x <= visMax; x += 1) {
    if (snapGet(snap1, x + shift) !== snapGet(snap0, x)) {
      return { ok: false, error: `translated tape mismatch at offset ${x}` };
    }
  }
  return { ok: true, kind: "translated_cycler_left" };
}

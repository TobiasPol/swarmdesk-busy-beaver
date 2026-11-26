import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseMachine, verifyRecurrence } from "./tm.mjs";
import { verifyCandidate, verifySelfCheck } from "./verify.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("all 6 busy-beaver targets pass self-check (4 cryptids active > 200k steps, 2 halting baselines)", () => {
  const res = verifySelfCheck(resolve(ROOT, "targets.json"));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.checked, 6);
});

test("exact halting bound accepts a stronger 6-state halting machine and rejects wrong step count", () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "targets.json"), "utf8"));
  const spec = manifest.targets.find((t) => t.name === "bb6_halting_steps");
  const cand = {
    target: "bb6_halting_steps",
    machine: "1RB1LB_1LA0LC_1RZ1LD_1RD0RA_0RA0RA_0RA0RA",
    claimed_steps: 107,
    claimed_ones: 13,
  };
  const ok = verifyCandidate(JSON.stringify(cand), spec, 50);
  assert.equal(ok.verdict, "ACCEPTED");
  assert.equal(ok.metric_value, 107);

  const wrong = verifyCandidate(JSON.stringify({ ...cand, claimed_steps: 108 }), spec, 50);
  assert.equal(wrong.verdict, "REJECTED");
  assert.equal(wrong.reason_code, "wrong_answer");
});

test("exact periodic recurrence (shift=0) proves non-halting", () => {
  const parsed = parseMachine("1RB1RB_0LA0LA_0RA0RA_0RA0RA_0RA0RA_0RA0RA");
  assert.equal(parsed.ok, true);
  const res = verifyRecurrence(parsed.tm, 1, 2, 0);
  assert.equal(res.ok, true);
  assert.equal(res.kind, "periodic_cycle");
});

test("exact translated cycler (shift=+1 and shift=-1) proves non-halting", () => {
  const right = parseMachine("1RA1RA_0RA0RA_0RA0RA_0RA0RA_0RA0RA_0RA0RA");
  assert.equal(verifyRecurrence(right.tm, 0, 1, 1).ok, true);

  const left = parseMachine("1LA1LA_0RA0RA_0RA0RA_0RA0RA_0RA0RA_0RA0RA");
  assert.equal(verifyRecurrence(left.tm, 0, 1, -1).ok, true);
});

test("fake translated cycler with dirty debris right of window is rejected", () => {
  const parsed = parseMachine("1RB0RA_1LC0RA_0RA0LD_1RE0RA_1RE1RZ_0RA0RA");
  assert.equal(parsed.ok, true);
  const res = verifyRecurrence(parsed.tm, 3, 1, 1);
  assert.equal(res.ok, false);
});

#!/usr/bin/env node
// Generates verified baselines, open cryptid placeholders, and targets.json for busy-beaver.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMachine, simulate } from "../checker/tm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CONJECTURES = [
  {
    name: "bb6_antihydra",
    title: "Antihydra (BB6 Cryptid)",
    machine: "1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA",
    summary: "Famous BB(6) Collatz-like cryptid discovered by mxdys (2024). Submit an exact halting step witness or verified non-halting recurrence proof.",
    source_url: "https://wiki.bbchallenge.org/wiki/Antihydra",
  },
  {
    name: "bb6_kropitz_champ",
    title: "Kropitz BB(6) Tetrational Machine",
    machine: "1RB0LD_1RC0RF_1LC1LA_0LE1RZ_1LF0RB_0RC0RE",
    summary: "Pavel Kropitz's hyper-exponential 6-state 2-symbol machine exceeding 10^^15 steps. Open for inductive non-halting refutation or halting witness.",
    source_url: "https://wiki.bbchallenge.org/wiki/BB(6)",
  },
  {
    name: "bb6_marxen_buntrock_ext",
    title: "BB(6) Counter Cryptid (Holdout C)",
    machine: "1RB0LC_1RC0RB_1RD0LE_1LA1LD_1RZ0LA_1LE1RF",
    summary: "Long-running 6-state 2-symbol Turing machine exhibiting complex exponential counter dynamics from a blank tape.",
    source_url: "https://wiki.bbchallenge.org/wiki/BB(6)",
  },
  {
    name: "bb6_kropitz_2010",
    title: "Kropitz 2010 BB(6) Holdout (Holdout D)",
    machine: "1RB1LE_1LC1RF_1LD0LB_1RA0LC_1LA0RD_1RZ1RC",
    summary: "Pavel Kropitz's 2010 6-state 2-symbol exponential runner. Verify halting or submit an exact inductive non-halting recurrence certificate.",
    source_url: "https://wiki.bbchallenge.org/wiki/BB(6)",
  },
];

// BB(4) champion padded to 6 states (107 steps, 13 ones): 1RB1LB_1LA0LC_1RZ1LD_1RD0RA_0RA0RA_0RA0RA
const BASELINE_TM = "1RB1LB_1LA0LC_1RZ1LD_1RD0RA_0RA0RA_0RA0RA";

export function generateAll() {
  mkdirSync(resolve(ROOT, "targets"), { recursive: true });
  const manifestTargets = [];

  for (const c of CONJECTURES) {
    const parsed = parseMachine(c.machine);
    if (!parsed.ok) throw new Error(`${c.name}: ${parsed.error}`);
    const sim = simulate(parsed.tm, 200_000);
    if (sim.halted) {
      throw new Error(`${c.name} halted trivially at step ${sim.steps}!`);
    }
    const filePath = `targets/${c.name}.json`;
    writeFileSync(
      resolve(ROOT, filePath),
      `${JSON.stringify({ target: c.name, machine: c.machine, status: "open" }, null, 2)}\n`,
    );
    manifestTargets.push({
      name: c.name,
      title: c.title,
      summary: c.summary,
      file_path: filePath,
      machine: c.machine,
      kind: "conjecture",
      domain: "Computability & Busy Beaver",
      source_url: c.source_url,
      approach: "Submit a verified halting step certificate (resolution=proved) or exact inductive recurrence certificate (resolution=disproved).",
    });
  }

  const baseParsed = parseMachine(BASELINE_TM);
  if (!baseParsed.ok) throw new Error(baseParsed.error);
  const baseSim = simulate(baseParsed.tm, 10_000);
  if (!baseSim.halted) throw new Error("Baseline TM did not halt!");

  const stepsDoc = {
    target: "bb6_halting_steps",
    machine: BASELINE_TM,
    claimed_steps: baseSim.steps,
    claimed_ones: baseSim.ones,
  };
  writeFileSync(resolve(ROOT, "targets/bb6_halting_steps.json"), `${JSON.stringify(stepsDoc, null, 2)}\n`);
  manifestTargets.push({
    name: "bb6_halting_steps",
    title: "BB(6) Direct-Replay Halting Champion",
    summary: "Find a 6-state 2-symbol Turing machine that halts from a blank tape after strictly more steps (verified by exact replay up to 25M steps).",
    file_path: "targets/bb6_halting_steps.json",
    kind: "bound",
    direction: "maximize",
    baseline_value: baseSim.steps,
    sota_value: 25_000_000,
    metric_unit: "steps",
    domain: "Busy Beaver bounds",
    source_url: "https://wiki.bbchallenge.org/wiki/BB(6)",
    approach: "Submit any valid 6-state 2-symbol 1RB machine halting in strictly more steps than the current holder (up to 25,000,000 CI replay cap).",
  });

  const onesDoc = {
    target: "bb6_ones_written",
    machine: BASELINE_TM,
    claimed_steps: baseSim.steps,
    claimed_ones: baseSim.ones,
  };
  writeFileSync(resolve(ROOT, "targets/bb6_ones_written.json"), `${JSON.stringify(onesDoc, null, 2)}\n`);
  manifestTargets.push({
    name: "bb6_ones_written",
    title: "Sigma(6) Direct-Replay Ones Champion",
    summary: "Find a 6-state 2-symbol halting Turing machine leaving strictly more 1s on the tape at halt (verified by exact replay up to 25M steps).",
    file_path: "targets/bb6_ones_written.json",
    kind: "bound",
    direction: "maximize",
    baseline_value: baseSim.ones,
    sota_value: 50_000,
    metric_unit: "ones",
    domain: "Busy Beaver bounds",
    source_url: "https://wiki.bbchallenge.org/wiki/BB(6)",
    approach: "Submit any valid 6-state 2-symbol 1RB halting machine leaving strictly more 1s on the tape than the current holder.",
  });

  const manifest = {
    problem: "busy-beaver",
    max_bytes: 131_072,
    targets: manifestTargets,
  };
  writeFileSync(resolve(ROOT, "targets.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { count: manifestTargets.length, baseSteps: baseSim.steps, baseOnes: baseSim.ones };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = generateAll();
  console.log(`Generated ${res.count} busy-beaver targets (baseline: ${res.baseSteps} steps, ${res.baseOnes} ones).`);
}

#!/usr/bin/env node
// Zero-dependency deterministic verifier for Busy Beaver(6) halting champions & cryptid proofs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_SIM_STEPS, parseMachine, simulate, verifyRecurrence } from "./tm.mjs";

export const DEFAULT_MAX_BYTES = 131_072;

function rejected(reasonCode, reason, extra = {}) {
  return {
    verdict: "REJECTED",
    reason_code: reasonCode,
    reason,
    resolution: "",
    metric_value: extra.metric_value ?? null,
    holder_value: extra.holder_value ?? null,
    proof_lines: 0,
    wasm_bytes: 0,
    class_fuel: "{}",
  };
}

function verifyBound(doc, targetSpec, holderValue) {
  const allowed = new Set(["target", "machine", "claimed_steps", "claimed_ones"]);
  for (const k of Object.keys(doc)) {
    if (!allowed.has(k)) return rejected("schema_error", `unexpected field ${k}`, { holder_value: holderValue });
  }
  const parsed = parseMachine(doc.machine);
  if (!parsed.ok) return rejected("schema_error", parsed.error, { holder_value: holderValue });
  if (
    !Number.isInteger(doc.claimed_steps) || doc.claimed_steps < 1 || doc.claimed_steps > MAX_SIM_STEPS ||
    !Number.isInteger(doc.claimed_ones) || doc.claimed_ones < 0
  ) {
    return rejected("schema_error", `claimed_steps must be in 1..${MAX_SIM_STEPS} and claimed_ones >= 0`, {
      holder_value: holderValue,
    });
  }
  const sim = simulate(parsed.tm, doc.claimed_steps);
  if (!sim.halted) {
    return rejected("wrong_answer", `machine did not halt within claimed ${doc.claimed_steps} steps`, {
      holder_value: holderValue,
    });
  }
  if (sim.steps !== doc.claimed_steps) {
    return rejected("wrong_answer", `machine halted at step ${sim.steps}, not claimed ${doc.claimed_steps}`, {
      holder_value: holderValue,
    });
  }
  if (sim.ones !== doc.claimed_ones) {
    return rejected("wrong_answer", `tape has ${sim.ones} ones at halt, not claimed ${doc.claimed_ones}`, {
      holder_value: holderValue,
    });
  }
  const metric = targetSpec.metric_unit === "ones" ? sim.ones : sim.steps;
  if (metric <= holderValue) {
    return rejected("bound_not_improved", `${metric} ${targetSpec.metric_unit} does not beat holder ${holderValue}`, {
      metric_value: metric,
      holder_value: holderValue,
    });
  }
  return {
    verdict: "ACCEPTED",
    reason_code: "",
    reason: `verified 6-state TM halt: ${sim.steps} steps, ${sim.ones} ones (${metric} > ${holderValue})`,
    resolution: "improved",
    metric_value: metric,
    holder_value: holderValue,
    proof_lines: 6,
    wasm_bytes: 0,
    class_fuel: "{}",
  };
}

function verifyConjecture(doc, targetSpec) {
  const allowed = new Set(["target", "machine", "resolution", "certificate"]);
  for (const k of Object.keys(doc)) {
    if (!allowed.has(k)) return rejected("schema_error", `unexpected field ${k}`);
  }
  if (doc.machine !== targetSpec.machine) {
    return rejected("schema_error", "machine string does not match target cryptid");
  }
  const parsed = parseMachine(doc.machine);
  if (!parsed.ok) return rejected("schema_error", parsed.error);
  const cert = doc.certificate;
  if (!cert || typeof cert !== "object" || Array.isArray(cert)) {
    return rejected("schema_error", "certificate object is required");
  }
  if (doc.resolution === "proved" && cert.type === "halting") {
    if (!Number.isInteger(cert.steps) || cert.steps < 1 || cert.steps > MAX_SIM_STEPS) {
      return rejected("schema_error", `halting steps must be an integer in 1..${MAX_SIM_STEPS}`);
    }
    const sim = simulate(parsed.tm, cert.steps);
    if (!sim.halted || sim.steps !== cert.steps) {
      return rejected("wrong_answer", `machine did not halt at step ${cert.steps}`);
    }
    return {
      verdict: "ACCEPTED",
      reason_code: "",
      reason: `verified halting certificate: halted at step ${sim.steps} with ${sim.ones} ones`,
      resolution: "proved",
      metric_value: sim.steps,
      holder_value: null,
      proof_lines: 1,
      wasm_bytes: 0,
      class_fuel: "{}",
    };
  }
  if (doc.resolution === "disproved" && cert.type === "recurrence") {
    const res = verifyRecurrence(parsed.tm, cert.start_step, cert.period, cert.shift);
    if (!res.ok) return rejected("wrong_answer", res.error);
    return {
      verdict: "ACCEPTED",
      reason_code: "",
      reason: `verified non-halting ${res.kind} (start=${cert.start_step}, period=${cert.period}, shift=${cert.shift})`,
      resolution: "disproved",
      metric_value: null,
      holder_value: null,
      proof_lines: 1,
      wasm_bytes: 0,
      class_fuel: "{}",
    };
  }
  return rejected("schema_error", "resolution must be proved (halting) or disproved (recurrence)");
}

export function extractBoundMetric(doc, targetSpec) {
  if (!doc || typeof doc !== "object") return null;
  if (targetSpec.metric_unit === "ones" && Number.isInteger(doc.claimed_ones)) return doc.claimed_ones;
  if (Number.isInteger(doc.claimed_steps)) return doc.claimed_steps;
  return null;
}

export function verifyCandidate(rawText, targetSpec, holderValue, maxBytes = DEFAULT_MAX_BYTES) {
  if (typeof rawText !== "string" || rawText.length === 0) {
    return rejected("schema_error", "submission file is empty", { holder_value: holderValue });
  }
  if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
    return rejected("size_limit", `submission exceeds ${maxBytes} bytes`, { holder_value: holderValue });
  }
  let doc;
  try {
    doc = JSON.parse(rawText);
  } catch {
    return rejected("schema_error", "submission is not strict JSON", { holder_value: holderValue });
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || doc.target !== targetSpec.name) {
    return rejected("schema_error", "submission root or target does not match spec", { holder_value: holderValue });
  }
  if (targetSpec.kind === "bound") return verifyBound(doc, targetSpec, holderValue);
  return verifyConjecture(doc, targetSpec);
}

export function verifySelfCheck(manifestPath) {
  const absManifest = resolve(manifestPath);
  const rootDir = dirname(absManifest);
  const manifest = JSON.parse(readFileSync(absManifest, "utf8"));
  const maxBytes = manifest.max_bytes ?? DEFAULT_MAX_BYTES;
  const results = [];
  let allOk = true;
  for (const target of manifest.targets ?? []) {
    const raw = readFileSync(resolve(rootDir, target.file_path), "utf8");
    const doc = JSON.parse(raw);
    if (target.kind === "bound") {
      const res = verifyCandidate(raw, target, target.baseline_value - 1, maxBytes);
      if (res.verdict !== "ACCEPTED" || res.metric_value !== target.baseline_value) {
        allOk = false;
        results.push({ target: target.name, ok: false, reason_code: res.reason_code, reason: res.reason });
        continue;
      }
      results.push({ target: target.name, ok: true, metric_value: res.metric_value });
    } else {
      const parsed = parseMachine(target.machine);
      if (!parsed.ok || doc.machine !== target.machine || doc.status !== "open") {
        allOk = false;
        results.push({ target: target.name, ok: false, reason: "invalid open conjecture placeholder" });
        continue;
      }
      const sim = simulate(parsed.tm, 200_000);
      if (sim.halted) {
        allOk = false;
        results.push({ target: target.name, ok: false, reason: `conjecture machine halted trivially at step ${sim.steps}` });
        continue;
      }
      results.push({ target: target.name, ok: true, status: "open_verified_200k" });
    }
  }
  return { ok: allOk, checked: results.length, results };
}

function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

function main(argv) {
  if (argv[0] === "--self-check") {
    const res = verifySelfCheck(argv[1] ?? "targets.json");
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  }
  if (argv[0] === "--score") {
    const manifest = JSON.parse(readFileSync("targets.json", "utf8"));
    const doc = JSON.parse(readFileSync(argv[1], "utf8"));
    const spec = (manifest.targets ?? []).find((t) => t.name === doc.target);
    const m = spec ? extractBoundMetric(doc, spec) : null;
    if (m === null) process.exit(1);
    console.log(m);
    process.exit(0);
  }
  if (argv[0] === "verify") {
    const flags = parseFlags(argv.slice(1));
    const manifest = JSON.parse(readFileSync(flags.targets ?? "targets.json", "utf8"));
    const targetSpec = (manifest.targets ?? []).find((t) => t.name === flags.target);
    if (!targetSpec) {
      const err = rejected("schema_error", "unknown target");
      if (flags.out) writeFileSync(flags.out, `${JSON.stringify(err)}\n`);
      console.log(JSON.stringify(err));
      process.exit(0);
    }
    let holderVal = targetSpec.baseline_value ?? 0;
    if (targetSpec.kind === "bound" && flags.holder) {
      try {
        const m = extractBoundMetric(JSON.parse(readFileSync(flags.holder, "utf8")), targetSpec);
        if (m !== null) holderVal = m;
      } catch {
        // fallback to baseline_value
      }
    }
    const rawCandidate = readFileSync(flags.candidate, "utf8");
    const verdict = verifyCandidate(rawCandidate, targetSpec, holderVal, manifest.max_bytes ?? DEFAULT_MAX_BYTES);
    if (flags.out) writeFileSync(flags.out, `${JSON.stringify(verdict)}\n`);
    console.log(JSON.stringify(verdict));
    process.exit(0);
  }
  console.error("usage: verify.mjs --self-check [targets.json] | --score <file> | verify --targets <targets.json> --target <name> --candidate <file>");
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}

# Busy Beaver(6) Cryptid Hunt (`busy-beaver`)

A deterministic Turing machine verification arena on Swarmdesk focused on **6-state, 2-symbol Turing machines** (`BB(6)`).

## Targets

1. **Unresolved BB(6) Cryptids & Long-Running Holdouts (`kind: conjecture`):**
   - `bb6_antihydra` (`1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA`): famous Collatz-like BB(6) cryptid.
   - `bb6_kropitz_champ`, `bb6_marxen_buntrock_ext`, `bb6_kropitz_2010`: hyper-exponential 6-state machines.
   - Submit either an exact **Halting Certificate** (`resolution: "proved"`, exact step count replayed by CI) OR an exact **Inductive Recurrence Certificate** (`resolution: "disproved"`, verifying exact periodic cycle `shift = 0` or clean translated cycler `shift != 0` with zero external tape debris).
2. **Direct-Replay Champions (`kind: bound`):**
   - `bb6_halting_steps`: maximize verified direct-replay halting steps (up to 25,000,000 CI cap).
   - `bb6_ones_written`: maximize verified tape `1`s remaining at halt (`Sigma(6)`).

## Local Check

```bash
node checker/verify.mjs --self-check targets.json
node --test checker/verify.test.mjs
scripts/check.sh <target>
```

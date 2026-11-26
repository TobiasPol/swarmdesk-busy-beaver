# Contributing to Busy Beaver(6) Cryptid Hunt

Every pull request replaces **one** JSON file listed in `targets.json` (`targets/<name>.json`) on a branch named `step-<id>` from the Swarmdesk desk.

## Rules checked by CI

1. **One branch, one commit, one modified file.** Branch name and commit message must both equal `step-<id>`. Never modify `targets.json`, `checker/`, or workflows in a submission PR.
2. **Standard 1RB notation only:** 6 state blocks (`A..F`) separated by `_`, each block 6 characters (`[01][LR][A-FZ]` or `---` per symbol `0`/`1`).
3. **Conjecture proofs:** exact `halting` step count (up to 25,000,000 steps) OR exact `recurrence` certificate (`start_step` <= 5,000,000, `period` <= 1,000,000, verified zero outside debris for `shift != 0`).
4. **Bounds:** strictly beat current holder `claimed_steps` or `claimed_ones`, verified by exact replay from blank tape.
5. **Test locally first:** run `scripts/check.sh <target>`.

'use strict';

class Checker {
  constructor(name, seed) {
    this.name = name;
    this.seed = seed;
    this.failures = [];
    this.notes = [];
    this.count = 0;
  }
  note(msg) { this.notes.push(msg); }
  ok(cond, msg, detail) {
    this.count++;
    if (!cond) this.failures.push(msg + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)));
    return !!cond;
  }
  eq(actual, expected, msg) {
    return this.ok(Object.is(actual, expected), msg, { actual, expected });
  }
  near(actual, expected, tol, msg) {
    const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
    return this.ok(pass, msg, { actual, expected, tol });
  }
  between(actual, lo, hi, msg) {
    const pass = Number.isFinite(actual) && actual >= lo && actual <= hi;
    return this.ok(pass, msg, { actual, lo, hi });
  }
  lt(actual, bound, msg) { return this.ok(Number.isFinite(actual) && actual < bound, msg, { actual, bound }); }
  gt(actual, bound, msg) { return this.ok(Number.isFinite(actual) && actual > bound, msg, { actual, bound }); }
  result() {
    return { name: this.name, seed: this.seed, passed: this.count - this.failures.length, total: this.count, failures: this.failures, notes: this.notes };
  }
}

module.exports = { Checker };

// Generator-based coroutines for authoring waves, enemy scripts and boss phases.
//
//   function* script(ctx) {
//     yield 1.5;                 // wait 1.5 seconds of game time
//     yield () => ctx.done;      // wait until predicate is true
//     yield;                     // wait one frame
//     yield* otherScript(ctx);   // compose
//   }

export class Scheduler {
  constructor() {
    this.tasks = [];
  }

  /** Start a coroutine. Returns a handle with .cancel() and .done. */
  start(gen, owner = null) {
    const task = { gen, wait: 0, cond: null, frame: false, done: false, owner, cancel: () => { task.done = true; } };
    this.tasks.push(task);
    this._advance(task, 0);
    return task;
  }

  /** Cancel every task started for owner. */
  cancelOwner(owner) {
    for (const t of this.tasks) if (t.owner === owner) t.done = true;
  }

  cancelAll() {
    for (const t of this.tasks) t.done = true;
    this.tasks.length = 0;
  }

  update(dt) {
    // Iterate over a snapshot length; tasks started this frame get their first step immediately in start().
    const n = this.tasks.length;
    for (let i = 0; i < n; i++) {
      const task = this.tasks[i];
      if (task.done) continue;
      if (task.owner && task.owner.alive === false) { task.done = true; continue; }
      if (task.cond) {
        if (!task.cond()) continue;
        task.cond = null;
        this._advance(task, 0);
      } else if (task.frame) {
        task.frame = false;
        this._advance(task, 0);
      } else {
        task.wait -= dt;
        // Carry leftover time so long frames do not slow scripts down.
        if (task.wait <= 0) this._advance(task, -task.wait);
      }
    }
    let w = 0;
    for (let i = 0; i < this.tasks.length; i++) {
      if (!this.tasks[i].done) this.tasks[w++] = this.tasks[i];
    }
    this.tasks.length = w;
  }

  _advance(task, overflow) {
    let guard = 0;
    while (!task.done) {
      if (++guard > 10000) throw new Error('coroutine spun without yielding time');
      const r = task.gen.next();
      if (r.done) { task.done = true; return; }
      const v = r.value;
      if (typeof v === 'function') {
        if (v()) continue;
        task.cond = v;
        return;
      }
      if (v === undefined || v === null) { task.frame = true; return; }
      if (v <= 0) continue;
      if (overflow >= v) { overflow -= v; continue; }
      task.wait = v - overflow;
      return;
    }
  }
}

/** Wait helper usable inside generators: yield* wait(1). */
export function* wait(seconds) {
  yield seconds;
}

/** Repeat body every interval for duration seconds. */
export function* every(interval, duration, body) {
  let t = 0, i = 0;
  while (t < duration) {
    body(i++, t);
    yield interval;
    t += interval;
  }
}

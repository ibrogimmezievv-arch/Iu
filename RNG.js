/* ============================================================
 * RNG.js — детерминированный генератор случайных чисел (LCG).
 * НИГДЕ в симуляции не используется Math.random().
 * Состояние (seed) полностью сериализуется в save.
 * ============================================================ */
(function (global) {
  'use strict';

  class RNG {
    constructor(seed) {
      this.seed = (seed >>> 0) || 1;
    }
    // [0, 1)
    next() {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }
    // целое [min, max] включительно
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    }
    // float [min, max)
    float(min, max) {
      return min + this.next() * (max - min);
    }
    // true с вероятностью p
    chance(p) {
      return this.next() < p;
    }
    // случайный элемент массива
    pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(this.next() * arr.length)];
    }
    // перемешать копию массива
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    // взвешенный выбор: items = [{w: число, v: значение}]
    weighted(items) {
      let total = 0;
      for (const it of items) total += it.w;
      let r = this.next() * total;
      for (const it of items) {
        r -= it.w;
        if (r <= 0) return it.v;
      }
      return items[items.length - 1].v;
    }
    serialize() { return { seed: this.seed }; }
    static deserialize(data) { return new RNG(data.seed); }
  }

  global.AOT = global.AOT || {};
  global.AOT.RNG = RNG;
})(typeof window !== 'undefined' ? window : globalThis);

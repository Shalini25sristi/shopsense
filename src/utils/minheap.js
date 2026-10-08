"use strict";
/**
 * Binary min-heap used for efficient Top-K selection.
 * Keep a heap of size K; when it overflows, pop the smallest.
 * Total cost: O(n log k) instead of O(n log n) for a full sort.
 */
class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare || ((a, b) => a.key - b.key);
  }
  get size() {
    return this.items.length;
  }
  peek() {
    return this.items[0];
  }
  push(value) {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(a[i], a[parent]) >= 0) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && this.compare(a[l], a[smallest]) < 0) smallest = l;
        if (r < n && this.compare(a[r], a[smallest]) < 0) smallest = r;
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest], a[i]];
        i = smallest;
      }
    }
    return top;
  }
  /** Return the retained items sorted by the comparator (ascending). */
  toSortedArray() {
    return this.items.slice().sort(this.compare);
  }
}

/** Return the top-K largest items by numeric key using a bounded min-heap. */
function topK(items, k, keyFn) {
  const heap = new MinHeap((a, b) => a.__k - b.__k);
  for (const it of items) {
    const kk = keyFn(it);
    if (heap.size < k) {
      heap.push({ __k: kk, value: it });
    } else if (kk > heap.peek().__k) {
      heap.pop();
      heap.push({ __k: kk, value: it });
    }
  }
  return heap
    .toSortedArray()
    .reverse()
    .map((x) => x.value);
}

module.exports = { MinHeap, topK };

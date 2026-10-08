"use strict";
/**
 * LRU cache backed by a Map (insertion order = recency).
 * O(1) get/put with eviction of the least-recently-used entry.
 */
class LRUCache {
  constructor(max = 500) {
    this.max = max;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  get(key) {
    if (!this.map.has(key)) {
      this.misses++;
      return undefined;
    }
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);
    this.hits++;
    return val;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
  get size() {
    return this.map.size;
  }
}

module.exports = { LRUCache };

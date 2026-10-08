"use strict";
/**
 * Prefix tree (Trie) for autocomplete.
 * Each terminal node stores a weight (popularity/frequency) so suggestions can
 * be ranked. Prefix lookup is O(m) in the length of the prefix.
 */
class TrieNode {
  constructor() {
    this.children = new Map();
    this.isWord = false;
    this.weight = 0;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word, weight = 1) {
    if (!word) return;
    let node = this.root;
    for (const ch of word) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
      }
      node = next;
    }
    node.isWord = true;
    node.weight += weight;
  }

  _collect(node, prefix, out) {
    if (node.isWord) out.push({ word: prefix, weight: node.weight });
    for (const [ch, child] of node.children) {
      this._collect(child, prefix + ch, out);
    }
  }

  suggest(prefix, limit = 8) {
    const p = String(prefix || "").toLowerCase();
    if (!p) return [];
    let node = this.root;
    for (const ch of p) {
      node = node.children.get(ch);
      if (!node) return [];
    }
    const out = [];
    this._collect(node, p, out);
    out.sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word));
    return out.slice(0, limit);
  }
}

module.exports = { Trie };

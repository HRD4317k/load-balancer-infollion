const crypto = require("crypto");

class ConsistentHashRing {
  constructor(replicas = 150) {
    this.replicas = replicas;
    this.ring = new Map();
    this.sortedKeys = [];
    this.nodes = new Map();
  }

  _hash(key) {
    return parseInt(
      crypto.createHash("md5").update(String(key)).digest("hex").slice(0, 8),
      16
    );
  }

  _rebuildSortedKeys() {
    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  addNode(name, weight = 1) {
    if (this.nodes.has(name)) {
      this.removeNode(name);
    }
    this.nodes.set(name, weight);
    const virtualCount = this.replicas * weight;
    for (let i = 0; i < virtualCount; i++) {
      const hash = this._hash(`${name}#VNode-${i}`);
      this.ring.set(hash, name);
    }
    this._rebuildSortedKeys();
  }

  removeNode(name) {
    const weight = this.nodes.get(name) || 1;
    const virtualCount = this.replicas * weight;
    for (let i = 0; i < virtualCount; i++) {
      const hash = this._hash(`${name}#VNode-${i}`);
      this.ring.delete(hash);
    }
    this.nodes.delete(name);
    this._rebuildSortedKeys();
  }

  getNode(key) {
    if (this.sortedKeys.length === 0) return null;

    const hash = this._hash(key);

    let lo = 0,
      hi = this.sortedKeys.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.sortedKeys[mid] < hash) lo = mid + 1;
      else hi = mid;
    }

    const idx = lo % this.sortedKeys.length;
    return this.ring.get(this.sortedKeys[idx]);
  }

  getNodes() {
    return Array.from(this.nodes.entries()).map(([name, weight]) => ({
      name,
      weight,
    }));
  }

  get ringSize() {
    return this.sortedKeys.length;
  }

  distribution() {
    const counts = {};
    for (const [, nodeName] of this.ring) {
      counts[nodeName] = (counts[nodeName] || 0) + 1;
    }
    return counts;
  }
}

module.exports = ConsistentHashRing;

/**
 * consistentHash.js
 *
 * Implements a Consistent Hash Ring with virtual nodes.
 *
 * WHY CONSISTENT HASHING?
 * - Same IP always maps to the same node (session affinity)
 * - Adding/removing nodes only reassigns ~1/N of traffic (not everything)
 * - Virtual nodes ensure even distribution across the ring
 * - Supports weighted routing via variable virtual node counts
 *
 * ALGORITHM:
 *   1. Each real node gets (REPLICAS × weight) virtual positions on a circular ring
 *   2. To route an IP: hash it → walk clockwise → land on nearest virtual node
 *   3. Virtual node → real node mapping is looked up from the ring
 */

const crypto = require("crypto");

class ConsistentHashRing {
  constructor(replicas = 150) {
    this.replicas = replicas;   // virtual nodes per unit weight
    this.ring = new Map();      // hash → nodeName
    this.sortedKeys = [];       // sorted list of all hashes on ring
    this.nodes = new Map();     // nodeName → weight
  }

  // ---------- PRIVATE ----------

  /** MD5-based integer hash – fast and evenly distributed */
  _hash(key) {
    return parseInt(
      crypto.createHash("md5").update(String(key)).digest("hex").slice(0, 8),
      16
    );
  }

  /** Re-sort ring keys after any topology change */
  _rebuildSortedKeys() {
    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  // ---------- PUBLIC ----------

  /**
   * Add a node to the ring.
   * @param {string} name   - Node identifier, e.g. "Node-A"
   * @param {number} weight - Relative weight (default 1). Weight 3 = 3× virtual nodes.
   */
  addNode(name, weight = 1) {
    if (this.nodes.has(name)) {
      this.removeNode(name); // re-add with new weight
    }
    this.nodes.set(name, weight);
    const virtualCount = this.replicas * weight;
    for (let i = 0; i < virtualCount; i++) {
      const hash = this._hash(`${name}#VNode-${i}`);
      this.ring.set(hash, name);
    }
    this._rebuildSortedKeys();
  }

  /**
   * Remove a node from the ring (all its virtual positions).
   * @param {string} name
   */
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

  /**
   * Find the node responsible for a given key (IP address).
   * Walks clockwise on the ring; wraps around at the end.
   * Returns null if the ring is empty.
   * @param {string} key
   * @returns {string|null}
   */
  getNode(key) {
    if (this.sortedKeys.length === 0) return null;

    const hash = this._hash(key);

    // Binary search: first position >= hash
    let lo = 0,
      hi = this.sortedKeys.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.sortedKeys[mid] < hash) lo = mid + 1;
      else hi = mid;
    }

    // Wrap around to the beginning if past the end
    const idx = lo % this.sortedKeys.length;
    return this.ring.get(this.sortedKeys[idx]);
  }

  /** Return all registered nodes with their weights */
  getNodes() {
    return Array.from(this.nodes.entries()).map(([name, weight]) => ({
      name,
      weight,
    }));
  }

  /** Total virtual positions on the ring */
  get ringSize() {
    return this.sortedKeys.length;
  }

  /**
   * Debug: show how many virtual slots each node holds.
   * Useful for verifying weight distribution.
   */
  distribution() {
    const counts = {};
    for (const [, nodeName] of this.ring) {
      counts[nodeName] = (counts[nodeName] || 0) + 1;
    }
    return counts;
  }
}

module.exports = ConsistentHashRing;

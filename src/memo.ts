/**
 * A cache with a bound, for the ones here that are keyed by a number the caller chose.
 *
 * `pow10` used to grow its table to whatever index it was asked for, and eight bytes of
 * input could end the process with an allocation failure. That was one cache. There were
 * four, each keyed by a working width or an exponent, and not one of them said how large
 * it was allowed to become. A bound that is an argument is one a reader sees and a
 * reviewer can argue with, and `grep memo src` finds every place there is one.
 *
 * Eviction drops the oldest rather than emptying the map. Some of these entries cost a
 * series to rebuild, and throwing all of them away to make room for one would turn a
 * bound into a stall.
 */
export function memo<T>(bound: number, compute: (k: number) => T): (k: number) => T {
  const held = new Map<number, T>();
  return (k: number): T => {
    const hit = held.get(k);
    if (hit !== undefined) return hit;
    const value = compute(k);
    if (held.size >= bound) for (const oldest of held.keys()) { held.delete(oldest); break; }
    held.set(k, value);
    return value;
  };
}

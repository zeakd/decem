// The measurement protocol, and the authority for it. A number quoted anywhere should
// have come from here.
//
//   cold run     the first execution is recorded separately, since it is unoptimised
//   warmup       run until timings settle, then discard those
//   correction   subtract the cost of an empty loop
//   median       of several rounds, because a mean follows outliers
//   IQR gate     an interquartile range above 15% of the median marks the measurement
//                noisy and removes it from judgement, so jitter does not read as change

const ROUNDS = 9;
const IQR_LIMIT = 0.15;

function quantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function timeOne(fn, iters) {
  const t = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return performance.now() - t;
}

export function measure(fn, { iters = 1000 } = {}) {
  const cold = timeOne(fn, 1) * 1e6;                       // ns, single execution
  for (let i = 0; i < 3; i++) timeOne(fn, iters);          // warmup, discarded
  const noop = () => {};
  const overhead = timeOne(noop, iters) / iters;
  const samples = [];
  for (let r = 0; r < ROUNDS; r++)
    samples.push(Math.max(timeOne(fn, iters) / iters - overhead, 0) * 1e6);
  samples.sort((a, b) => a - b);
  const median = quantile(samples, 0.5);
  const iqr = quantile(samples, 0.75) - quantile(samples, 0.25);
  return { ns: median, iqrRatio: median > 0 ? iqr / median : 0, coldNs: cold, iters };
}

export const noisy = (m) => m.iqrRatio > IQR_LIMIT;
export const IQR_THRESHOLD = IQR_LIMIT;

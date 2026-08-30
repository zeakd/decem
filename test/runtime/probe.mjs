// The probe gate D runs inside each runtime, reporting a digest and the limits.
// The workload itself lives in workload.mjs, which the browser runs unchanged.
import * as d from "../../src/index.ts";
import { runWorkload, digestOf, limitsOf } from "./workload.mjs";

const rt =
  typeof Bun !== "undefined" ? "bun/JSC"
  : typeof Deno !== "undefined" ? "deno/V8"
  : "node/V8";

const lines = runWorkload(d);
console.log(JSON.stringify({ runtime: rt, cases: lines.length, digest: digestOf(lines), ...limitsOf(d) }));

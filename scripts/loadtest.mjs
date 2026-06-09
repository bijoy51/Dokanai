#!/usr/bin/env node
/**
 * Tiny dependency-free load test. Fires `total` GET requests at a target URL
 * with `concurrency` in flight at once, then reports throughput + latency
 * percentiles. Evidence for the Scalability rubric.
 *
 * Usage:
 *   node scripts/loadtest.mjs <url> [concurrency=20] [total=200]
 *
 * Example:
 *   node scripts/loadtest.mjs https://dokanai.vercel.app/ 20 200
 */

const url = process.argv[2] || "https://dokanai.vercel.app/";
const concurrency = Number(process.argv[3] || 20);
const total = Number(process.argv[4] || 200);

const latencies = [];
let done = 0;
let ok = 0;
let failed = 0;
let nextIndex = 0;

async function oneRequest() {
  const start = performance.now();
  try {
    const res = await fetch(url, { method: "GET" });
    // Drain the body so the connection can be reused.
    await res.arrayBuffer();
    if (res.ok || res.status === 307 || res.status === 401) ok++;
    else failed++;
  } catch {
    failed++;
  } finally {
    latencies.push(performance.now() - start);
    done++;
  }
}

async function worker() {
  while (nextIndex < total) {
    nextIndex++;
    await oneRequest();
  }
}

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const wallSeconds = (performance.now() - startedAt) / 1000;

latencies.sort((a, b) => a - b);
console.log(`\nLoad test: ${url}`);
console.log(`Requests: ${done} (ok ${ok}, failed ${failed})  concurrency ${concurrency}`);
console.log(`Wall time: ${wallSeconds.toFixed(2)}s   throughput: ${(done / wallSeconds).toFixed(1)} req/s`);
console.log(
  `Latency ms — p50 ${pct(latencies, 50).toFixed(0)} · p95 ${pct(latencies, 95).toFixed(0)} · max ${latencies[latencies.length - 1].toFixed(0)}`,
);

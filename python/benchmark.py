#!/usr/bin/env python3
"""
Hydra-IDE load benchmark (stdlib only).

Measures end-to-end latency of the hydra-router API — by default the full
swarm completion pipeline (7 voting agents -> consensus), optionally the
health endpoint or assistant chat — and reports mean / p50 / p90 / p99.

Usage:
    python python/benchmark.py --url http://127.0.0.1:8214 --runs 200
    python python/benchmark.py --mode health --runs 500
    python python/benchmark.py --mode chat --runs 50 --json benchmarks/results/run.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

SAMPLE_SOURCE = (
    "def add(a, b):\n"
    "    return a + b\n"
    "\n"
    "def mul(a, b):\n"
    "    return a * b\n"
    "\n"
    "res = ad"
)


def request(url: str, payload: dict | None = None, timeout: float = 15.0) -> tuple[int, float]:
    """Perform one HTTP request; return (status, elapsed_ms)."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method="POST" if data else "GET",
    )
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:  # non-2xx still counts as a sample
        exc.read()
        status = exc.code
    elapsed = (time.perf_counter() - start) * 1000.0
    return status, elapsed


def build_call(base: str, mode: str):
    if mode == "health":
        url, payload = f"{base}/api/health", None
    elif mode == "status":
        url, payload = f"{base}/api/status", None
    elif mode == "chat":
        url = f"{base}/api/chat"
        payload = {"prompt": "review my security and performance", "filePath": None}
    else:  # complete (default)
        url = f"{base}/api/completions"
        payload = {
            "filePath": "src/bench.py",
            "lang": "python",
            "source": SAMPLE_SOURCE,
            "cursor": len(SAMPLE_SOURCE),
            "topK": 5,
        }
    return url, payload


def percentile(sorted_samples: list[float], p: float) -> float:
    if not sorted_samples:
        return 0.0
    idx = min(len(sorted_samples) - 1, max(0, round(p / 100 * (len(sorted_samples) - 1))))
    return sorted_samples[idx]


def main() -> int:
    ap = argparse.ArgumentParser(description="Hydra-IDE router benchmark")
    ap.add_argument("--url", default="http://127.0.0.1:8214", help="router base URL")
    ap.add_argument("--runs", type=int, default=200, help="number of requests")
    ap.add_argument("--concurrency", type=int, default=4, help="parallel workers")
    ap.add_argument("--mode", choices=["complete", "health", "status", "chat"], default="complete")
    ap.add_argument("--timeout", type=float, default=15.0)
    ap.add_argument("--json", dest="json_out", default=None, help="write results JSON here")
    args = ap.parse_args()

    url, payload = build_call(args.url.rstrip("/"), args.mode)

    # ---- warmup + availability check --------------------------------------
    try:
        status, warm_ms = request(url, payload, args.timeout)
    except (urllib.error.URLError, ConnectionError, OSError) as exc:
        print(f"router unreachable at {args.url}: {exc}", file=sys.stderr)
        return 2
    print(f"hydra-bench: {args.runs} x {args.mode} -> {url}  (concurrency {args.concurrency})")
    print(f"warmup: HTTP {status} in {warm_ms:.1f} ms")

    samples: list[float] = []
    errors = 0

    def one(_: int) -> None:
        nonlocal errors
        try:
            status, ms = request(url, payload, args.timeout)
            if 200 <= status < 300:
                samples.append(ms)
            else:
                errors += 1
        except Exception:
            errors += 1

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        list(pool.map(one, range(args.runs)))
    wall = time.perf_counter() - t0

    ordered = sorted(samples)
    ok = len(ordered)
    summary = {
        "mode": args.mode,
        "url": url,
        "runs": args.runs,
        "ok": ok,
        "errors": errors,
        "concurrency": args.concurrency,
        "wall_s": round(wall, 3),
        "rps": round(ok / wall, 1) if wall > 0 else 0.0,
        "mean_ms": round(statistics.fmean(ordered), 2) if ordered else None,
        "min_ms": round(ordered[0], 2) if ordered else None,
        "max_ms": round(ordered[-1], 2) if ordered else None,
        "p50_ms": round(percentile(ordered, 50), 2),
        "p90_ms": round(percentile(ordered, 90), 2),
        "p99_ms": round(percentile(ordered, 99), 2),
    }

    print("")
    print("  runs       ", summary["runs"], f"(ok {ok}, errors {errors})")
    print("  wall time  ", f"{summary['wall_s']}s", f"({summary['rps']} req/s)")
    print("  mean       ", f"{summary['mean_ms']} ms")
    print("  min / max  ", f"{summary['min_ms']} / {summary['max_ms']} ms")
    print("  p50 / p90  ", f"{summary['p50_ms']} / {summary['p90_ms']} ms")
    print("  p99        ", f"{summary['p99_ms']} ms")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(summary, fh, indent=2)
        print(f"\nresults written to {args.json_out}")
    return 0 if errors == 0 and ok > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

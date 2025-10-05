"""
Deterministic scenario runner for demo / exam:
- boots simulator with 3 regions and 10 nodes total
- runs simulation for N seconds
- forces a clock-skew anomaly on node APAC-N1 and an out-of-order injection on a random pair
- saves final snapshot and prints summary
"""

import time, os, json, random
from simulator import SIM, append_jsonl, DELIVERY_LOG, ANOMALY_LOG, SNAPSHOT_DIR

# deterministic seed for reproducibility
random.seed(42)

def setup_small_demo():
    # clear logs for clean demo
    base = os.path.dirname(__file__)
    logdir = os.path.join(base, "..", "logs")
    # do not delete existing logs in production, but for demo we clean
    # (comment these lines if you prefer to keep logs)
    try:
        for fn in ["deliveries.jsonl", "anomalies.jsonl"]:
            p = os.path.join(logdir, fn)
            if os.path.exists(p): os.remove(p)
    except Exception:
        pass

    # rebuild SIM fresh if needed (SIM is imported as a module-level singleton in simulator.py)
    # ensure there are 3 regions: Europe, US-East, APAC
    # Remove any existing nodes (for safety)
    SIM.nodes.clear(); SIM.regions.clear(); SIM.deliveries.clear(); SIM.anomalies.clear()

    regions = ["Europe", "US-East", "APAC"]
    nodes_per_region = {"Europe":4, "US-East":3, "APAC":3}
    for r in regions:
        for i in range(nodes_per_region[r]):
            # create a mild skew on the first node of APAC to force drift later
            offset = 3000 if (r=="APAC" and i==0) else (0 if random.random() < 0.9 else random.randint(-1500,1500))
            SIM.add_node(f"{r}-N{i+1}", r, offset_ms=offset)

def run_demo(duration_s=20):
    print("Setting up demo nodes...")
    setup_small_demo()
    start = time.time()
    print("Running deterministic demo for", duration_s, "seconds")
    forced_out_of_order_done = False
    while time.time() - start < duration_s:
        SIM.run_step(sends_per_step=6)
        # occasionally force an out-of-order event exactly once
        if not forced_out_of_order_done and random.random() < 0.15:
            # pick skewed node and target
            skewed = next((n for n in SIM.nodes.values() if n.offset != 0), None)
            target = random.choice(list(SIM.nodes.values()))
            if skewed and target and skewed.id != target.id:
                old_phys = int(time.time()*1000) - 15000  # make HLC old by 15s
                msg = skewed.send_update("FORCE-OLD-001", {"note":"forced-old"}, target)
                msg["hlc"]["phys"] = old_phys
                msg["id"] = f"force-{int(time.time()*1000)}"
                target.receive_update(msg)
                rec = {"arrival_ts": int(time.time()*1000), "src": skewed.id, "dst": target.id, "package_id":"FORCE-OLD-001", "hlc": msg["hlc"], "latency_ms":0, "applied": True}
                with SIM._lock:
                    SIM.deliveries.append(rec); append_jsonl(DELIVERY_LOG, rec)
                forced_out_of_order_done = True
                print("Injected forced out-of-order event:", rec)
        time.sleep(0.8)

    # take final hierarchical snapshot
    snap = SIM.hierarchical_snapshot()
    fname = os.path.join(SNAPSHOT_DIR, f"final_demo_snapshot_{int(time.time())}.json")
    with open(fname, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=2, default=str)
    print("Wrote final snapshot to", fname)

    # save summary
    summary = {"deliveries": len(SIM.deliveries), "anomalies": len(SIM.anomalies), "snapshot": fname}
    with open(os.path.join(SNAPSHOT_DIR, "run_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print("Demo complete. Summary:", summary)
    return summary

if __name__ == "__main__":
    run_demo(20)

# group2/visualizer.py
import json
import matplotlib.pyplot as plt
import os

def plot_delivery_timeline(log_path="group2/logs/delivery.log", out_path="group2/logs/delivery.png", max_events=None):
    # Reads JSON-lines with arrival_ts and hlc.phys; plots arrival vs hlc times for each event
    if not os.path.exists(log_path):
        print("Log not found:", log_path)
        return
    events = []
    with open(log_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                events.append(rec)
            except Exception:
                continue
    if not events:
        print("No deliveries found in log.")
        return
    if max_events:
        events = events[:max_events]

    # Build arrays
    arrival = [e["arrival_ts"] for e in events]
    hlc = [e["hlc"]["phys"] for e in events]
    labels = [f"{e['src']}->{e['dst']}:{e['package_id']}" for e in events]

    # normalize to seconds relative to first event for plotting
    t0 = min(min(arrival), min(hlc))
    arrival_s = [(t - t0) / 1000.0 for t in arrival]
    hlc_s = [(t - t0) / 1000.0 for t in hlc]
    idx = list(range(len(events)))

    plt.figure(figsize=(10, 6))
    plt.plot(arrival_s, idx, 'o-', label='arrival_time (s)')
    plt.plot(hlc_s, idx, 'x--', label='hlc_time (s)')
    for i, lab in enumerate(labels):
        plt.text(arrival_s[i] + 0.01, idx[i] + 0.06, lab, fontsize=8, va='bottom')

    plt.yticks([])
    plt.xlabel("Time (s, relative)")
    plt.title("Delivery Timeline — arrival vs HLC timestamp")
    plt.legend()
    plt.tight_layout()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    plt.savefig(out_path)
    plt.close()
    print(f"Saved plot to {out_path}")

# Convenience wrapper keeping older name used in demo
def plot_delivery(log_path="group2/logs/delivery.log", out_path="group2/logs/delivery.png"):
    plot_delivery_timeline(log_path, out_path)

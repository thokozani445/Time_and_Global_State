import matplotlib.pyplot as plt
import json
import os

def plot_delivery(log_path="backend/logs/delivery.jsonl", out_path="backend/logs/delivery.png"):
    if not os.path.exists(log_path):
        print("No log file")
        return
    msgs = []
    with open(log_path) as f:
        for line in f:
            if line.strip():
                msgs.append(json.loads(line))
    if not msgs:
        print("No data to plot")
        return
    xs = [m["ts"][0] for m in msgs]
    ys = [m["package"] for m in msgs]
    colors = ["blue" if m["status"]=="in-transit" else "orange" if m["status"]=="delayed" else "green" for m in msgs]
    plt.figure(figsize=(8,4))
    plt.scatter(xs, ys, c=colors)
    plt.xlabel("Timestamp (ms)")
    plt.ylabel("Package")
    plt.title("Delivery Timeline")
    plt.savefig(out_path)
    plt.close()
    print(f"Saved plot to {out_path}")

if __name__ == "__main__":
    plot_delivery()

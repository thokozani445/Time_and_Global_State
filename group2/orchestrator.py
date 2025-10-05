import time
import json
import random
import os
from .node import Node
from .snapshot import SnapshotCoordinator
from .detector import AnomalyDetector
from typing import Dict, List

# --- Define continents with time offsets to simulate clock drift ---
CONTINENT_OFFSETS = {
    "NA": 0,         # North America
    "EU": 5000,      # Europe
    "AS": 10000,     # Asia
    "AF": 15000,     # Africa
    "SA": 20000,     # South America
    "AU": 25000,     # Oceania (Australia & Pacific)
    "AN": 30000,     # Antarctica
}

def setup_global_company(orchestrator, nodes_per_region=200):
    for continent, offset in CONTINENT_OFFSETS.items():
        orchestrator.add_region(continent)
        for i in range(1, nodes_per_region + 1):
            node_id = f"{continent}-N{i}"
            orchestrator.add_node(node_id, continent, offset=offset + i * 10)

class HierarchicalOrchestrator:
    def __init__(self, log_dir="group2/logs", drift_threshold_ms=2000):
        self.nodes: Dict[str, Node] = {}
        self.node_region: Dict[str, str] = {}   # node_id -> region_id
        self.regions: Dict[str, List[str]] = {} # region_id -> list[node_id]
        self.log_dir = log_dir
        self.ws_listeners = []
        os.makedirs(self.log_dir, exist_ok=True)
        self.detector = AnomalyDetector(log_path=os.path.join(log_dir, "anomalies.jsonl"), drift_threshold=drift_threshold_ms)
        open(f"{self.log_dir}/deliveries.jsonl", "a").close()

    def add_region(self, region_id: str):
        if region_id not in self.regions:
            self.regions[region_id] = []

    def add_node(self, node_id: str, region_id: str, offset: int = 0):
        if region_id not in self.regions:
            self.add_region(region_id)
        self.nodes[node_id] = Node(node_id, offset=offset, log_dir=self.log_dir)
        self.node_region[node_id] = region_id
        self.regions[region_id].append(node_id)

    def send(self, src: str, dst: str, package_id: str, payload: dict, simulate_latency_ms: int = None):
        if src not in self.nodes or dst not in self.nodes:
            raise ValueError("Unknown src or dst node")
        send_pt = int(time.time() * 1000)
        msg = self.nodes[src].send(package_id, payload, dst, send_pt)
        latency = simulate_latency_ms if simulate_latency_ms is not None else random.randint(10, 200)
        time.sleep(latency / 1000.0)
        arrival_ts = int(time.time() * 1000)
        applied = self.nodes[dst].receive(msg, arrival_ts)
        try:
            self.detector.check_drift(dst, msg.hlc.phys, arrival_ts)
        except Exception:
            pass
        record = {
            "arrival_ts": arrival_ts,
            "src": src,
            "dst": dst,
            "package_id": package_id,
            "hlc": {"phys": msg.hlc.phys, "cnt": msg.hlc.cnt, "node": msg.hlc.node_id},
            "latency_ms": latency,
            "applied": applied,
            "src_region": self.node_region.get(src),
            "dst_region": self.node_region.get(dst)
        }
        with open(f"{self.log_dir}/deliveries.jsonl", "a") as f:
            f.write(json.dumps(record) + "\n")
        self._push_ws(record)
        return record

    # --- WebSocket listener support ---
    def register_ws_listener(self, cb):
        if cb not in self.ws_listeners:
            self.ws_listeners.append(cb)

    def unregister_ws_listener(self, cb):
        if cb in self.ws_listeners:
            self.ws_listeners.remove(cb)

    def _push_ws(self, msg):
        for cb in list(self.ws_listeners):
            try:
                cb(msg)
            except Exception:
                pass

    # ---------- hierarchical snapshot logic ----------
    def chandy_lamport_snapshot(self, snapshot_id: str = None):
        """
        Implements Chandy-Lamport snapshot semantics:
        - Captures local state of each node
        - Captures all inflight messages (sent but not yet received)
        """
        snapshot = {    
            "nodes": {},
            "inflight": []
        }
        # 1. Capture local state of each node
        for node_id, node in self.nodes.items():
            snapshot["nodes"][node_id] = {
                "state": dict(getattr(node, "state", {})),  # copy of local state
                "region": self.node_region.get(node_id),
                "hlc": getattr(node, "hlc", None),
            }
            # 2. Capture inflight messages for this node
            # Assume node.inflight is a dict: {package_id: message}
            for pkg_id, msg in getattr(node, "inflight", {}).items():
                # Only include messages that have not yet been received
                snapshot["inflight"].append({
                    "from": getattr(msg, "src", None),
                    "to": getattr(msg, "dst", None),
                    "package_id": pkg_id,
                    "hlc": getattr(msg, "hlc", None),
                    "payload": getattr(msg, "payload", None),
                    "sent_ts": getattr(msg, "sent_ts", None),
                    "src_region": self.node_region.get(getattr(msg, "src", None)),
                    "dst_region": self.node_region.get(getattr(msg, "dst", None))
                })

        # Save snapshot to file
        global_fname = f"{self.log_dir}/global_snapshot.json"
        with open(global_fname, "w") as f:
            json.dump(snapshot, f, indent=2)
        return snapshot
    
    def region_local_snapshot(self, region_id: str, snapshot_id: str = None):
        if region_id not in self.regions:
            raise ValueError("Unknown region")
        sc = SnapshotCoordinator(log_dir=self.log_dir)
        for node_id in self.regions[region_id]:
            sc.record_local(node_id, self.nodes[node_id].state)
        region_snapshot = sc.merge_snapshots()
        fname = f"{self.log_dir}/region_{region_id}_snapshot.json"
        with open(fname, "w") as f:
            json.dump(region_snapshot, f, indent=2)
        return region_snapshot

    def hierarchical_snapshot(self, snapshot_id: str = None):
        region_snapshots = {}
        for region_id in self.regions:
            region_snapshots[region_id] = self.region_local_snapshot(region_id, snapshot_id)

        merged = {}
        for region_id, region_state in region_snapshots.items():
            for pkg, info in region_state.items():
                if pkg not in merged:
                    merged[pkg] = info
                else:
                    a_phys, a_cnt = merged[pkg]["hlc"]
                    b_phys, b_cnt = info["hlc"]
                    if (b_phys, b_cnt) > (a_phys, a_cnt):
                        merged[pkg] = info
                    elif (b_phys, b_cnt) == (a_phys, a_cnt):
                        cur_node = merged[pkg].get("node", "")
                        cand_node = info.get("node", "")
                        if f"{region_id}:{cand_node}" < f"{self.node_region.get(cur_node,'') or ''}:{cur_node}":
                            merged[pkg] = info

        global_fname = f"{self.log_dir}/global_snapshot.json"
        with open(global_fname, "w") as f:
            json.dump(merged, f, indent=2)
        return merged

    def snapshot_and_diff(self, snapshot_id: str = None):
        prev_global = None
        global_path = f"{self.log_dir}/global_snapshot.json"
        if os.path.exists(global_path):
            try:
                prev_global = json.load(open(global_path, "r"))
            except Exception:
                prev_global = None

        merged = self.hierarchical_snapshot(snapshot_id)
        diffs = {"added": [], "updated": [], "removed": []}
        if prev_global is None:
            diffs["added"] = list(merged.keys())
        else:
            prev_keys = set(prev_global.keys())
            cur_keys = set(merged.keys())
            diffs["added"] = sorted(list(cur_keys - prev_keys))
            diffs["removed"] = sorted(list(prev_keys - cur_keys))
            for k in cur_keys & prev_keys:
                a = prev_global[k]["hlc"]
                b = merged[k]["hlc"]
                if tuple(b) > tuple(a):
                    diffs["updated"].append(k)
        diff_fname = f"{self.log_dir}/snapshot_diff.json"
        with open(diff_fname, "w") as f:
            json.dump(diffs, f, indent=2)
        return merged, diffs
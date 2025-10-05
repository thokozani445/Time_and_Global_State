# group2/snapshot.py
import json
from collections import defaultdict
import os

class SnapshotCoordinator:
    def __init__(self, log_dir="group2/logs"):
        self.snapshots = defaultdict(dict)
        self.log_dir = log_dir
        os.makedirs(self.log_dir, exist_ok=True)

    def record_local(self, node_id: str, state: dict):
        # copy snapshot so later updates don't mutate
        self.snapshots[node_id] = dict(state)

    def merge_snapshots(self):
        """
        Merge snapshots in self.snapshots dictionary using HLC tuple ordering.
        Each node_state is package_id -> {hlc: (phys,cnt), payload, node}
        """
        merged = {}
        for node_state in self.snapshots.values():
            for pkg, info in node_state.items():
                existing = merged.get(pkg)
                if not existing:
                    merged[pkg] = info
                else:
                    a_phys, a_cnt = existing["hlc"]
                    b_phys, b_cnt = info["hlc"]
                    if (b_phys, b_cnt) > (a_phys, a_cnt):
                        merged[pkg] = info
                    elif (b_phys, b_cnt) == (a_phys, a_cnt):
                        # deterministic tie: choose node with lexicographically smaller node id
                        if info.get("node", "") < existing.get("node", ""):
                            merged[pkg] = info
        # do not write file here (higher-level orchestrator handles files)
        return merged

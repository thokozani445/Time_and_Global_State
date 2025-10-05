# === group2/tests/test_scenarios.py ===
import os, json, time
from group2.clock import HLC
from group2.orchestrator import Orchestrator

def test_hlc_monotonicity():
    hlc = HLC()
    stamps = [hlc.now(1), hlc.now(1), hlc.now(2)]
    assert stamps[0] <= stamps[1] <= stamps[2]

def test_snapshot_and_anomaly(tmp_path):
    log_dir = tmp_path
    orch = Orchestrator(log_dir=log_dir)
    orch.add_node("A", offset=0)
    orch.add_node("B", offset=100)
    orch.send("A", "B", "pkg1", {"temp": 22})
    orch.send("B", "A", "pkg2", {"temp": 23})
    snap = orch.take_snapshot()
    assert "pkg1" in snap and "pkg2" in snap
    assert os.path.exists(f"{log_dir}/anomalies.jsonl")

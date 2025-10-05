import os
import json
import pytest
from backend.simulator import Orchestrator

def test_snapshot_and_log(tmp_path):
    log_dir = tmp_path / "logs"
    orch = Orchestrator(log_dir=str(log_dir))
    orch.add_node("A")
    orch.add_node("B", offset=2000)

    orch.send("A", "B", "pkgX", "in-transit")
    orch.send("B", "A", "pkgX", "delivered")

    snap = orch.take_snapshot()
    assert "A" in snap and "B" in snap

    log_file = log_dir / "delivery.log"
    assert log_file.exists()
    with open(log_file) as f:
        lines = f.readlines()
    assert any("pkgX" in l for l in lines)

import time
import threading
import json
import os

class HybridLogicalClock:
    def __init__(self, offset=0):
        self.physical = int(time.time() * 1000) + offset
        self.counter = 0
        self.lock = threading.Lock()

    def now(self):
        with self.lock:
            now = int(time.time() * 1000)
            if now > self.physical:
                self.physical = now
                self.counter = 0
            else:
                self.counter += 1
            return (self.physical, self.counter)

    def update(self, other):
        with self.lock:
            phys, cnt = other
            self.physical = max(self.physical, phys)
            if self.physical == phys:
                self.counter = max(self.counter, cnt) + 1
            else:
                self.counter = 0
            return (self.physical, self.counter)

class SimNode:
    def __init__(self, name, offset=0):
        self.name = name
        self.hlc = HybridLogicalClock(offset)
        self.state = {}
        self.inflight = []

    def send_update(self, target, package, status):
        stamp = self.hlc.now()
        msg = {
            "ts": stamp,
            "from": self.name,
            "to": target.name,
            "package": package,
            "status": status
        }
        target.receive_update(msg)
        return msg

    def receive_update(self, msg):
        self.hlc.update(msg["ts"])
        self.state[msg["package"]] = msg
        self.inflight.append(msg)

class Orchestrator:
    def __init__(self, log_dir="backend/logs"):
        self.nodes = {}
        self.lock = threading.Lock()
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        self.log_path = os.path.join(log_dir, "deliveries.jsonl")  # <-- fixed name
        open(self.log_path, "w").close()
        self.ws_listeners = []
        self.ws_lock = threading.Lock()

    def add_node(self, name, offset=0):
        self.nodes[name] = SimNode(name, offset)

    def send(self, src, dst, package, status):
        if src not in self.nodes or dst not in self.nodes:
            raise ValueError("Invalid nodes")
        msg = self.nodes[src].send_update(self.nodes[dst], package, status)
        self._log(msg)
        self._push_ws(msg)
        return msg

    def _log(self, msg):
        with self.lock:
            with open(self.log_path, "a") as f:
                f.write(json.dumps(msg) + "\n")

    def _push_ws(self, msg):
        with self.ws_lock:
            for cb in list(self.ws_listeners):
                try:
                    cb(msg)
                except Exception:
                    pass

    def register_ws_listener(self, cb):
        with self.ws_lock:
            self.ws_listeners.append(cb)

    def unregister_ws_listener(self, cb):
        with self.ws_lock:
            if cb in self.ws_listeners:
                self.ws_listeners.remove(cb)

    def take_snapshot(self):
        snap = {n: node.state for n, node in self.nodes.items()}
        snap_path = os.path.join(self.log_dir, "snapshot.json")
        with open(snap_path, "w") as f:
            json.dump(snap, f, indent=2)
        return snap

class AnomalyDetector:
    def __init__(self, log_path):
        self.log_path = log_path

    def check_anomalies(self):
        anomalies = []
        if not os.path.exists(self.log_path):
            return anomalies
        with open(self.log_path) as f:
            lines = f.readlines()
        msgs = [json.loads(l) for l in lines if l.strip()]
        msgs.sort(key=lambda m: (m["ts"][0], m["ts"][1]))
        for i in range(1, len(msgs)):
            prev, curr = msgs[i-1], msgs[i]
            if curr["ts"][0] < prev["ts"][0]:
                anomalies.append({"type": "out-of-order", "at": curr})
            if abs(curr["ts"][0] - prev["ts"][0]) > 2000:
                anomalies.append({"type": "drift", "between": [prev, curr]})
        return anomalies
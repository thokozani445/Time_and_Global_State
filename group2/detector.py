import json
import os

class AnomalyDetector:
    def __init__(self, log_path="group2/logs/anomalies.jsonl", drift_threshold=2000):
        self.drift_threshold = drift_threshold
        self.log_path = log_path
        self.log_dir = os.path.dirname(log_path)
        os.makedirs(self.log_dir, exist_ok=True)
        # ensure anomalies file exists
        open(self.log_path, "a").close()

    def check_drift(self, node_id, hlc_wall, physical_time):
        drift = abs(hlc_wall - physical_time)
        if drift > self.drift_threshold:
            anomaly = {
                "type": "drift",
                "node": node_id,
                "drift_ms": drift,
                "hlc_wall": hlc_wall,
                "arrival": physical_time
            }
            self._record(anomaly)
            return anomaly
        return None

    def check_anomalies(self):
        anomalies = []
        if not os.path.exists(self.log_path):
            return anomalies
        with open(self.log_path) as f:
            lines = f.readlines()
        msgs = [json.loads(l) for l in lines if l.strip()]
        # Only sort if "ts" is present
        msgs_with_ts = [m for m in msgs if "ts" in m]
        msgs_with_ts.sort(key=lambda m: (m["ts"][0], m["ts"][1]))
        for i in range(1, len(msgs_with_ts)):
            prev, curr = msgs_with_ts[i-1], msgs_with_ts[i]
            if curr["ts"][0] < prev["ts"][0]:
                anomalies.append({"type": "out-of-order", "at": curr})
            if abs(curr["ts"][0] - prev["ts"][0]) > self.drift_threshold:
                anomalies.append({"type": "drift", "between": [prev, curr]})
        return anomalies

    def check_out_of_order(self, stored_hlc, received_hlc, package_id):
        if (received_hlc["phys"], received_hlc["cnt"]) < (stored_hlc["phys"], stored_hlc["cnt"]):
            anomaly = {
                "type": "out_of_order",
                "package": package_id,
                "stored": stored_hlc,
                "received": received_hlc
            }
            self._record(anomaly)
            return anomaly
        return None

    def _record(self, anomaly):
        with open(self.log_path, "a") as f:
            f.write(json.dumps(anomaly) + "\n")

    @staticmethod
    def summarize_region_drifts(log_dir="group2/logs"):
        path = f"{log_dir}/anomalies.jsonl"
        if not os.path.exists(path):
            return {}
        summary = {}
        for line in open(path):
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if rec.get("type") != "drift":
                continue
            node = rec.get("node")
            summary[node] = summary.get(node, 0) + 1
        return summary
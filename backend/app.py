import asyncio
import uvicorn
import json
import os
import sys
import time
import random
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

# Import group2 logic
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from group2.orchestrator import HierarchicalOrchestrator, setup_global_company
from group2.detector import AnomalyDetector

app = FastAPI()

# CORS for dev (allowing Vite dev server etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Log directory setup
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
DELIVERY_LOG = os.path.join(LOG_DIR, "deliveries.jsonl")
ANOMALY_LOG = os.path.join(LOG_DIR, "anomalies.jsonl")
SNAPSHOT_LOG = os.path.join(LOG_DIR, "global_snapshot.json")

# Instantiate orchestrator with global regions/continents and thousands of nodes
orch = HierarchicalOrchestrator(log_dir=LOG_DIR)
if not orch.nodes:
    setup_global_company(orch, nodes_per_region=200)  # 200 nodes per continent

# --- API Endpoints ---

@app.get("/regions")
def regions():
    # Return region summary: region name, node count, package count, inflight count
    summary = {}
    for region_id, node_ids in orch.regions.items():
        nodes = [orch.nodes[nid] for nid in node_ids]
        tot_pkgs = sum(len(n.state) if hasattr(n, "state") else 0 for n in nodes)
        tot_inflight = sum(len(n.inflight) if hasattr(n, "inflight") else 0 for n in nodes)
        summary[region_id] = {
            "region": region_id,
            "nodes": len(node_ids),
            "packages": tot_pkgs,
            "inflight": tot_inflight
        }
    return summary

@app.get("/deliveries")
def deliveries(limit: int = 200):
    recs = []
    if os.path.exists(DELIVERY_LOG):
        try:
            with open(DELIVERY_LOG, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        recs.append(json.loads(line))
                    except Exception:
                        continue
        except Exception:
            recs = []
    recs = recs[-limit:]
    return {"count": len(recs), "recent": recs}

@app.get("/anomalies")
def anomalies(limit: int = 200):
    anomaly_log_path = os.path.join(LOG_DIR, "anomalies.jsonl")
    detector = AnomalyDetector(log_path=anomaly_log_path)
    recs = detector.check_anomalies()
    return {"count": len(recs), "recent": recs[-limit:]}

@app.get("/snapshot")
def snapshot():
    if os.path.exists(SNAPSHOT_LOG):
        with open(SNAPSHOT_LOG, "r") as f:
            return json.load(f)
    return {}

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    stopped = False

    async def push_msg_to_client(msg):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    def orch_cb(msg):
        try:
            asyncio.create_task(push_msg_to_client(msg))
        except Exception:
            pass

    orch.register_ws_listener(orch_cb)

    try:
        try:
            await ws.send_json({"type": "info", "payload": "connected"})
        except Exception:
            pass

        while True:
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            orch.unregister_ws_listener(orch_cb)
        except Exception:
            pass

# --- Simulate Deliveries in Background ---
@app.on_event("startup")
async def startup_event():
    async def simulate_deliveries():
        package_states = ["CREATED", "SENT", "IN_TRANSIT", "RECEIVED", "DELIVERED"]
        while True:
            src = random.choice(list(orch.nodes.keys()))
            dst = random.choice(list(orch.nodes.keys()))
            if src != dst:
                # Send several packages before receiving
                packages = []
                for _ in range(5):  # Send 5 packages in a batch
                    pkg = f"PKG{int(time.time())%100000}_{random.randint(1000,9999)}"
                    for state in package_states[:-1]:  # All states except DELIVERED
                        status = {"status": state}
                        try:
                            msg = orch.send(src, dst, pkg, status)
                        except Exception:
                            pass
                        await asyncio.sleep(0.2)
                    packages.append(pkg)
                # Now deliver all packages (final state)
                for pkg in packages:
                    status = {"status": "DELIVERED"}
                    try:
                        orch.send(src, dst, pkg, status)
                    except Exception:
                        pass
                    await asyncio.sleep(0.2)
            await asyncio.sleep(1)

    async def periodic_snapshot():
        while True:
            try:
                orch.chandy_lamport_snapshot()
            except Exception:
                pass
            await asyncio.sleep(60)  # every 60 seconds

    asyncio.create_task(simulate_deliveries())
    asyncio.create_task(periodic_snapshot())

# --- Mount frontend LAST ---
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
# Global Distributed Delivery Simulator

This project simulates a global distributed system for package delivery, demonstrating key concepts in distributed systems such as clock drift, message passing, anomaly detection, and distributed snapshots (Chandy-Lamport).

## Features

- **Global Simulation:** Thousands of nodes across continents, each with simulated clock drift.
- **Package Lifecycle:** Packages move through all states (`CREATED`, `SENT`, `IN_TRANSIT`, `RECEIVED`, `DELIVERED`).
- **Chandy-Lamport Snapshots:** Periodic distributed snapshots capturing both node states and inflight (in-transit) messages.
- **Anomaly Detection:** Real-time detection of anomalies (clock drift, out-of-order, duplicates, etc.).
- **Live Dashboard:** React frontend visualizes regions, package status, anomalies, and inflight deliveries.
- **Automation:** Simulation and snapshotting run indefinitely; no manual intervention required.

## How It Works

- **Backend:**  
  Built with FastAPI, simulates package deliveries, detects anomalies, and periodically records distributed snapshots.
- **Frontend:**  
  Built with React, displays live system state, region summaries, package timelines, anomalies, and inflight packages.
- **Chandy-Lamport Snapshot:**  
  Captures the local state of each node and all messages sent but not yet received (inflight), providing a consistent global view.

## Getting Started

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/global-delivery-simulator.git
   cd global-delivery-simulator
   ```

2. **Install backend dependencies:**
   ```sh
   pip install -r requirements.txt
   ```

3. **Start the backend server:**
   ```sh
   uvicorn backend.app:app --host 0.0.0.0 --port 8000
   ```

4. **Install frontend dependencies:**
   ```sh
   cd frontend
   npm install
   npm run dev
   ```

5. **Open your browser:**  
   Visit [http://localhost:5173](http://localhost:5173) (or the port shown in your terminal).

## Project Structure

```
backend/
  app.py                # FastAPI server
  group2/
    orchestrator.py     # Orchestrator logic
    node.py             # Node logic (tracks state and inflight)
    detector.py         # Anomaly detection
    snapshot.py         # Snapshot coordinator
frontend/
  src/
    App.jsx             # Main React app
    components/         # UI components
logs/
  deliveries.jsonl      # Delivery event log
  anomalies.jsonl       # Anomaly log
  global_snapshot.json  # Chandy-Lamport snapshot
```

## Customization

- **Nodes per region:**  
  Adjust in `setup_global_company()` in `orchestrator.py`.
- **Snapshot interval:**  
  Change the interval in `app.py` (`periodic_snapshot`).
- **Anomaly sensitivity:**  
  Adjust drift threshold in `AnomalyDetector`.

## License

MIT License

---

**Mission:**  
Demonstrate distributed systems concepts in a realistic, observable, and extensible simulation platform.
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import RegionPanel from "./components/RegionPanel";
import Timeline from "./components/Timeline";
import Anomalies from "./components/Anomalies";
import SnapshotViewer from "./components/SnapshotViewer";
import Controls from "./components/Controls";
import ConnectionStatus from "./components/ConnectionStatus";
import { ToastContainer, toast } from "react-toastify";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// WebSocket base: robust handling for http/https
const defaultWsBase =
  (import.meta.env.VITE_WS_URL &&
    import.meta.env.VITE_WS_URL.replace(/\/+$/, "")) ||
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
const WS_BASE = defaultWsBase;

export default function App() {
  const [regions, setRegions] = useState({});
  const [deliveries, setDeliveries] = useState([]); // newest first
  const [anomalies, setAnomalies] = useState([]);
  const [wsStatus, setWsStatus] = useState("connecting");

  const wsRef = useRef(null);
  const deliveriesRef = useRef(new Map()); // package_id@arrival_ts -> latest event (for dedupe)

  const MAX_EVENTS = 1000;

  // --- Normalize regions for safety ---
  function normalizeRegions(raw) {
    if (!raw) return {};
    if (Array.isArray(raw)) {
      if (raw.every((x) => typeof x === "string")) {
        return {
          all: {
            region: "all",
            nodes: raw.length,
            packages: 0,
            inflight: 0,
          },
        };
      }
      const m = {};
      raw.forEach((o) => {
        if (o && o.region) m[o.region] = o;
      });
      return m;
    }
    if (typeof raw === "object") return raw;
    return {};
  }

  // --- Reconcile: fetch backend state ---
  const reconcile = useCallback(async () => {
    try {
      const r = await fetch(`${API}/regions`);
      if (!r.ok) throw new Error("regions fetch failed");
      const regionsJson = await r.json();
      setRegions(regionsJson);

      const d = await fetch(`${API}/deliveries?limit=500`);
      const dj = await d.json();
      const recent = dj.recent || [];

      recent.forEach((rec) => {
        const key = `${rec.package_id}@${rec.arrival_ts}`;
        if (!deliveriesRef.current.has(key)) {
          deliveriesRef.current.set(key, rec);
        }
      });

      const merged = Array.from(deliveriesRef.current.values())
        .sort((a, b) => b.arrival_ts - a.arrival_ts)
        .slice(0, MAX_EVENTS);
      setDeliveries(merged);

      const a = await fetch(`${API}/anomalies?limit=200`);
      const aj = await a.json();
      setAnomalies(aj.recent || []);

      setWsStatus((prev) => (prev === "connecting" ? "connected" : prev));
    } catch (err) {
      setWsStatus("disconnected");
      console.error("reconcile error", err);
    }
  }, []);

  // --- Setup WebSocket on mount ---
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
    };

    ws.onerror = (err) => {
      console.error("WebSocket error", err);
      setWsStatus("disconnected");
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "anomaly") {
          setAnomalies((prev) => [data, ...prev].slice(0, 200));
          toast.warn(`New anomaly detected: ${data.message || "unknown"}`);
        } else if (data.type === "delivery") {
          const key = `${data.package_id}@${data.arrival_ts}`;
          if (!deliveriesRef.current.has(key)) {
            deliveriesRef.current.set(key, data);
            setDeliveries((prev) =>
              [data, ...prev].slice(0, MAX_EVENTS)
            );
          }
        }
      } catch (err) {
        console.error("ws message parse error", err);
      }
    };

    reconcile(); // initial load

    return () => {
      ws.close();
    };
  }, [reconcile]);

  // --- Compute latest status for each package ---
  const packageStatusMap = useMemo(() => {
    const statusMap = new Map();
    deliveries.forEach((rec) => {
      // Use package_id as key, keep the latest event (by arrival_ts)
      const prev = statusMap.get(rec.package_id);
      if (!prev || rec.arrival_ts > prev.arrival_ts) {
        statusMap.set(rec.package_id, rec);
      }
    });
    return statusMap;
  }, [deliveries]);

  // --- Compute bar chart data (memoized) ---
  const barData = useMemo(() => {
    const regionObj = normalizeRegions(regions);
    return Object.values(regionObj).map((r) => ({
      region:
        r.region || (typeof r === "string" ? r : "unknown"),
      packages:
        r.packages || r.packages === 0
          ? r.packages
          : r.packages_count || 0,
      inflight: r.inflight || 0,
    }));
  }, [regions]);

  // --- UI ---
  return (
    <div className="container">
      <ToastContainer position="top-right" />
      <div className="header">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <h1 style={{ margin: 0 }}>Global Delivery Simulator</h1>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            live demo
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ConnectionStatus status={wsStatus} />
          <Controls onRefresh={reconcile} />
        </div>
      </div>

      <div className="grid">
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 className="h3">Packages by Region</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <XAxis dataKey="region" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="packages" fill="#2563eb" />
                  <Bar dataKey="inflight" fill="#f97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <RegionPanel regions={regions} />

          <div style={{ height: 12 }} />

          <Timeline
            deliveries={deliveries}
            anomalies={anomalies}
            packageStatusMap={packageStatusMap}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Anomalies anomalies={anomalies} />
          <SnapshotViewer api={API} />
        </div>
      </div>
    </div>
  );
}
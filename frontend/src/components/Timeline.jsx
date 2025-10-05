import React, { useState, useMemo } from "react";
import { FixedSizeList as List } from "react-window";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import PackageModal from "./PackageModal";

dayjs.extend(relativeTime);

function AnomBadge({ type }) {
  if (!type) return null;
  const cls =
    type === "drift"
      ? "anom-warn"
      : type === "out_of_order"
      ? "anom-crit"
      : "anom-info";
  return <span className={`anomaly-badge ${cls}`}>{type.toUpperCase()}</span>;
}

export default function Timeline({
  deliveries = [],
  anomalies = [],
  packageStatusMap = new Map(),
}) {
  const [filter, setFilter] = useState({ q: "", region: "", anomaly: "" });
  const [selected, setSelected] = useState(null);

  // build a quick map of anomalies by package for badge display
  const anomalyMap = useMemo(() => {
    const m = new Map();
    for (const a of anomalies) {
      if (a.package) m.set(a.package, a);
    }
    return m;
  }, [anomalies]);

  // Get all unique regions for filter dropdown
  const regionOptions = useMemo(() => {
    const regions = new Set();
    deliveries.forEach((d) => {
      if (d.src_region) regions.add(d.src_region);
      if (d.dst_region) regions.add(d.dst_region);
    });
    return Array.from(regions);
  }, [deliveries]);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (
        q &&
        !(
          d.package_id.toLowerCase().includes(q) ||
          (d.src && d.src.toLowerCase().includes(q)) ||
          (d.dst && d.dst.toLowerCase().includes(q))
        )
      )
        return false;
      if (
        filter.region &&
        ![d.src_region, d.dst_region].includes(filter.region)
      )
        return false;
      if (filter.anomaly && !anomalyMap.get(d.package_id)) return false;
      return true;
    });
  }, [deliveries, filter, anomalyMap]);

  const Row = ({ index, style }) => {
    const d = filtered[index];
    if (!d) return null;
    const timeRel = dayjs(d.arrival_ts).fromNow();
    const an = anomalyMap.get(d.package_id);

    // Get latest status for this package from packageStatusMap if available
    const latestStatus =
      packageStatusMap.get(d.package_id)?.payload?.status || d.payload?.status;

    return (
      <div
        style={style}
        className="timeline-item"
        onClick={() => setSelected(d)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>
            {d.src} ({d.src_region}) → {d.dst} ({d.dst_region}) • {d.package_id}
          </div>
          <div className="timeline-meta">
            Status: <b>{latestStatus || "—"}</b> • {timeRel}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {new Date(d.arrival_ts).toLocaleTimeString()}
          </div>
          <div style={{ marginTop: 6 }}>
            <AnomBadge type={an?.type} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <h3 className="h3">Recent Deliveries (live)</h3>
      <div className="filter-row">
        <input
          className="input"
          placeholder="Search package / node"
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
        />
        <select
          className="input"
          value={filter.region}
          onChange={(e) => setFilter({ ...filter, region: e.target.value })}
        >
          <option value="">All regions</option>
          {regionOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filter.anomaly}
          onChange={(e) => setFilter({ ...filter, anomaly: e.target.value })}
        >
          <option value="">All</option>
          <option value="anomaly">Has Anomaly</option>
        </select>
      </div>

      <div style={{ height: 320, marginTop: 8 }}>
        {filtered.length === 0 ? (
          <div className="small">No deliveries yet</div>
        ) : (
          <List
            height={320}
            itemCount={filtered.length}
            itemSize={78}
            width="100%"
          >
            {Row}
          </List>
        )}
      </div>

      {selected && (
        <PackageModal item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
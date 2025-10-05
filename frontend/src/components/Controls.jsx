import SnapshotButton from "./SnapshotButton";

export default function Controls({ onRefresh }) {
  return (
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <button onClick={onRefresh} className="btn btn-secondary">Refresh</button>
      <SnapshotButton />
    </div>
  );
}

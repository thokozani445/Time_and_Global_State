export default function ConnectionStatus({ status }) {
  const colorClass = status === "connected" ? "ws-connected" : (status === "connecting" ? "" : "ws-disconnected");
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span className={`status-dot ${colorClass}`} />
      <div style={{fontSize:13,color: status === "connected" ? "#065f46" : "#b91c1c"}}>{status}</div>
    </div>
  );
}

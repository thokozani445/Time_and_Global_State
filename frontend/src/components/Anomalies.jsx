export default function Anomalies({ anomalies = [] }){
  return (
    <div className="card">
      <h3 className="h3" style={{color:"#b91c1c"}}>Anomalies</h3>
      <div style={{maxHeight:320, overflow:"auto", marginTop:8}}>
        {anomalies.length===0 && <div className="small">No anomalies detected</div>}
        {anomalies.map((a,i)=>(
          <div key={i} style={{padding:8,borderBottom:"1px solid #f3f4f6"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700}}>{a.type?.toUpperCase()} {a.package ? `• ${a.package}` : ""}</div>
              <div style={{fontSize:12,color:"#6b7280"}}>{new Date(a.ts || Date.now()).toLocaleString()}</div>
            </div>
            <div style={{fontSize:12,color:"#6b7280", marginTop:6}}>{a.node ? `node: ${a.node}` : ""} {a.drift_ms ? `drift: ${a.drift_ms}ms` : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

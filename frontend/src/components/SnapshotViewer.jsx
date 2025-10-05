import React, { useState } from "react";

export default function SnapshotViewer({ api }){
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(false);

  async function take(){
    setLoading(true);
    try {
      const r = await fetch(`${api}/snapshot`);
      const j = await r.json();
      setSnap(j);
    } catch(e){
      console.error(e);
    } finally { setLoading(false); }
  }

  function download(){
    const data = JSON.stringify(snap, null, 2);
    const blob = new Blob([data], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `snapshot_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <h3 className="h3">Global Snapshot</h3>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={take} disabled={loading}>{loading ? "Taking..." : "Take Snapshot"}</button>
        {snap && <button className="btn-secondary" onClick={download}>Download JSON</button>}
      </div>
      <div style={{marginTop:12}}>
        {snap ? <pre style={{fontSize:12,whiteSpace:"pre-wrap"}}>{JSON.stringify(snap.merged_packages ? snap.merged_packages : snap, null, 2)}</pre> : <div className="small">No snapshot yet</div>}
      </div>
    </div>
  );
}

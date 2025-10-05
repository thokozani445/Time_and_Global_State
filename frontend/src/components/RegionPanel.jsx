import { useState } from "react";

export default function RegionPanel({ regions }){
  const [open, setOpen] = useState({});
  return (
    <div className="card" style={{marginBottom:12}}>
      <h3 className="h3">Regions</h3>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {Object.keys(regions).length===0 && <div className="small">No region data</div>}
        {Object.entries(regions).map(([k,v])=>(
          <div key={k} style={{border:"1px solid #eef2ff", padding:10, borderRadius:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700}}>{v.region}</div>
                <div className="small">Nodes: {v.nodes} • Packages: {v.packages} • In-flight: {v.inflight}</div>
              </div>
              <div>
                <button className="btn-secondary" onClick={()=>setOpen({...open, [k]: !open[k]})}>
                  {open[k] ? "Hide nodes" : "Show nodes"}
                </button>
              </div>
            </div>
            {open[k] && (
              <div style={{marginTop:10}}>
                {/* If you later add nodes detail in regions API, render them here */}
                <div className="small">(Node-level details shown here.)</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

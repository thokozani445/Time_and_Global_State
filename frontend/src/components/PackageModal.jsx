import React from "react";
import dayjs from "dayjs";

export default function PackageModal({ item, onClose }){
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <h3 style={{marginTop:0}}>Package {item.package_id}</h3>
        <div style={{marginBottom:8}} className="small">Last seen: {dayjs(item.arrival_ts).format('YYYY-MM-DD HH:mm:ss')} ({dayjs(item.arrival_ts).fromNow()})</div>
        <pre style={{background:"#f8fafc",padding:8,borderRadius:6,fontSize:12}}>{JSON.stringify(item, null, 2)}</pre>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

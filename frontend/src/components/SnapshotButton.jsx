import { useState } from "react";
import { toast } from "react-toastify";

export default function SnapshotButton(){
  const [loading, setLoading] = useState(false);

  async function onTake(){
    setLoading(true);
    try {
      const r = await fetch((import.meta.env.VITE_API_URL || "http://localhost:8000") + "/snapshot");
      if (!r.ok) throw new Error("Snapshot failed");
      const j = await r.json();
      toast.success("Snapshot captured", {autoClose:2000});
      // Optionally open snapshot viewer in new tab or trigger UI update
      console.log("snapshot", j);
    } catch (e){
      toast.error("Snapshot failed");
    } finally { setLoading(false); }
  }

  return (
    <button onClick={onTake} className="btn" disabled={loading}>
      {loading ? "Taking snapshot..." : "Take Snapshot"}
    </button>
  );
}

import json
from dataclasses import dataclass
from .clock import HLC, HLCStamp

@dataclass
class Message:
    package_id: str
    payload: dict
    hlc: HLCStamp
    src: str
    dst: str
    sent_ts: int  # physical ms when sent (local)

class Node:
    def __init__(self, node_id: str, offset: int = 0, log_dir: str = "group2/logs"):
        # offset is used in tests/simulations to simulate clock skew by overriding get_physical_ms
        if offset != 0:
            self.clock = HLC(node_id, get_physical_ms=lambda: int(__import__('time').time() * 1000) + offset)
        else:
            self.clock = HLC(node_id)
        self.node_id = node_id
        self.state = {}  # package_id -> last known info: dict with hlc, payload, node
        self.inflight = {}  # package_id -> Message (sent but not yet received)
        self.log_dir = log_dir

    def stamp_event(self):
        return self.clock.now()

    def merge_remote_stamp(self, remote_stamp: HLCStamp):
        return self.clock.merge(remote_stamp)

    def send(self, package_id: str, payload: dict, dst: str, send_ts: int = None) -> Message:
        hlc = self.stamp_event()
        sent_ts = send_ts if send_ts is not None else int(__import__('time').time() * 1000)
        msg = Message(package_id=package_id, payload=payload, hlc=hlc, src=self.node_id, dst=dst, sent_ts=sent_ts)
        # log local send
        self._log_event("send", msg)
        # update local state (optimistic)
        self.state[package_id] = {"hlc": hlc.to_tuple(), "payload": payload, "node": self.node_id}
        self.inflight[package_id] = msg  # Track as inflight
        return msg

    def receive(self, msg: Message, arrival_ts: int):
        # merge HLC with remote stamp
        try:
            self.merge_remote_stamp(msg.hlc)
        except Exception:
            pass
        # apply message: if newer than stored, update
        stored = self.state.get(msg.package_id)
        incoming_hlc = msg.hlc
        update = False
        if stored is None:
            update = True
        else:
            stored_hlc = HLCStamp(stored["hlc"][0], stored["hlc"][1], stored.get("node", ""))
            if stored_hlc < incoming_hlc:
                update = True

        if update:
            self.state[msg.package_id] = {"hlc": incoming_hlc.to_tuple(), "payload": msg.payload, "node": msg.src}
        # Remove from inflight if present
        if msg.package_id in self.inflight:
            del self.inflight[msg.package_id]
        # log receive
        self._log_event("recv", msg, arrival_ts)
        return update

    def _log_event(self, action: str, msg: Message, ts: int = None):
        entry = {
            "action": action,
            "src": msg.src,
            "dst": msg.dst,
            "hlc": {"phys": msg.hlc.phys, "cnt": msg.hlc.cnt, "node": msg.hlc.node_id},
            "package_id": msg.package_id,
            "payload": msg.payload,
            "sent_ts": msg.sent_ts,
            "arrival_ts": ts or int(__import__('time').time() * 1000)
        }
        with open(f"{self.log_dir}/{self.node_id}.log", "a") as f:
            f.write(json.dumps(entry) + "\n")
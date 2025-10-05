# group2/clock.py
import time
from dataclasses import dataclass, asdict

def now_ms():
    return int(time.time() * 1000)

@dataclass
class HLCStamp:
    phys: int   # physical ms since epoch
    cnt: int    # logical counter
    node_id: str = ""

    def to_tuple(self):
        return (self.phys, self.cnt)

    def __lt__(self, other):
        if self.phys != other.phys:
            return self.phys < other.phys
        if self.cnt != other.cnt:
            return self.cnt < other.cnt
        return str(self.node_id) < str(other.node_id)

    def __repr__(self):
        return f"{self.phys}:{self.cnt}@{self.node_id}"

class HLC:
    def __init__(self, node_id: str, get_physical_ms=now_ms):
        self.node_id = node_id
        self.get_physical_ms = get_physical_ms
        self.last_phys = self.get_physical_ms()
        self.last_cnt = 0

    def now(self):
        phys = self.get_physical_ms()
        if phys > self.last_phys:
            self.last_phys = phys
            self.last_cnt = 0
        else:
            # physical did not advance (clock skew or same ms)
            self.last_cnt += 1
        return HLCStamp(self.last_phys, self.last_cnt, self.node_id)

    def merge(self, remote: HLCStamp):
        phys = self.get_physical_ms()
        max_phys = max(phys, self.last_phys, remote.phys)
        if max_phys == phys:
            # local wall time is max
            counter = 0 if phys > max(self.last_phys, remote.phys) else max(self.last_cnt, remote.cnt) + 1
        elif max_phys == self.last_phys:
            counter = 0 if self.last_phys > max(phys, remote.phys) else max(self.last_cnt, remote.cnt) + 1
        else:
            # remote phys is max
            counter = 0 if remote.phys > max(phys, self.last_phys) else max(self.last_cnt, remote.cnt) + 1

        self.last_phys = max_phys
        self.last_cnt = counter
        return HLCStamp(self.last_phys, self.last_cnt, self.node_id)

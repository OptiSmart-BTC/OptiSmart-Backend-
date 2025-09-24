import time
import re
from datetime import datetime

log_path = "/Users/santiago/mongo-db/data/OptiSmart/OptiSmart-Backend-/modulo_demanda/Algoritmo_Prophet/prophet_python.log"
total_dfus = 1419

ts_re  = re.compile(r"\[(?:I|W|E)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}),\d{3}\]")
dfu_re = re.compile(r"\[PIPE\]\s+Rendimiento\s+(.*?):")

last_ts = None
start_ts = None
done = 0

def fmt_eta(hours: float) -> str:
    if not hours or hours == float("inf") or hours != hours:
        return "N/A"
    h = int(hours)
    m = int(round((hours - h) * 60))
    return f"{h}h {m}m"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    f.seek(0, 2)  # ir al final
    while True:
        line = f.readline()
        if not line:
            time.sleep(1.0)
            continue

        m_ts = ts_re.search(line)
        if m_ts:
            last_ts = datetime.strptime(m_ts.group(1), "%Y-%m-%d %H:%M:%S")

        m_dfu = dfu_re.search(line)
        if m_dfu:
            dfu = m_dfu.group(1).strip()
            ts = last_ts
            done += 1
            if start_ts is None and ts is not None:
                start_ts = ts

            rate = 0.0
            eta_str = "N/A"
            if ts and start_ts and ts > start_ts:
                elapsed_h = (ts - start_ts).total_seconds() / 3600.0
                rate = done / elapsed_h if elapsed_h > 0 else 0.0
                remaining = max(total_dfus - done, 0)
                eta_h = (remaining / rate) if rate > 0 else float("inf")
                eta_str = fmt_eta(eta_h)

            print(f"[{ts if ts else 'sin ts'}] DFU #{done}: {dfu}")
            print(f" → Velocidad: {rate:.2f} DFUs/hora | ETA hasta {total_dfus}: {eta_str}\n", flush=True)
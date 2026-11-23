import json, urllib.request, urllib.error, datetime, subprocess, sys
B = "http://localhost:4000"; R = []; FAILS = []
def chk(name, cond, info=""):
    ok = bool(cond); R.append(ok)
    if not ok: FAILS.append(name)
    print(("ĐẠT " if ok else "LỖI ") + name + ((" | " + str(info)[:140]) if (info != "" and not ok) or (info != "" and len(str(info)) < 60) else ""))
class C:
    def __init__(s): s.ck = None
    def call(s, m, p, d=None, raw=False, h=None, body=None):
        hd = {"Content-Type": "application/json", "X-Forwarded-Proto": "https"}; hd.update(h or {})
        if s.ck: hd["Cookie"] = s.ck
        data = body if body is not None else (json.dumps(d).encode() if d is not None else None)
        r = urllib.request.Request(B + p, data=data, method=m, headers=hd)
        try: res = urllib.request.urlopen(r, timeout=120)
        except urllib.error.HTTPError as e: res = e
        b = res.read(); ck = res.headers.get("Set-Cookie")
        if ck and "connect.sid" in ck: s.ck = ck.split(";")[0]
        if raw: return res.status, b, res.headers
        try: return res.status, json.loads(b)
        except Exception: return res.status, b
def login(u, pw="Test@2026"):
    c = C(); st, x = c.call("POST", "/api/auth/login", {"username": u, "password": pw}); c.status = st; c.me = x; return c
def sql(q):
    out = subprocess.run(["node", "/home/claude/w/sql.mjs", q], capture_output=True, text=True); return out.stdout.strip() + out.stderr.strip()
def workday(n):
    d = datetime.date.today() + datetime.timedelta(days=n)
    while d.weekday() > 4: d += datetime.timedelta(days=1)
    return d
vn = lambda d: d.strftime("%d/%m/%Y")
def done():
    print(f"\nKẾT QUẢ: {sum(R)} / {len(R)}" + ("" if all(R) else "  — LỖI: " + "; ".join(FAILS))); sys.exit(0 if all(R) else 1)

_QK = ("qtyGood", "qtyBroken", "qtyRepair", "qtyLostPending", "qtyLost", "qtyDisposed", "qtyConsumed")
def inv(cl):
    """Kho thiết bị theo id; số lượng không có thì tính là 0"""
    return {e["id"]: {**{k: 0 for k in _QK}, **e} for e in cl.call("GET", "/api/inventory/equipment")[1]}
def wd(i):
    """Ngày làm việc thứ i kể từ 3 ngày nữa (mọi i khác nhau cho ra ngày khác nhau, bỏ qua cuối tuần)"""
    d = datetime.date.today() + datetime.timedelta(days=3); out = []
    while len(out) <= i:
        if d.weekday() < 5: out.append(d)
        d += datetime.timedelta(days=1)
    return out[i]

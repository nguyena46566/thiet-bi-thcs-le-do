from common import *
import subprocess, os, gzip, tempfile
print("== S7. Vận hành: sao lưu, khôi phục, nhật ký, dữ liệu mẫu, thông báo, header ==")
def restart(*env, reset=False):
    e = {**os.environ}; 
    if not reset: e["NORESET"] = "1"
    subprocess.run(["/home/claude/w/start.sh", *env], env=e, capture_output=True)
restart("TEST_ACCOUNTS=1", "BACKUP_KEY=khoa-thu-nghiem", reset=True)
qt = login("quantri"); nv = login("nhanvientb"); gv = login("giaovien"); anon = C(); OCT = {"Content-Type": "application/octet-stream"}
# ---- trạng thái hệ thống
c, s = qt.call("GET", "/api/admin/status"); ck = {x["label"]: x["ok"] for x in s["checks"]}
chk("Trạng thái hệ thống: PostgreSQL, 11 điểm kiểm tra", c == 200 and s["storage"] == "PostgreSQL" and len(s["checks"]) == 11, s.get("storage"))
chk("Phát hiện đang bật tài khoản thử nghiệm và chưa đủ 2 quản trị thật", ck["Đã tắt tài khoản thử nghiệm (TEST_ACCOUNTS)"] is False and ck["Có ít nhất 2 quản trị hệ thống thật"] is False)
chk("Có BACKUP_KEY thì điểm kiểm tra đạt", ck["BACKUP_KEY để mã hóa bản sao lưu"] is True)
chk("Nhân viên thiết bị không xem trạng thái hệ thống (403)", nv.call("GET", "/api/admin/status")[0] == 403)
# ---- sao lưu
c, b, h = qt.call("GET", "/api/admin/backup", raw=True); chk("Sao lưu tay: tệp .tbk mã hóa (TBK1)", c == 200 and b[:4] == b"TBK1" and ".tbk" in h.get("Content-Disposition", ""))
chk("Nhân viên thiết bị không tải sao lưu (403)", nv.call("GET", "/api/admin/backup", raw=True)[0] == 403)
chk("Chưa đăng nhập không tải sao lưu", anon.call("GET", "/api/admin/backup", raw=True)[0] in (401, 403))
chk("Sao lưu tự động: sai khóa bí mật bị chặn (403)", anon.call("GET", "/api/cron/backup", h={"x-cron-secret": "sai"}, raw=True)[0] == 403)
c, bk, h = anon.call("GET", "/api/cron/backup", h={"x-cron-secret": "testsecret", "Accept-Encoding": "gzip"}, raw=True); chk("Sao lưu tự động: mã hóa, không bị nén chồng", c == 200 and bk[:4] == b"TBK1" and not h.get("Content-Encoding"))
chk("Lịch sử sao lưu ghi lại (tay, tự động)", {x["kind"] for x in qt.call("GET", "/api/admin/backups")[1]} >= {"Tải tay", "Tự động"})
f = tempfile.NamedTemporaryFile(delete=False, suffix=".tbk"); f.write(bk); f.close()
out = subprocess.run(["node", "/home/claude/w/app/backend/tools/giai-ma-sao-luu.mjs", f.name], capture_output=True, env={**os.environ, "BACKUP_KEY": "khoa-thu-nghiem"}); dec = json.loads(out.stdout)
chk("Công cụ giải mã ngoài máy chủ mở được bản sao lưu", dec["app"] == "thiet-bi-thcs-le-do" and dec["counts"]["equipment"] > 50 and dec["counts"]["users"] >= 6, dec["counts"].get("equipment"))
chk("Sai khóa thì không giải mã được", subprocess.run(["node", "/home/claude/w/app/backend/tools/giai-ma-sao-luu.mjs", f.name], capture_output=True, env={**os.environ, "BACKUP_KEY": "sai"}).returncode != 0)
# ---- khôi phục
n0 = len(inv(nv)); c, mk = nv.call("POST", "/api/inventory/equipment", {"name": "Thiết bị thêm sau sao lưu", "subjectId": "vat-li", "qtyGood": 1})
c, rg = gv.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "x", "className": "8A1", "periods": ["S1"], "borrowDate": vn(wd(3)), "returnDate": vn(wd(3)), "equipment": "x", "items": [{"equipmentId": list(inv(nv))[0], "quantity": 1}]})
chk("Đã thêm 1 thiết bị và 1 phiếu sau thời điểm sao lưu", len(inv(nv)) == n0 + 1 and c == 201)
c, pv = qt.call("POST", "/api/admin/restore?dry=1", body=bk, h=OCT); chk("Xem trước khôi phục: số liệu hiện tại và trong bản sao lưu", c == 200 and pv["counts"]["equipment"] == n0 and pv["current"]["equipment"] == n0 + 1, (pv.get("counts", {}).get("equipment"), pv.get("current", {}).get("equipment")))
chk("Thiếu xác nhận thì không khôi phục (400)", qt.call("POST", "/api/admin/restore", body=bk, h=OCT)[0] == 400)
bad = bytearray(bk); bad[-5] ^= 0xFF; chk("Tệp bị sửa đổi bị từ chối (400)", qt.call("POST", "/api/admin/restore?dry=1", body=bytes(bad), h=OCT)[0] == 400)
chk("Tệp lạ bị từ chối (400)", qt.call("POST", "/api/admin/restore?dry=1", body=b"hello", h=OCT)[0] == 400)
chk("Nhân viên thiết bị không khôi phục được (403)", nv.call("POST", "/api/admin/restore?confirm=KHOI-PHUC", body=bk, h=OCT)[0] == 403)
c, x = qt.call("POST", "/api/admin/restore?confirm=KHOI-PHUC", body=bk, h=OCT); chk("Khôi phục thành công", c == 200 and x["restoredFrom"] == dec["createdAt"], x)
chk("Sau khôi phục: thiết bị thêm sau sao lưu biến mất, hiển thị ngay không cần khởi động lại", len(inv(nv)) == n0 and mk["id"] not in inv(nv))
chk("Sau khôi phục: phiếu thêm sau sao lưu biến mất", all(r["id"] != rg["id"] for r in nv.call("GET", "/api/records")[1]))
chk("Sau khôi phục: tài khoản vẫn đăng nhập được, phiên cũ vẫn dùng được", login("giaovien").status == 200 and qt.call("GET", "/api/auth/me")[1].get("user"))
chk("Lịch sử ghi lần khôi phục", any(str(x["kind"]).startswith("Khôi phục") for x in qt.call("GET", "/api/admin/backups")[1]))
# ---- nhật ký đăng nhập
lg = qt.call("GET", "/api/admin/login-log?result=Th%C3%A0nh%20c%C3%B4ng")[1]; chk("Nhật ký đăng nhập lọc theo kết quả", len(lg) >= 3 and all(x["result"] == "Thành công" for x in lg))
chk("Mỗi người xem được các lần đăng nhập của mình, không lộ thiết bị chi tiết", all("ua" not in x for x in gv.call("GET", "/api/me/logins")[1]) and len(gv.call("GET", "/api/me/logins")[1]) >= 1)
# ---- thông báo
nv.call("POST", "/api/notifications/mark-all-read")
gv.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "x", "className": "8A1", "periods": ["S2"], "borrowDate": vn(wd(4)), "returnDate": vn(wd(4)), "equipment": "x", "items": [{"equipmentId": list(inv(nv))[1], "quantity": 1}]})
c, ns = nv.call("GET", "/api/notifications"); chk("Giáo viên gửi phiếu → nhân viên thiết bị nhận thông báo chưa đọc", c == 200 and len(ns) >= 1 and not ns[0].get("read"), (c, len(ns) if c == 200 else ns))
uc = nv.call("GET", "/api/notifications/unread-count")[1]; uc = uc if isinstance(uc, int) else uc.get("count", uc.get("unread", 0))
if ns:
    nv.call("PATCH", f"/api/notifications/{ns[0]['id']}/read"); uc2 = nv.call("GET", "/api/notifications/unread-count")[1]; uc2 = uc2 if isinstance(uc2, int) else uc2.get("count", uc2.get("unread", 0))
    chk("Đánh dấu đã đọc một thông báo làm giảm số chưa đọc", uc2 <= uc and (uc == 0 or uc2 == uc - 1), (uc, uc2))
chk("Đánh dấu đã đọc tất cả → 0", nv.call("POST", "/api/notifications/mark-all-read")[0] == 200 and (lambda v: (v if isinstance(v, int) else v.get("count", v.get("unread", 0))) == 0)(nv.call("GET", "/api/notifications/unread-count")[1]))
chk("Giáo viên không đọc thông báo của phòng thiết bị (403)", gv.call("GET", "/api/notifications")[0] in (401, 403))
# ---- dữ liệu mẫu
base = {"eq": len(inv(nv)), "rec": len(nv.call("GET", "/api/records")[1]), "users": len(qt.call("GET", "/api/users")[1]["users"])}
chk("Giáo viên/nhân viên không tạo được dữ liệu mẫu (403)", nv.call("POST", "/api/admin/demo-data")[0] == 403 and gv.call("POST", "/api/admin/demo-data")[0] == 403)
c, d = qt.call("POST", "/api/admin/demo-data"); chk("Tạo dữ liệu mẫu đầy đủ", c == 201 and sum(d["summary"].values()) > 600, sum(d["summary"].values()) if c == 201 else d)
chk("Tạo lần hai bị chặn (409)", qt.call("POST", "/api/admin/demo-data")[0] == 409)
chk("Trang đăng nhập liệt kê 16 tài khoản mẫu (12 giáo viên + 4 vai trò)", len(anon.call("GET", "/api/auth/options")[1]["demoAccounts"]) == 16)
recs = nv.call("GET", "/api/records")[1]; sts = {r["status"] for r in recs}; chk("Phiếu mượn mẫu đủ trạng thái: Chờ duyệt, Mượn, Trả, Từ chối", {"Chờ duyệt", "Mượn", "Trả", "Từ chối"} <= sts and len(recs) > 40, (len(recs), sts))
al = nv.call("GET", "/api/inventory/alerts")[1]; chk("Cảnh báo hóa chất có hết hạn, sắp hết hạn, dưới tối thiểu", len(al["expired"]) >= 1 and len(al["expiringSoon"]) >= 1 and len(al["lowStock"]) >= 1, {k: len(v) for k, v in al.items()})
ht = login("hieutruong"); ov = ht.call("GET", "/api/principal/overview")[1]; chk("Trang Ban giám hiệu có việc chờ: báo mất, đề xuất, phiếu giá trị cao", len(ov["losses"]) >= 1 and len(ov["proposals"]) >= 2 and len(ov["special"]) >= 1, (len(ov["losses"]), len(ov["proposals"]), len(ov["special"])))
tl = login("thuvien").call("GET", "/api/library/stats")[1]; chk("Thư viện mẫu: 96 học sinh, hơn 200 bản, có lượt mượn và quá hạn", tl["readers"]["students"] == 96 and tl["collection"]["copies"] > 200 and tl["loans"]["total"] > 50 and tl["loans"]["overdue"] >= 4, (tl["collection"]["copies"], tl["loans"]["total"], tl["loans"]["overdue"]))
hg = login("gv.hong"); chk("Đăng nhập giáo viên mẫu và xem phiếu của mình", hg.status == 200 and len(hg.call("GET", "/api/records/mine")[1]) > 0)
c, x = qt.call("DELETE", "/api/admin/demo-data"); chk("Xóa dữ liệu mẫu", c == 200)
after = {"eq": len(inv(nv)), "rec": len(nv.call("GET", "/api/records")[1]), "users": len(qt.call("GET", "/api/users")[1]["users"])}
chk("Sau khi xóa: thiết bị, phiếu mượn, người dùng về đúng như trước", after == base, (base, after))
chk("Sau khi xóa: tài khoản giáo viên mẫu không còn đăng nhập được", login("gv.hong").status == 401 and len(anon.call("GET", "/api/opac?q=")[1]["results"]) == 0)
chk("Tạo lại được sau khi xóa", qt.call("POST", "/api/admin/demo-data")[0] == 201 and qt.call("DELETE", "/api/admin/demo-data")[0] == 200)
# ---- header, nén, tệp tĩnh
c, b, h = anon.call("GET", "/", raw=True)
chk("Trang chủ có đủ 5 header bảo mật, không lộ X-Powered-By", all(h.get(k) for k in ("X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security")) and not h.get("X-Powered-By"))
js = [x for x in os.listdir("/home/claude/w/app/dist/assets") if x.startswith("index-") and x.endswith(".js")][0]
c, b, h = anon.call("GET", f"/assets/{js}", raw=True, h={"Accept-Encoding": "gzip"}); chk("Gói JS nén gzip còn dưới 200 KB, cache 1 năm", h.get("Content-Encoding") == "gzip" and len(b) < 200000 and "immutable" in h.get("Cache-Control", ""), len(b))
chk("robots.txt chặn công cụ tìm kiếm (web nội bộ)", b"Disallow: /" in anon.call("GET", "/robots.txt", raw=True)[1])
chk("Đường dẫn giao diện lạ vẫn trả trang chủ (200); API lạ trả 404 JSON", anon.call("GET", "/duong-dan-la", raw=True)[0] == 200 and anon.call("GET", "/api/khong-co")[0] == 404)
chk("Cookie phiên: HttpOnly, SameSite=Lax, Secure khi chạy thật", (lambda ck: "HttpOnly" in ck and "SameSite=Lax" in ck and "Secure" in ck)(C().call("POST", "/api/auth/login", {"username": "quantri", "password": "Test@2026"}, raw=True)[2].get("Set-Cookie", "")))
chk("Thân yêu cầu quá lớn bị từ chối (JSON > 100 KB)", anon.call("POST", "/api/auth/login", {"username": "a", "password": "x" * 200000})[0] in (400, 413))
# ---- không đặt BACKUP_KEY, tắt tài khoản thử nghiệm (giống khi chạy thật nhưng thiếu khóa)
restart("BACKUP_KEY=", "ADMIN_EMAILS=qt@thcsledo.vn")
chk("Tắt TEST_ACCOUNTS: tài khoản thử nghiệm không đăng nhập được", login("quantri").status in (401, 403) and not C().call("GET", "/api/auth/options")[1]["testAccounts"])
chk("Chưa có BACKUP_KEY: sao lưu tự động bị từ chối (503), không để lộ tệp chưa mã hóa", C().call("GET", "/api/cron/backup", h={"x-cron-secret": "testsecret"}, raw=True)[0] == 503)
chk("Tắt TEST_ACCOUNTS: không tạo được dữ liệu mẫu", C().call("POST", "/api/admin/demo-data")[0] in (401, 403))
done()

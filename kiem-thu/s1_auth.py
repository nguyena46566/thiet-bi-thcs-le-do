from common import *
print("== S1. Tài khoản, đăng nhập, phân quyền ==")
opt = C().call("GET", "/api/auth/options")[1]
chk("Trang đăng nhập liệt kê 6 tài khoản thử nghiệm", len(opt["testAccounts"]) == 6 and opt["testPassword"] == "Test@2026")
accs = {u: login(u) for u in ("quantri", "nhanvientb", "thuvien", "hieutruong", "totruong", "giaovien")}
chk("Đăng nhập thành công cả 6 vai trò", all(c.status == 200 for c in accs.values()))
chk("Mỗi vai trò vào đúng TRANG RIÊNG của mình sau khi đăng nhập", [accs[u].me["landing"] for u in ("quantri", "nhanvientb", "thuvien", "hieutruong", "totruong", "giaovien")] == ["quan-tri", "nv-thiet-bi", "thu-thu", "bgh", "to-truong", ""], [accs[u].me.get("landing") for u in accs])
chk("Sai mật khẩu → 401", login("giaovien", "saimatkhau").status == 401)
chk("Tài khoản không tồn tại → 401", login("khongco").status == 401)
for _ in range(5): login("giaovien", "sai")
chk("Sai 5 lần liên tiếp → tạm khóa (429)", login("giaovien", "sai").status == 429)
chk("Đang tạm khóa thì đúng mật khẩu cũng bị chặn", login("giaovien").status == 429)
# ---- ma trận quyền
anon = C()
chk("Chưa đăng nhập: /api/auth/me không có người dùng", anon.call("GET", "/api/auth/me")[1].get("user") in (None, False))
chk("Chưa đăng nhập: danh sách thiết bị kho bị chặn (401/403)", anon.call("GET", "/api/inventory/equipment")[0] in (401, 403))
gv = accs["totruong"]
for path in ["/api/admin/status", "/api/users", "/api/library/receipts", "/api/inventory/equipment", "/api/audits", "/api/admin/login-log", "/api/data-requests"]:
    chk(f"Giáo viên/tổ trưởng không vào được {path}", gv.call("GET", path)[0] in (401, 403))
chk("Nhân viên thiết bị không vào quản trị người dùng", accs["nhanvientb"].call("GET", "/api/users")[0] == 403)
tv = accs["thuvien"]
for m, p in [("GET", "/api/inventory/equipment"), ("GET", "/api/audits"), ("GET", "/api/loss-reports"), ("GET", "/api/points"), ("GET", "/api/plans"), ("GET", "/api/notifications")]:
    chk(f"Nhân viên thư viện KHÔNG vào được {p}", tv.call(m, p)[0] in (401, 403), tv.call(m, p)[0])
chk("Đề xuất mua sắm: thủ thư chỉ thấy đề xuất của chính mình (trống)", tv.call("GET", "/api/proposals")[1]["proposals"] == [])
chk("Nhân viên thư viện KHÔNG tạo được thiết bị", tv.call("POST", "/api/inventory/equipment", {"name": "Thử quyền", "subjectId": "vat-li", "qtyGood": 1})[0] in (401, 403))
chk("Nhân viên thư viện KHÔNG duyệt được phiếu mượn", tv.call("PATCH", "/api/records/xxx/status", {"status": "Mượn"})[0] in (401, 403))
for m, p in [("GET", "/api/library/receipts"), ("GET", "/api/library/stats"), ("GET", "/api/guests"), ("GET", "/api/library/readers")]:
    chk(f"Nhân viên thư viện vào được {p}", tv.call(m, p)[0] == 200)
chk("Phiên đăng nhập thủ thư: isAdmin=false, isStaff=true", tv.me["user"]["isAdmin"] is False and tv.me["user"]["isStaff"] is True)
# ---- đăng ký và duyệt
qt = accs["quantri"]
chk("Đăng ký: tên đăng nhập sai bị chặn", C().call("POST", "/api/auth/register", {"username": "A B", "name": "x", "password": "12345678"})[0] == 400)
chk("Đăng ký: mật khẩu ngắn bị chặn", C().call("POST", "/api/auth/register", {"username": "gv.moi", "name": "Cô Mới", "password": "123"})[0] == 400)
c, r = C().call("POST", "/api/auth/register", {"username": "gv.moi", "name": "Cô Mới", "password": "Matkhau123", "requestedRoles": ["teacher"]})
chk("Đăng ký tài khoản mới (chờ duyệt)", c in (200, 201), r if c not in (200, 201) else "")
chk("Đăng ký trùng tên đăng nhập → 409", C().call("POST", "/api/auth/register", {"username": "gv.moi", "name": "Khác", "password": "Matkhau123"})[0] == 409)
chk("Chưa được duyệt thì không đăng nhập được (403)", login("gv.moi", "Matkhau123").status == 403)
chk("Không xin quyền quản trị khi đăng ký", "sysadmin" not in (qt.call("GET", "/api/users")[1]["users"][0].get("requestedRoles") or []))
chk("Duyệt phải chọn vai trò", qt.call("POST", "/api/users/pw-gv.moi/approve", {"roles": []})[0] == 400)
chk("Tổ trưởng phải có tổ chuyên môn", qt.call("POST", "/api/users/pw-gv.moi/approve", {"roles": ["head"]})[0] == 400)
chk("Quản trị duyệt thành giáo viên", qt.call("POST", "/api/users/pw-gv.moi/approve", {"roles": ["teacher"]})[0] == 200)
moi = login("gv.moi", "Matkhau123"); chk("Sau duyệt: đăng nhập được", moi.status == 200 and moi.me["user"]["roles"] == ["teacher"])
chk("Duyệt lần hai → 409", qt.call("POST", "/api/users/pw-gv.moi/approve", {"roles": ["teacher"]})[0] == 409)
# ---- đổi quyền có hiệu lực ngay
chk("Chưa là nhân viên thiết bị: bị chặn", moi.call("GET", "/api/inventory/equipment")[0] in (401, 403))
chk("Quản trị đổi vai trò sang nhân viên thiết bị", qt.call("PATCH", "/api/users/pw-gv.moi", {"roles": ["teacher", "equipment"]})[0] == 200)
chk("Có hiệu lực ngay, không cần đăng nhập lại", moi.call("GET", "/api/inventory/equipment")[0] == 200)
chk("Khóa tài khoản → bị chặn ngay", qt.call("PATCH", "/api/users/pw-gv.moi", {"status": "locked"})[0] == 200 and moi.call("GET", "/api/records/mine")[0] in (401, 403))
chk("Khóa rồi không đăng nhập mới được", login("gv.moi", "Matkhau123").status == 403)
chk("Mở khóa lại", qt.call("PATCH", "/api/users/pw-gv.moi", {"status": "active"})[0] == 200 and login("gv.moi", "Matkhau123").status == 200)
chk("Không tự bỏ quyền quản trị của mình (409)", qt.call("PATCH", "/api/users/pw-quantri", {"roles": ["teacher"]})[0] == 409)
chk("Không tự khóa tài khoản của mình (409)", qt.call("PATCH", "/api/users/pw-quantri", {"status": "locked"})[0] == 409)
chk("Quản trị đặt lại mật khẩu cho người khác", qt.call("POST", "/api/users/pw-gv.moi/password", {"password": "MatkhauMoi9"})[0] == 200 and login("gv.moi", "MatkhauMoi9").status == 200)
m2 = login("gv.moi", "MatkhauMoi9")
chk("Tự đổi mật khẩu: sai mật khẩu hiện tại → 401", m2.call("POST", "/api/auth/password", {"current": "sai", "password": "KhacNua123"})[0] == 401)
chk("Tự đổi mật khẩu thành công", m2.call("POST", "/api/auth/password", {"current": "MatkhauMoi9", "password": "KhacNua123"})[0] == 200 and login("gv.moi", "KhacNua123").status == 200)
c, r = C().call("POST", "/api/auth/register", {"username": "gv.tuchoi", "name": "Bị từ chối", "password": "Matkhau123"})
chk("Từ chối yêu cầu đăng ký → tài khoản bị xóa", qt.call("POST", "/api/users/pw-gv.tuchoi/reject", {"note": "Không thuộc trường"})[0] == 200 and login("gv.tuchoi", "Matkhau123").status == 401)
# ---- quản trị thật cuối cùng
c, r = qt.call("POST", "/api/users", {"username": "qt.that", "name": "Quản trị thật", "password": "Matkhau123", "roles": ["sysadmin"]})
chk("Tạo tài khoản quản trị mới", c in (200, 201), r if c not in (200, 201) else "")
qth = login("qt.that", "Matkhau123")
chk("Quản trị thật cuối cùng không bị khóa/bỏ quyền (409)", qth.call("PATCH", "/api/users/pw-qt.that", {"roles": ["teacher"]})[0] == 409)
# ---- nhật ký
logs = qt.call("GET", "/api/admin/login-log")[1]; res = {x["result"] for x in logs}
chk("Nhật ký đăng nhập ghi thành công, sai mật khẩu, tạm khóa, chờ duyệt", {"Thành công", "Sai mật khẩu", "Chờ duyệt"} <= res and any("khóa" in x for x in res), sorted(res))
chk("Nhân viên thiết bị không xem được nhật ký đăng nhập", accs["nhanvientb"].call("GET", "/api/admin/login-log")[0] == 403)
chk("Nhật ký phân quyền ghi lại thao tác", len(qt.call("GET", "/api/users")[1].get("logs", [])) >= 4)
# ---- đồng ý dữ liệu cá nhân
meta = C().call("GET", "/api/privacy/meta")[1]
chk("Chưa đồng ý: consentVersion trống", accs["giaovien"].me["user"]["consentVersion"] == "" if accs["giaovien"].status == 200 else True)
mo = login("gv.moi", "KhacNua123")
chk("Đồng ý sai phiên bản bị chặn", mo.call("POST", "/api/privacy/consent", {"version": "cu"})[0] == 400)
chk("Ghi nhận đồng ý", mo.call("POST", "/api/privacy/consent", {"version": meta["version"]})[0] == 200 and mo.call("GET", "/api/auth/me")[1]["user"]["consentVersion"] == meta["version"])
done()

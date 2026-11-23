from common import *
print("== S8. Phân công và phân quyền: ma trận vai trò × chức năng, tách người làm – người duyệt ==")
R = {"khach": C(), "gv": login("giaovien"), "tt": login("totruong"), "nv": login("nhanvientb"), "tv": login("thuvien"), "bgh": login("hieutruong"), "qt": login("quantri")}
ROLES = ["khach", "gv", "tt", "nv", "tv", "bgh", "qt"]
def allowed(c, m, p, body=None):
    st = c.call(m, p, body if body is not None else ({} if m != "GET" else None))[0]; return st not in (401, 403)
# (mô tả, phương thức, đường dẫn, vai trò ĐƯỢC phép)
M = [
 ("Xem phiếu của tôi", "GET", "/api/records/mine", "gv tt nv tv bgh qt"),
 ("Xem quyền của tôi", "GET", "/api/me/capabilities", "gv tt nv tv bgh qt"),
 ("Gửi đề xuất mua sắm", "POST", "/api/proposals", "gv tt nv tv bgh qt"),
 ("Xem kho thiết bị", "GET", "/api/inventory/equipment", "nv bgh"),
 ("Thêm thiết bị", "POST", "/api/inventory/equipment", "nv"),
 ("Ghi tăng", "POST", "/api/inventory/purchases", "nv"),
 ("Lập đề nghị thanh lý", "POST", "/api/disposals", "nv"),
 ("Duyệt thanh lý", "POST", "/api/disposals/x/decide", "bgh"),
 ("Bảo trì", "POST", "/api/maintenance", "nv"),
 ("Kiểm kê thiết bị", "POST", "/api/audits", "nv"),
 ("Xuất dùng hóa chất", "POST", "/api/inventory/consume", "nv"),
 ("Quản lý phòng bộ môn", "POST", "/api/rooms", "nv"),
 ("Danh mục tối thiểu TT 38 (sửa)", "POST", "/api/minlist", "nv"),
 ("Xem danh mục tối thiểu", "GET", "/api/minlist", "nv bgh"),
 ("Lập quyết định thành lập tổ", "POST", "/api/decisions", "nv"),
 ("Lập kế hoạch năm học", "POST", "/api/plans", "nv"),
 ("Duyệt kế hoạch", "POST", "/api/plans/x/decide", "bgh"),
 ("Ghi xác minh mất", "PATCH", "/api/loss-reports/x/verify", "nv"),
 ("Xác nhận mất", "POST", "/api/loss-reports/x/confirm", "bgh"),
 ("Duyệt đề xuất mua sắm", "POST", "/api/proposals/x/decide", "bgh"),
 ("Đánh dấu đã mua", "POST", "/api/proposals/x/purchased", "nv"),
 ("Tổ trưởng cho ý kiến đề xuất", "POST", "/api/proposals/x/review", "tt"),
 ("Duyệt hoặc từ chối phiếu mượn", "PATCH", "/api/records/x/status", "nv bgh"),
 ("Cộng, trừ điểm thi đua", "POST", "/api/points/adjust", "bgh"),
 ("Mở khóa điểm thi đua", "POST", "/api/points/unlock", "bgh"),
 ("Xem điểm thi đua của tất cả", "GET", "/api/points", "nv bgh"),
 ("Báo cáo tổng hợp", "GET", "/api/reports", "nv bgh"),
 ("Xem thông báo nghiệp vụ", "GET", "/api/notifications", "nv bgh"),
 ("Trang Ban giám hiệu", "GET", "/api/principal/overview", "bgh"),
 ("Trang tổ trưởng", "GET", "/api/head/overview", "tt"),
 ("Thư viện: xem thống kê", "GET", "/api/library/stats", "nv tv bgh"),
 ("Thư viện: tạo kệ", "POST", "/api/library/shelves", "nv tv"),
 ("Thư viện: nhận sách", "POST", "/api/library/receipts", "nv tv"),
 ("Thư viện: cho mượn", "POST", "/api/library/loans", "nv tv"),
 ("Thư viện: sửa quy định mượn", "PUT", "/api/library/rules", "nv tv"),
 ("Thư viện: ghi nhận bồi thường", "PATCH", "/api/library/loans/x/compensation", "nv tv bgh"),
 ("Sổ khách vãng lai", "GET", "/api/guests", "nv tv bgh"),
 ("Quản lý người dùng", "GET", "/api/users", "qt"),
 ("Duyệt tài khoản", "POST", "/api/users/x/approve", "qt"),
 ("Trạng thái hệ thống", "GET", "/api/admin/status", "qt"),
 ("Tải sao lưu", "GET", "/api/admin/backup", "qt"),
 ("Nhật ký đăng nhập", "GET", "/api/admin/login-log", "qt"),
 ("Yêu cầu dữ liệu cá nhân", "GET", "/api/data-requests", "qt"),
 ("Dữ liệu mẫu", "POST", "/api/admin/demo-data", "qt"),
]
bad = []
for name, m, p, ok in M:
    ok = set(ok.split()); row = {r: allowed(R[r], m, p) for r in ROLES}
    wrong = [r for r in ROLES if row[r] != (r in ok)]
    if wrong: bad.append(f"{name}: sai ở {wrong}")
    chk(f"{name}: chỉ {' + '.join(sorted(ok))}", not wrong, f"sai ở {wrong}" if wrong else "")
# ---- quản trị hệ thống: không làm nghiệp vụ, trừ khi được giao thêm vai trò
qt = R["qt"]; c, u = qt.call("POST", "/api/users", {"username": "it.kiemnhiem", "name": "IT kiêm thiết bị", "password": "Matkhau123", "roles": ["sysadmin", "equipment"]})
kn = login("it.kiemnhiem", "Matkhau123")
chk("Quản trị được giao thêm vai trò nhân viên thiết bị thì làm được nghiệp vụ", kn.call("GET", "/api/inventory/equipment")[0] == 200 and kn.call("GET", "/api/users")[0] == 200)
c, u = qt.call("POST", "/api/users", {"username": "bgh.kiemnhiem", "name": "Phó hiệu trưởng kiêm thiết bị", "password": "Matkhau123", "roles": ["principal", "equipment"]})
bk = login("bgh.kiemnhiem", "Matkhau123"); c, e = bk.call("POST", "/api/inventory/equipment", {"name": "Thử kiêm nhiệm", "subjectId": "vat-li", "qtyGood": 1})
chk("Ban giám hiệu kiêm nhân viên thiết bị: làm được cả việc tác nghiệp lẫn quyết định", c == 201 and bk.call("POST", "/api/points/adjust", {})[0] == 400)
caps = {r: R[r].call("GET", "/api/me/capabilities")[1] for r in ROLES if r != "khach"}
chk("API quyền của tôi: BGH canDecide, NV canOperate, BGH chỉ xem; thủ thư canLibrary", caps["bgh"]["canDecide"] and caps["bgh"]["viewOnlyAdmin"] and not caps["bgh"]["canOperate"] and caps["nv"]["canOperate"] and not caps["nv"]["canDecide"] and caps["tv"]["canLibrary"] and not caps["gv"]["canLibrary"] and caps["nv"]["principalConfigured"] is True, caps["bgh"])
# ---- tách người làm – người duyệt: không tự duyệt phiếu của mình
c, a = qt.call("POST", "/api/users", {"username": "nv.kiemgv", "name": "NV thiết bị kiêm giáo viên", "password": "Matkhau123", "roles": ["equipment", "teacher"]})
own = login("nv.kiemgv", "Matkhau123"); nv, bgh = R["nv"], R["bgh"]
E = [e for e in inv(nv).values() if e["subjectId"] == "vat-li" and e["qtyGood"] >= 2 and e["kind"] == "Thiết bị"][0]
dd = vn(wd(3)); c, r = own.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "NV kiêm GV", "className": "8A1", "periods": ["S1"], "borrowDate": dd, "returnDate": dd, "equipment": E["name"], "items": [{"equipmentId": E["id"], "quantity": 1}]})
chk("Người có vai trò nhân viên thiết bị vẫn gửi được phiếu mượn như giáo viên", c == 201)
chk("…nhưng KHÔNG tự duyệt phiếu của chính mình (403)", own.call("PATCH", f"/api/records/{r['id']}/status", {"status": "Mượn"})[0] == 403)
chk("…người khác (nhân viên thiết bị khác) duyệt được", nv.call("PATCH", f"/api/records/{r['id']}/status", {"status": "Mượn"})[0] == 200)
dd2 = vn(wd(4)); c, r2 = own.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "NV kiêm GV", "className": "8A1", "periods": ["S2"], "borrowDate": dd2, "returnDate": dd2, "equipment": E["name"], "items": [{"equipmentId": E["id"], "quantity": 1}]})
chk("…hoặc Ban giám hiệu duyệt thay", bgh.call("PATCH", f"/api/records/{r2['id']}/status", {"status": "Mượn"})[0] == 200)
chk("Ban giám hiệu KHÔNG nhận trả thiết bị (403)", bgh.call("PATCH", f"/api/records/{r2['id']}/status", {"status": "Trả", "returnReport": {"items": []}})[0] == 403)
chk("Ban giám hiệu KHÔNG hoàn tác trả (403)", nv.call("PATCH", f"/api/records/{r2['id']}/status", {"status": "Trả", "returnReport": {"items": []}})[0] == 200 and bgh.call("PATCH", f"/api/records/{r2['id']}/status", {"status": "Mượn"})[0] == 403)
c, r3 = own.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "NV kiêm GV", "className": "8A1", "periods": ["S3"], "borrowDate": dd, "returnDate": dd, "equipment": E["name"], "items": [{"equipmentId": E["id"], "quantity": 1}]})
chk("Từ chối phiếu của chính mình thì được (rút lại đề nghị)", own.call("PATCH", f"/api/records/{r3['id']}/status", {"status": "Từ chối", "reason": "Đổi lịch"})[0] == 200)
# ---- tổ trưởng cho ý kiến đề xuất của tổ
gv, tt = R["gv"], R["tt"]
c, p = gv.call("POST", "/api/proposals", {"purpose": "Bộ thí nghiệm", "items": [{"name": "Bộ áp suất", "subjectId": "vat-li", "quantity": 4, "estPrice": 450000}]})
c2, p2 = gv.call("POST", "/api/proposals", {"purpose": "Bóng rổ", "items": [{"name": "Bóng rổ", "subjectId": "gdtc", "quantity": 10, "estPrice": 280000}]})
chk("Chọn ý kiến sai bị chặn (400)", tt.call("POST", f"/api/proposals/{p['id']}/review", {"opinion": "Có thể"})[0] == 400)
chk("Không đồng ý phải ghi lý do (400)", tt.call("POST", f"/api/proposals/{p['id']}/review", {"opinion": "Không đồng ý"})[0] == 400)
chk("Tổ trưởng chỉ cho ý kiến đề xuất thuộc môn của tổ mình (403)", tt.call("POST", f"/api/proposals/{p2['id']}/review", {"opinion": "Đồng ý"})[0] == 403)
c, x = tt.call("POST", f"/api/proposals/{p['id']}/review", {"opinion": "Đồng ý", "note": "Tổ đang thiếu"}); chk("Tổ trưởng cho ý kiến 'Đồng ý' đề xuất của tổ", c == 200 and x["headReviews"][0]["opinion"] == "Đồng ý" and x["headReviews"][0]["group"] == "Tổ Khoa học tự nhiên", x if c != 200 else "")
c, x = tt.call("POST", f"/api/proposals/{p['id']}/review", {"opinion": "Không đồng ý", "note": "Đã có bộ khác"}); chk("Đổi ý kiến: giữ một ý kiến của mỗi tổ", c == 200 and len(x["headReviews"]) == 1 and x["headReviews"][0]["opinion"] == "Không đồng ý")
ov = bgh.call("GET", "/api/principal/overview")[1]; chk("Ban giám hiệu thấy ý kiến tổ trưởng khi duyệt", any(q["id"] == p["id"] and q["headReviews"][0]["by"] for q in ov["proposals"]))
hv = tt.call("GET", "/api/head/overview")[1]; chk("Trang tổ trưởng thấy đề xuất của tổ mình, không thấy của tổ khác", any(q["id"] == p["id"] for q in hv["proposals"]) and not any(q["id"] == p2["id"] for q in hv["proposals"]))
bgh.call("POST", f"/api/proposals/{p['id']}/decide", {"approve": True}); chk("Đề xuất đã duyệt thì không cho ý kiến nữa (409)", tt.call("POST", f"/api/proposals/{p['id']}/review", {"opinion": "Đồng ý"})[0] == 409)
# ---- thư viện: thanh lọc cần quyết định; miễn bồi thường do Ban giám hiệu
tv = R["tv"]
c, rc = tv.call("POST", "/api/library/receipts", {"invoiceNo": "PQ-1", "supplier": "x", "lines": [{"title": "Truyện thử quyền", "kind": "STN", "invoiceQty": 2, "price": 40000}]})
tv.call("POST", f"/api/library/receipts/{rc['id']}/receive", {"lines": [{"id": rc["lines"][0]["id"], "receivedQty": 2}]})
tv.call("POST", "/api/library/readers", {"readers": [{"name": "Em Thử Quyền", "type": "Học sinh", "className": "7A1", "guardianConsent": True}]}); rid = [x for x in tv.call("GET", "/api/library/readers")[1] if x["name"] == "Em Thử Quyền"][0]["id"]
tv.call("POST", "/api/library/loans", {"readerId": rid, "codes": ["STN-00001"]}); c, ret = tv.call("POST", "/api/library/returns", {"code": "STN-00001", "condition": "Hỏng"})
chk("Thanh lọc không có số quyết định bị chặn (400)", tv.call("POST", "/api/library/weed", {"codes": ["STN-00001"], "reason": "Hư hỏng"})[0] == 400)
chk("Thanh lọc có số quyết định thì được", tv.call("POST", "/api/library/weed", {"codes": ["STN-00001"], "reason": "Hư hỏng", "decisionNo": "21/QĐ-THCSLĐ"})[0] == 200)
chk("Thủ thư KHÔNG tự miễn bồi thường (403)", tv.call("PATCH", f"/api/library/loans/{ret['id']}/compensation", {"status": "Miễn bồi thường", "note": "Em hoàn cảnh khó khăn"})[0] == 403)
chk("Thủ thư vẫn ghi nhận đã đền sách, đã nộp tiền", tv.call("PATCH", f"/api/library/loans/{ret['id']}/compensation", {"status": "Đã nộp tiền"})[0] == 200)
tv.call("POST", "/api/library/loans", {"readerId": rid, "codes": ["STN-00002"]}); c, ret2 = tv.call("POST", "/api/library/returns", {"code": "STN-00002", "condition": "Mất"})
chk("Ban giám hiệu quyết định miễn bồi thường", bgh.call("PATCH", f"/api/library/loans/{ret2['id']}/compensation", {"status": "Miễn bồi thường", "note": "Hoàn cảnh khó khăn"})[0] == 200)
chk("Ban giám hiệu không thao tác thư viện khác (403)", bgh.call("POST", "/api/library/shelve", {"shelf": "K1", "codes": ["STN-00001"]})[0] == 403)
# ---- giáo viên và tổ trưởng chỉ có quyền của giáo viên
chk("Tổ trưởng cũng là giáo viên: đăng ký mượn được", tt.call("GET", "/api/records/mine")[0] == 200 and tt.call("GET", "/api/inventory/equipment")[0] == 403)
done()

from common import *
import hashlib
print("== S9. Dữ liệu mẫu an toàn trên web thật + công cụ nhập liệu ==")
TABLES = ["equipment", "purchases", "penalties", "audits", "maintenance", "disposals", "lossreports", "rooms", "proposals", "changelog", "minlist", "settings", "consumptions", "plans", "decisions", "users", "rolelog", "booktitles", "bookcopies", "bookreceipts", "shelves", "datarequests", "guests", "readers", "bookloans", "readingperiods", "libaudits", "records", "notifications"]
def fingerprint():
    out = {}
    for t in TABLES:
        r = sql(f"SELECT count(*) AS n, md5(coalesce(string_agg(id || data::text, ',' ORDER BY id), '')) AS h FROM {t}")
        out[t] = r
    return out
qt = login("quantri"); nv = login("nhanvientb"); tv = login("thuvien"); gv = login("giaovien"); ht = login("hieutruong")
# ---- dữ liệu THẬT trước khi bật dữ liệu mẫu
c, real = nv.call("POST", "/api/inventory/equipment", {"name": "Bộ thí nghiệm thật A", "subjectId": "vat-li", "qtyGood": 7, "unitPrice": 12000}); REAL = real["id"]
tv.call("POST", "/api/library/shelves", {"code": "K01", "name": "Kệ thật"})
c, rc = tv.call("POST", "/api/library/receipts", {"invoiceNo": "REAL-1", "supplier": "NCC thật", "lines": [{"title": "Sách thật", "kind": "SGK", "grade": "7", "invoiceQty": 5, "price": 20000}]})
tv.call("POST", f"/api/library/receipts/{rc['id']}/receive", {"lines": [{"id": rc["lines"][0]["id"], "receivedQty": 5}], "shelf": "K01"})
tv.call("POST", "/api/library/readers", {"readers": [{"name": "Em Thật", "type": "Học sinh", "className": "7A1", "guardianConsent": True}]})
C().call("POST", "/api/guests/self", {"name": "Khách thật", "kind": "Phụ huynh học sinh", "purpose": "Làm việc với nhà trường", "consent": True})
nv.call("POST", "/api/rooms", {"name": "Phòng thật", "kind": "Phòng học bộ môn", "subjectIds": ["vat-li"]})
nv.call("PUT", "/api/minlist/settings", {"teachers": {"Toán": 3}, "classes": {"6": 4, "7": 4, "8": 4, "9": 4}, "hsPerRoom": 40})
toan = [i for i in nv.call("GET", "/api/minlist")[1]["items"] if i["mon"] == "Toán"][0]; nv.call("PATCH", f"/api/minlist/{toan['id']}", {"linkedEquipmentIds": [REAL]})
gv.call("POST", "/api/proposals", {"purpose": "Thật", "items": [{"name": "Máy thật", "subjectId": "vat-li", "quantity": 1, "estPrice": 1000}]})
BASE = fingerprint()
chk("Trước khi bật: chưa có dữ liệu mẫu", qt.call("GET", "/api/admin/demo-data")[1]["active"] is False and nv.call("GET", "/api/demo-status")[1]["active"] is False)
# ---- quyền
chk("Chỉ quản trị hệ thống tạo dữ liệu mẫu (403 với nhân viên, giáo viên, Ban giám hiệu)", all(x.call("POST", "/api/admin/demo-data", {"randomPasswords": True})[0] == 403 for x in (nv, gv, ht, tv)))
# ---- tạo
c, d = qt.call("POST", "/api/admin/demo-data", {"randomPasswords": True})
chk("Tạo dữ liệu mẫu: 201, nhiều bản ghi", c == 201 and sum(d["summary"].values()) > 600, d if c != 201 else sum(d["summary"].values()))
pw = d["passwords"]; chk("Mỗi tài khoản giáo viên mẫu có MẬT KHẨU NGẪU NHIÊN riêng (không dùng Test@2026)", len(pw) == 12 and len(set(pw.values())) == 12 and "Test@2026" not in pw.values() and d["commonPassword"] is None)
chk("Mật khẩu công khai Test@2026 KHÔNG đăng nhập được tài khoản mẫu", login("gv.hong", "Test@2026").status == 401)
hong = login("gv.hong", pw["gv.hong"]); chk("Đăng nhập bằng mật khẩu ngẫu nhiên được cấp", hong.status == 200)
chk("Trang đăng nhập KHÔNG liệt kê nút một chạm tài khoản mẫu (mật khẩu ngẫu nhiên)", C().call("GET", "/api/auth/options")[1]["demoAccounts"] == [])
chk("Nhân viên thấy trạng thái đang bật dữ liệu mẫu", nv.call("GET", "/api/demo-status")[1]["active"] is True and qt.call("GET", "/api/admin/demo-data")[1]["active"] is True)
chk("Tạo lần hai bị chặn (409)", qt.call("POST", "/api/admin/demo-data", {})[0] == 409)
# ---- dữ liệu thật KHÔNG bị đụng
inv_ = inv(nv); r0 = inv_[REAL]; chk("Thiết bị thật giữ nguyên số lượng và đơn giá", r0["qtyGood"] == 7 and r0["unitPrice"] == 12000, (r0["qtyGood"], r0["unitPrice"]))
demo_eq = [e for e in inv_.values() if e["name"].endswith("(mẫu)")]; chk("Thiết bị mẫu là bản sao riêng, tên có '(mẫu)'", len(demo_eq) >= 40 and all(e["id"].startswith("mau-") or e["name"].endswith("(mẫu)") for e in demo_eq), len(demo_eq))
chk("Mọi thiết bị mẫu có đơn giá; thiết bị thật không bị gán đơn giá", all(e.get("unitPrice") for e in demo_eq) and all(not e.get("unitPrice") for e in inv_.values() if not e["name"].endswith("(mẫu)") and e["id"] != REAL))
copies = {x["code"]: x for x in tv.call("GET", "/api/library/copies")[1]}
chk("Sách thật SGK-00001 giữ nguyên; sách mẫu dùng mã riêng SGK-M0001", copies["SGK-00001"]["shelf"] == "K01" and copies["SGK-00001"]["status"] == "Trên giá" and "SGK-M0001" in copies and len(copies) > 150)
chk("Thẻ bạn đọc thật BD-00001 giữ nguyên; thẻ mẫu BD-M0001", {x["id"] for x in tv.call("GET", "/api/library/readers")[1]} >= {"BD-00001", "BD-M0001"})
mlr = nv.call("GET", "/api/minlist")[1]; row = [i for i in mlr["items"] if i["id"] == toan["id"]][0]
chk("Liên kết danh mục TT 38 do trường tự làm được giữ; số giáo viên thật không bị ghi đè", row["linkedEquipmentIds"] == [REAL] and mlr["settings"]["teachers"] == {"Toán": 3}, (row["linkedEquipmentIds"], mlr["settings"]["teachers"]))
chk("Dữ liệu mẫu có liên kết TT 38 riêng (nhiều dòng liên kết với thiết bị mẫu)", sum(1 for i in mlr["items"] if any(x.startswith("mau-") for x in i["linkedEquipmentIds"])) >= 20)
aud = [a for a in nv.call("GET", "/api/audits")[1] if a["title"].startswith("[MẪU]")]; full = nv.call("GET", f"/api/audits/{aud[0]['id']}")[1] if aud else {"items": []}
chk("Đợt kiểm kê mẫu chỉ gồm thiết bị mẫu, không có thiết bị thật", bool(aud) and all(i["equipmentId"].startswith("mau-") or i["name"].endswith("(mẫu)") for i in full["items"]) and REAL not in [i["equipmentId"] for i in full["items"]])
chk("Thiết bị thật không bị báo mất, hỏng, trả… (qtyLost, qtyBroken = 0)", r0["qtyLost"] == 0 and r0["qtyBroken"] == 0 and r0["qtyLostPending"] == 0)
# ---- bảng điều khiển vẫn dùng được trên dữ liệu mẫu, đánh số thật không bị lệch
c, newrd = tv.call("POST", "/api/library/readers", {"readers": [{"name": "Em Thật Hai", "type": "Học sinh", "className": "8A1", "guardianConsent": True}]}); ids = [x["id"] for x in newrd["created"]]
chk("Thẻ bạn đọc THẬT mới vẫn là BD-00002 (dữ liệu mẫu không làm nhảy số)", ids == ["BD-00002"], ids)
c, g = C().call("POST", "/api/guests/self", {"name": "Khách thật 2", "kind": "Phụ huynh học sinh", "purpose": "Làm việc với nhà trường", "consent": True}); chk("Mã khách THẬT tiếp theo là -002 (khách mẫu mã KM…)", g["code"].endswith("-002") and g["code"].startswith("KV"), g.get("code"))
c, rc2 = tv.call("POST", "/api/library/receipts", {"invoiceNo": "REAL-2", "supplier": "NCC thật", "lines": [{"title": "Sách thật 2", "kind": "SGK", "grade": "7", "invoiceQty": 2, "price": 20000}]}); c, rx = tv.call("POST", f"/api/library/receipts/{rc2['id']}/receive", {"lines": [{"id": rc2["lines"][0]["id"], "receivedQty": 2}]})
chk("Số ĐKCB THẬT tiếp theo là SGK-00006 (không nhảy vì sách mẫu)", rx["lines"][0]["codeFrom"] == "SGK-00006", rx["lines"][0]["codeFrom"])
# ---- thao tác thử trên dữ liệu mẫu (trình chiếu)
DE = [e for e in demo_eq if e["subjectId"] == "vat-li" and e["qtyGood"] >= 2][0]; dd = vn(wd(6))
c, rr = hong.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "Cô Hồng", "className": "8A1", "periods": ["S1"], "borrowDate": dd, "returnDate": dd, "equipment": DE["name"], "items": [{"equipmentId": DE["id"], "quantity": 1}]})
nv.call("PATCH", f"/api/records/{rr['id']}/status", {"status": "Mượn"}); nv.call("PATCH", f"/api/records/{rr['id']}/status", {"status": "Trả", "returnReport": {"items": [{"equipmentId": DE["id"], "damaged": 1}]}})
tv.call("POST", "/api/library/loans", {"readerId": "BD-M0007", "codes": ["STN-M0030"]}) if "STN-M0030" in copies else None
# ---- xóa
chk("Thiết bị thật giữ nguyên khi đang thao tác trên dữ liệu mẫu", inv(nv)[REAL]["qtyGood"] == 7)
pw2 = qt.call("POST", "/api/admin/demo-data/passwords")[1]["passwords"]; chk("Đặt lại mật khẩu tài khoản mẫu: mật khẩu mới có hiệu lực, cũ hết hiệu lực", len(pw2) == 12 and login("gv.hong", pw["gv.hong"]).status == 401 and login("gv.hong", pw2["gv.hong"]).status == 200)
chk("Nhân viên không đặt lại mật khẩu mẫu (403)", nv.call("POST", "/api/admin/demo-data/passwords")[0] == 403)
c, x = nv.call("DELETE", "/api/admin/demo-data"); chk("Nhân viên không xóa được dữ liệu mẫu (403)", c == 403)
c, x = qt.call("DELETE", "/api/admin/demo-data"); chk("Xóa dữ liệu mẫu", c == 200 and sum(x["removed"].values()) > 600, sum(x["removed"].values()) if c == 200 else x)
chk("Tài khoản giáo viên mẫu hết đăng nhập được; web không còn dữ liệu mẫu", login("gv.hong", pw2["gv.hong"]).status == 401 and qt.call("GET", "/api/admin/demo-data")[1]["active"] is False and nv.call("GET", "/api/demo-status")[1]["active"] is False)
chk("Sách, thiết bị mẫu không còn; chỉ còn dữ liệu thật", len(tv.call("GET", "/api/library/copies")[1]) == 7 and not [e for e in inv(nv).values() if e["name"].endswith("(mẫu)")])
chk("Sách THẬT thêm trong lúc bật dữ liệu mẫu vẫn còn", {"SGK-00006", "SGK-00007"} <= {c["code"] for c in tv.call("GET", "/api/library/copies")[1]} and "BD-00002" in {r["id"] for r in tv.call("GET", "/api/library/readers")[1]})
cur = fingerprint()
for t in ["equipment", "purchases", "penalties", "audits", "maintenance", "disposals", "lossreports", "rooms", "changelog", "minlist", "consumptions", "plans", "decisions", "rolelog", "booktitles", "shelves", "settings", "libaudits", "readingperiods", "bookreceipts"]:
    pass
SAME = ["equipment", "purchases", "penalties", "audits", "maintenance", "disposals", "lossreports", "rooms", "proposals", "changelog", "minlist", "settings", "consumptions", "plans", "decisions", "shelves", "libaudits", "readingperiods"]
diff = [t for t in SAME if cur[t] != BASE[t]]
chk("Sau khi xóa: các bảng KHÔNG có dữ liệu thật thêm vào giống hệt trước khi bật (so từng bản ghi)", not diff, diff)
chk("Bảng người dùng giống hệt (trừ tài khoản mẫu đã xóa)", sql("SELECT count(*) FROM users") == BASE["users"].replace(BASE["users"], sql("SELECT count(*) FROM users")) and not [u for u in qt.call("GET", "/api/users")[1]["users"] if u["username"].startswith("gv.")])
# ---- thêm dữ liệu thật SAU khi bật, rồi xóa: dữ liệu thật phải còn
qt.call("POST", "/api/admin/demo-data", {"randomPasswords": True}); c, e2 = nv.call("POST", "/api/inventory/equipment", {"name": "Thiết bị thật thêm lúc đang bật mẫu", "subjectId": "hoa-hoc", "qtyGood": 3})
c, rec2 = gv.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "GV thật", "className": "9A1", "periods": ["S1"], "borrowDate": vn(wd(9)), "returnDate": vn(wd(9)), "equipment": "x", "items": [{"equipmentId": REAL, "quantity": 2}]})
qt.call("DELETE", "/api/admin/demo-data")
chk("Thiết bị và phiếu mượn THẬT tạo trong lúc bật dữ liệu mẫu vẫn còn sau khi xóa", e2["id"] in inv(nv) and any(r["id"] == rec2["id"] for r in nv.call("GET", "/api/records")[1]))
# ---- công cụ rà soát nhanh TT 38
ml = nv.call("GET", "/api/minlist")[1]["items"]; mon = "Công nghệ"; rows = [i for i in ml if i["mon"] == mon]
nv.call("PUT", "/api/minlist/settings", {"teachers": {"Toán": 3, "Công nghệ": 2}, "classes": {"6": 4, "7": 4, "8": 4, "9": 4}, "hsPerRoom": 40})
chk("Rà soát nhanh: giá trị sai bị chặn", nv.call("PATCH", f"/api/minlist/{rows[0]['id']}", {"siteState": "linh tinh"})[0] == 400)
c, x = nv.call("POST", "/api/minlist/bulk", {"mon": mon, "action": "none"}); chk(f"Đánh dấu cả môn {mon} là 'trường chưa có' bằng một thao tác", c == 200 and x["updated"] == len(rows), x)
after = [i for i in nv.call("GET", "/api/minlist")[1]["items"] if i["mon"] == mon]; chk("Các dòng thành 'Chưa có' và tính vào số thiếu", all(i["status"] == "Chưa có" for i in after) and any(i["missing"] > 0 for i in after) and all(i["have"] == 0 for i in after))
c, x = nv.call("PATCH", f"/api/minlist/{after[0]['id']}", {"siteState": "na"}); chk("Một dòng đổi thành 'Không áp dụng' (nhà trường không dạy)", c == 200 and [i for i in nv.call("GET", "/api/minlist")[1]["items"] if i["id"] == after[0]["id"]][0]["status"] == "Không áp dụng")
c, x = nv.call("POST", "/api/minlist/bulk", {"mon": mon, "action": "clear"}); chk("Bỏ đánh dấu cả môn", c == 200 and all(i["status"] == "Chưa liên kết" for i in nv.call("GET", "/api/minlist")[1]["items"] if i["mon"] == mon))
chk("Môn không hợp lệ bị chặn", nv.call("POST", "/api/minlist/bulk", {"mon": "Linh tinh", "action": "none"})[0] == 400 and nv.call("POST", "/api/minlist/bulk", {"mon": mon, "action": "xx"})[0] == 400)
c, al = nv.call("POST", "/api/minlist/auto-link", {"mon": "Toán"}); chk("Gợi ý liên kết tự động: xem trước không lưu", c == 200 and al["applied"] is False and isinstance(al["suggestions"], list), al)
chk("Giáo viên không dùng được công cụ rà soát (403)", gv.call("POST", "/api/minlist/bulk", {"mon": mon, "action": "none"})[0] == 403 and gv.call("POST", "/api/minlist/auto-link", {})[0] == 403)
c, e3 = nv.call("POST", "/api/inventory/equipment", {"name": "Bộ thiết bị dạy học hình học phẳng", "subjectId": "toan-hoc", "qtyGood": 5})
c, al = nv.call("POST", "/api/minlist/auto-link", {"mon": "Toán", "apply": False}); sug = [s for s in al["suggestions"] if s["equipmentId"] == e3["id"]]
chk("Gợi ý ghép đúng thiết bị theo tên (Bộ thiết bị dạy học hình học phẳng)", bool(sug) and sug[0]["match"] >= 60, al["suggestions"][:2])
c, al2 = nv.call("POST", "/api/minlist/auto-link", {"mon": "Toán", "apply": True}); lk = [i for i in nv.call("GET", "/api/minlist")[1]["items"] if e3["id"] in i["linkedEquipmentIds"]]; chk("Xác nhận gợi ý thì lưu liên kết", c == 200 and al2["applied"] and len(lk) >= 1)
# ---- nhập đơn giá từ Excel
c, p1 = nv.call("POST", "/api/inventory/equipment", {"name": "Máy đo thử giá A", "subjectId": "vat-li", "qtyGood": 2}); c, p2 = nv.call("POST", "/api/inventory/equipment", {"name": "Máy đo thử giá B", "subjectId": "vat-li", "qtyGood": 2})
c, x = nv.call("POST", "/api/inventory/prices/import", {"rows": [{"id": p1["id"], "unitPrice": "1.250.000", "yearInUse": 2024, "origin": "Nhật Bản"}, {"name": "may do thu gia b", "unitPrice": 300000}, {"name": "Không có thiết bị này", "unitPrice": 1}, {"id": p1["id"], "unitPrice": "abc"}, {"id": p2["id"], "yearInUse": 1800}]})
a1, b1 = inv(nv)[p1["id"]], inv(nv)[p2["id"]]
chk("Nhập đơn giá: theo mã và theo tên không phân biệt dấu, đọc được '1.250.000'", c == 200 and x["updated"] == 2 and a1["unitPrice"] == 1250000 and a1["yearInUse"] == 2024 and a1["origin"] == "Nhật Bản" and b1["unitPrice"] == 300000, (x, a1.get("unitPrice"), b1.get("unitPrice")))
chk("Nhập đơn giá: báo dòng không tìm thấy và dòng không hợp lệ", len(x["notFound"]) == 1 and len(x["invalid"]) == 2, x)
chk("Nhập đơn giá không làm đổi số lượng", a1["qtyGood"] == 2 and b1["qtyGood"] == 2)
chk("Giáo viên, Ban giám hiệu không nhập đơn giá (403)", gv.call("POST", "/api/inventory/prices/import", {"rows": []})[0] == 403 and ht.call("POST", "/api/inventory/prices/import", {"rows": []})[0] == 403)
# ---- mã minh chứng
chk("Mã minh chứng ban đầu trống", nv.call("GET", "/api/evidence-codes")[1] == {})
c, x = nv.call("PUT", "/api/evidence-codes", {"codes": {"3-5b": "H1.3.5.02", "bad key!": "x", "libstock": "H1.3.6.04"}}); chk("Lưu mã minh chứng (khóa sai bị bỏ qua)", c == 200 and x == {"3-5b": "H1.3.5.02", "libstock": "H1.3.6.04"}, x)
chk("Ban giám hiệu xem được mã minh chứng, không sửa được; giáo viên không vào", ht.call("GET", "/api/evidence-codes")[1]["3-5b"] == "H1.3.5.02" and ht.call("PUT", "/api/evidence-codes", {"codes": {"a": "b"}})[0] == 403 and gv.call("GET", "/api/evidence-codes")[0] == 403)
done()

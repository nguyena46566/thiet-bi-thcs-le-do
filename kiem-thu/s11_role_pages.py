from common import *
print("== S11. Trang riêng của nhân viên thiết bị, thủ thư, quản trị hệ thống ==")
nv = login("nhanvientb"); gv = login("giaovien"); tv = login("thuvien"); ht = login("hieutruong"); qt = login("quantri"); tt = login("totruong"); anon = C()
E = [e for e in inv(nv).values() if e["subjectId"] == "vat-li" and e["qtyGood"] >= 3 and e["kind"] == "Thiết bị"][0]
d1, d2, d3 = vn(wd(3)), vn(wd(4)), vn(wd(5))
mk = lambda day, slot: gv.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "Giáo viên (thử nghiệm)", "className": "8A1", "periods": [slot], "borrowDate": day, "returnDate": day, "equipment": E["name"], "items": [{"equipmentId": E["id"], "quantity": 1}]})[1]
# ---- nhân viên thiết bị
so = nv.call("GET", "/api/staff/overview")[1]; chk("Trang nhân viên thiết bị: trống khi chưa có việc", so["pending"] == [] and so["overdue"] == [] and so["issues"] == [] and so["stats"]["types"] > 50, {k: len(v) for k, v in so.items() if isinstance(v, list)})
r1, r2, r3 = mk(d1, "S1"), mk(d2, "S2"), mk(d3, "S3")
so = nv.call("GET", "/api/staff/overview")[1]; chk("Phiếu mới gửi hiện trong 'chờ duyệt', không lộ mã người dùng", len(so["pending"]) == 3 and "userId" not in json.dumps(so["pending"]) and "userEmail" not in json.dumps(so["pending"]))
nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Mượn"}); nv.call("PATCH", f"/api/records/{r2['id']}/status", {"status": "Mượn"})
today_vn = vn(datetime.date.today()); past = vn(datetime.date.today() - datetime.timedelta(days=4))
sql(f"UPDATE records SET data = jsonb_set(jsonb_set(data,'{{returnDate}}','\"{today_vn}\"'),'{{borrowDate}}','\"{today_vn}\"') WHERE id='{r1['id']}'")
sql(f"UPDATE records SET data = jsonb_set(jsonb_set(data,'{{returnDate}}','\"{past}\"'),'{{borrowDate}}','\"{past}\"') WHERE id='{r2['id']}'")
so = nv.call("GET", "/api/staff/overview")[1]; chk("Phiếu đang mượn: đến hạn trả hôm nay và quá hạn được tách riêng", [x["id"] for x in so["dueToday"]] == [r1["id"]] and [x["id"] for x in so["overdue"]] == [r2["id"]] and len(so["pending"]) == 1, (len(so["dueToday"]), len(so["overdue"])))
c, iss = gv.call("POST", f"/api/inventory/equipment/{E['id']}/issues", {"quantity": 1, "note": "Gãy"}); so = nv.call("GET", "/api/staff/overview")[1]
chk("Báo hỏng của giáo viên hiện trong trang việc", [x["id"] for x in so["issues"]] == [iss["id"]])
c, hv = nv.call("POST", "/api/inventory/equipment", {"name": "Hóa chất quá hạn trang việc", "subjectId": "hoa-hoc", "kind": "Hóa chất", "qtyGood": 5, "expiry": vn(datetime.date.today() - datetime.timedelta(days=3)), "minStock": 9})
c, hv2 = nv.call("POST", "/api/inventory/equipment", {"name": "Hóa chất sắp hết hạn trang việc", "subjectId": "hoa-hoc", "kind": "Hóa chất", "qtyGood": 5, "expiry": vn(datetime.date.today() + datetime.timedelta(days=10))})
so = nv.call("GET", "/api/staff/overview")[1]; chk("Cảnh báo kho: hóa chất hết hạn, sắp hết hạn, dưới tồn tối thiểu", so["alerts"]["expired"] >= 1 and so["alerts"]["expiringSoon"] >= 1 and so["alerts"]["lowStock"] >= 1, so["alerts"])
nv.call("POST", "/api/disposals", {"equipmentId": hv["id"], "quantity": 1, "source": "good", "reason": "Thanh lý", "date": today_vn})
c, pr = gv.call("POST", "/api/proposals", {"purpose": "Mua", "items": [{"name": "Bộ A", "subjectId": "vat-li", "quantity": 2, "estPrice": 100000}]}); ht.call("POST", f"/api/proposals/{pr['id']}/decide", {"approve": True})
nv.call("POST", "/api/audits", {"subjectId": "toan-hoc", "title": "Đang kiểm kê thử"})
so = nv.call("GET", "/api/staff/overview")[1]; chk("Đang chờ người khác: thanh lý chờ Ban giám hiệu; đề xuất đã duyệt chờ mua; đợt kiểm kê đang làm", len(so["disposalsWaiting"]) == 1 and [x["id"] for x in so["toBuy"]] == [pr["id"]] and so["auditsRunning"] == 1, (len(so["disposalsWaiting"]), len(so["toBuy"]), so["auditsRunning"]))
chk("Giáo viên, thủ thư, tổ trưởng, Ban giám hiệu không vào trang nhân viên thiết bị (403)", all(x.call("GET", "/api/staff/overview")[0] == 403 for x in (gv, tv, tt, ht, qt)))
# ---- thủ thư
lo = tv.call("GET", "/api/library/overview")[1]; chk("Trang thủ thư: trống khi chưa có việc", lo["overdue"] == [] and lo["compensation"] == [] and lo["receiptsWaiting"] == [] and lo["minReading"] == 3)
L = lambda **k: {"title": "Sách", "kind": "STN", "invoiceQty": 1, "price": 40000, **k}
c, rc = tv.call("POST", "/api/library/receipts", {"invoiceNo": "TT-1", "supplier": "NCC", "lines": [L(title="Truyện A", invoiceQty=4)]})
lo = tv.call("GET", "/api/library/overview")[1]; chk("Phiếu nhập chưa kiểm đếm hiện trong trang việc", [x["invoiceNo"] for x in lo["receiptsWaiting"]] == ["TT-1"] and lo["receiptsWaiting"][0]["lineCount"] == 1)
tv.call("POST", f"/api/library/receipts/{rc['id']}/receive", {"lines": [{"id": rc["lines"][0]["id"], "receivedQty": 4}]})
tv.call("POST", "/api/library/readers", {"readers": [{"name": "Em A", "type": "Học sinh", "className": "7A1", "guardianConsent": True}, {"name": "Em B", "type": "Học sinh", "className": "8A2", "guardianConsent": True}]})
rs = {x["name"]: x["id"] for x in tv.call("GET", "/api/library/readers")[1]}
tv.call("POST", "/api/library/loans", {"readerId": rs["Em A"], "codes": ["STN-00001"]}); tv.call("POST", "/api/library/loans", {"readerId": rs["Em B"], "codes": ["STN-00002"]})
sql("UPDATE bookloans SET data = jsonb_set(data,'{dueDate}','\"2026-01-01\"') WHERE data->>'copyCode'='STN-00001'")
tv.call("POST", "/api/library/returns", {"code": "STN-00002", "condition": "Hỏng"})
lo = tv.call("GET", "/api/library/overview")[1]
chk("Sách quá hạn hiện kèm tên bạn đọc, tên sách, số ngày quá hạn", len(lo["overdue"]) == 1 and lo["overdue"][0]["readerName"] == "Em A" and lo["overdue"][0]["title"] == "Truyện A" and lo["overdue"][0]["overdueDays"] > 100)
chk("Sách hỏng chờ bồi thường hiện kèm số tiền (30% giá = 12.000 đ)", len(lo["compensation"]) == 1 and lo["compensation"][0]["compensation"]["amount"] == 12000)
chk("Lớp chưa đủ tiết đọc được liệt kê (7A1, 8A2 đều 0/3)", {x["className"] for x in lo["readingLacking"]} == {"7A1", "8A2"} and all(x["done"] == 0 for x in lo["readingLacking"]))
chk("Số liệu hôm nay: 2 lượt mượn, 1 lượt trả; 4 bản sách, 2 chưa xếp giá (việc cần làm), 1 đang mượn, 1 hỏng", lo["stats"]["loansToday"] == 2 and lo["stats"]["returnsToday"] == 1 and lo["stats"]["copies"] == 4 and lo["stats"]["unshelved"] == 2 and lo["stats"]["onShelf"] == 0 and lo["stats"]["borrowing"] == 1, lo["stats"])
chk("Nhân viên thiết bị (kiêm thư viện) và Ban giám hiệu xem được; giáo viên, quản trị, tổ trưởng không (403)", nv.call("GET", "/api/library/overview")[0] == 200 and ht.call("GET", "/api/library/overview")[0] == 200 and all(x.call("GET", "/api/library/overview")[0] == 403 for x in (gv, tt, qt)))
# ---- quản trị hệ thống
ao = qt.call("GET", "/api/admin/overview")[1]
chk("Trang quản trị: số liệu hệ thống (PostgreSQL, đăng nhập 24 giờ, tài khoản)", ao["storage"] == "PostgreSQL" and ao["logins24h"]["ok"] >= 5 and ao["users"]["active"] >= 6 and ao["demoActive"] is False)
chk("Cấu hình còn thiếu được liệt kê (bật tài khoản thử nghiệm bị báo)", any("TEST_ACCOUNTS" in c["label"] for c in ao["failedChecks"]) and len(ao["checks"]) == 11)
C().call("POST", "/api/auth/register", {"username": "gv.cho.duyet", "name": "Cô Chờ Duyệt", "password": "Matkhau123", "requestedRoles": ["teacher"]})
gv.call("POST", "/api/me/requests", {"type": "Sửa thông tin", "content": "Sửa chức vụ"})
ao = qt.call("GET", "/api/admin/overview")[1]
chk("Tài khoản chờ duyệt và yêu cầu dữ liệu cá nhân hiện trong trang việc; không lộ mật khẩu băm", [x["username"] for x in ao["pendingUsers"]] == ["gv.cho.duyet"] and len(ao["dataRequests"]) == 1 and "passwordHash" not in json.dumps(ao))
qt.call("POST", "/api/admin/demo-data", {"randomPasswords": True}); chk("Đang bật dữ liệu mẫu thì trang quản trị báo", qt.call("GET", "/api/admin/overview")[1]["demoActive"] is True)
chk("Chỉ quản trị hệ thống vào trang quản trị (403 với các vai trò khác)", all(x.call("GET", "/api/admin/overview")[0] == 403 for x in (gv, nv, tv, ht, tt)))
# ---- tài khoản vai trò mẫu vào đúng trang riêng
pw = qt.call("POST", "/api/admin/demo-data/passwords")[1]["passwords"]
lands = {u: login(u, pw[u]).me["landing"] for u in ("tb.mau", "tv.mau", "bgh.mau", "tt.mau", "gv.hong")}
chk("Tài khoản mẫu vào đúng trang riêng", lands == {"tb.mau": "nv-thiet-bi", "tv.mau": "thu-thu", "bgh.mau": "bgh", "tt.mau": "to-truong", "gv.hong": ""}, lands)
done()

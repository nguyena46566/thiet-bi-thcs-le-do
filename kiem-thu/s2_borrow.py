from common import *
print("== S2. Đăng ký, duyệt, trả thiết bị, điểm thi đua ==")
nv = login("nhanvientb"); gv = login("giaovien"); ht = login("hieutruong"); tv = login("thuvien"); tt = login("totruong")
def mk(**kw):
    d = {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "Giáo viên (thử nghiệm)", "className": "8A1", "periods": ["S1"], "periodPPCT": "Tiết 10", "usageType": "Thực hành", "notes": ""}
    d.update(kw); return d
eq = nv.call("GET", "/api/inventory/equipment")[1]
vl = [e for e in eq if e["subjectId"] == "vat-li" and e["qtyGood"] >= 3 and e.get("kind", "Thiết bị") == "Thiết bị"]
E1, E2 = vl[0], vl[1]
day = wd(5); D = vn(day)
def rec(items, who=gv, day_=None, **kw):
    dd = vn(day_ or day)
    return who.call("POST", "/api/records", mk(borrowDate=dd, returnDate=dd, equipment=", ".join(f"{i['name']} (x{i['quantity']})" for i in items), items=[{"equipmentId": i["id"], "quantity": i["quantity"]} for i in items], **kw))
# ---- kiểm tra đầu vào
chk("Chưa đăng nhập không gửi được phiếu", C().call("POST", "/api/records", mk(borrowDate=D, returnDate=D, items=[{"equipmentId": E1["id"], "quantity": 1}]))[0] == 401)
c, r = gv.call("POST", "/api/records", mk(borrowDate=D, returnDate=D, className="", items=[{"equipmentId": E1["id"], "quantity": 1}], equipment="x")); chk("Thiếu lớp bị chặn (400)", c == 400, r)
c, r = rec([{**E1, "quantity": 1}], periods=[]); chk("Không chọn tiết bị chặn (400)", c == 400 and "tiết" in r["error"], r)
c, r = gv.call("POST", "/api/records", mk(borrowDate="31/02/2027", returnDate="31/02/2027", items=[{"equipmentId": E1["id"], "quantity": 1}], equipment="x")); chk("Ngày không tồn tại bị chặn", c == 400, r)
c, r = gv.call("POST", "/api/records", mk(borrowDate=vn(wd(8)), returnDate=vn(wd(8) - datetime.timedelta(days=1)), items=[{"equipmentId": E1["id"], "quantity": 1}], equipment="x")); chk("Ngày trả trước ngày mượn bị chặn", c == 400, r)
c, r = rec([{**E1, "quantity": 1}], day_=datetime.date.today()); chk("Đăng ký trong vòng 24 giờ bị chặn", c == 400 and "24" in r["error"], r)
c, r = gv.call("POST", "/api/records", mk(subjectId="khong-co", borrowDate=D, returnDate=D, items=[{"equipmentId": E1["id"], "quantity": 1}], equipment="x")); chk("Môn không hợp lệ bị chặn", c == 400, r)
c, r = rec([{"id": "khong-co", "name": "x", "quantity": 1}]); chk("Thiết bị không tồn tại bị chặn", c == 400, r)
c, r = rec([{**E1, "quantity": 0}]); chk("Số lượng 0 bị chặn", c == 400, r)
c, r = rec([{**E1, "quantity": E1["qtyGood"] + 1}]); chk("Vượt số lượng trong kho: báo trùng lịch (409)", c == 409 and "Trùng lịch" in r["error"], r)
# ---- gửi phiếu hợp lệ + chống trùng
c, r1 = rec([{**E1, "quantity": E1["qtyGood"]}], periods=["S1", "S2"]); chk("Gửi phiếu hợp lệ: Chờ duyệt, có số phiếu", c == 201 and r1["status"] == "Chờ duyệt" and r1["code"].startswith("PM"), r1.get("code") if c == 201 else r1)
c, r = rec([{**E1, "quantity": 1}], who=tt, periods=["S2"]); chk("Hết thiết bị ở tiết S2 (giáo viên khác) → 409, nêu người đã đăng ký", c == 409 and "Đã đăng ký trước" in r["error"], r)
c, r = rec([{**E1, "quantity": 1}], who=tt, periods=["S3"]); chk("Tiết khác vẫn đăng ký được", c == 201, r if c != 201 else "")
c, r = rec([{**E1, "quantity": 1}], who=tt, day_=wd(6), periods=["S1"]); chk("Ngày khác vẫn đăng ký được", c == 201)
c, av = gv.call("GET", f"/api/inventory/available?subjectId=vat-li&from={D}&to={D}&periods=S1")
row = [x for x in (av if isinstance(av, list) else av["items"]) if x["id"] == E1["id"]][0]
chk("Số còn trống theo tiết phản ánh phiếu đã gửi (S1 = 0)", row["available"] == 0, row["available"])
c, av2 = gv.call("GET", f"/api/inventory/available?subjectId=vat-li&from={D}&to={D}&periods=S5")
chk("Tiết không ai đăng ký vẫn còn đủ", [x for x in (av2 if isinstance(av2, list) else av2["items"]) if x["id"] == E1["id"]][0]["available"] == E1["qtyGood"])
# ---- phòng bộ môn
c, room = nv.call("POST", "/api/rooms", {"name": "Phòng thử nghiệm A", "kind": "Phòng học bộ môn", "subjectIds": ["vat-li", "hoa-hoc"]}); chk("Tạo phòng bộ môn (2 môn → phòng ghép)", c == 201 and room["combined"] is True, room)
c, ra = rec([{**E2, "quantity": 1}], periods=["C1"], roomId=room["id"]); chk("Đăng ký có phòng", c == 201 and ra.get("roomName") == "Phòng thử nghiệm A", ra if c != 201 else "")
c, r = rec([{**E2, "quantity": 1}], who=tt, periods=["C1"], roomId=room["id"]); chk("Trùng phòng cùng tiết → 409", c == 409 and "Trùng lịch phòng" in r["error"], r)
c, avr = gv.call("GET", f"/api/rooms/availability?from={D}&to={D}&periods=C1"); chk("Danh sách phòng đánh dấu phòng bận", any(x.get("busy") for x in avr if x["id"] == room["id"]), avr)
chk("Giáo viên không tạo/sửa phòng (403)", gv.call("POST", "/api/rooms", {"name": "x"})[0] in (401, 403))
# ---- phiếu của tôi, hủy
c, mine = gv.call("GET", "/api/records/mine"); chk("Phiếu của tôi có phiếu vừa gửi, không lộ email", c == 200 and any(x["id"] == r1["id"] for x in mine) and all("userEmail" not in x for x in mine))
c, pub = C().call("GET", "/api/records"); chk("Danh sách công khai không lộ userId, userEmail", c == 200 and len(pub) > 0 and all("userId" not in x and "userEmail" not in x for x in pub))
c, pub2 = tv.call("GET", "/api/records"); chk("Thủ thư cũng chỉ thấy danh sách đã che", all("userId" not in x for x in pub2))
c, adm = nv.call("GET", "/api/records"); chk("Nhân viên thiết bị thấy đủ thông tin", all("userId" in x for x in adm))
chk("Giáo viên khác không hủy được phiếu của người khác (403/404)", tt.call("DELETE", f"/api/records/{r1['id']}")[0] in (403, 404))
c, rx = rec([{**E2, "quantity": 1}], day_=wd(9), periods=["S4"]); chk("Hủy phiếu chờ duyệt của mình", gv.call("DELETE", f"/api/records/{rx['id']}")[0] == 200)
# ---- duyệt, từ chối
chk("Giáo viên không duyệt được (403)", gv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Mượn"})[0] in (401, 403))
chk("Trạng thái sai bị chặn", nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Linh tinh"})[0] == 400)
c, rj = rec([{**E2, "quantity": 1}], day_=wd(10), periods=["S4"]); c2, x = nv.call("PATCH", f"/api/records/{rj['id']}/status", {"status": "Từ chối", "reason": "Trùng lịch kiểm tra"}); chk("Từ chối kèm lý do", c2 == 200 and x["adminNote"] == "Trùng lịch kiểm tra" and x["status"] == "Từ chối")
c, av3 = gv.call("GET", f"/api/inventory/available?subjectId=vat-li&from={vn(wd(10))}&to={vn(wd(10))}&periods=S4"); chk("Phiếu bị từ chối trả lại số lượng", [x for x in (av3 if isinstance(av3, list) else av3["items"]) if x["id"] == E2["id"]][0]["available"] == E2["qtyGood"])
c, x = nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Mượn"}); chk("Duyệt phiếu: ghi người duyệt, giờ duyệt", c == 200 and x["status"] == "Mượn" and x.get("approvedBy") and x.get("approvedAt"))
chk("Giáo viên không hủy được phiếu đã duyệt", gv.call("DELETE", f"/api/records/{r1['id']}")[0] in (400, 403, 409))
# ---- trả: hỏng + mất
q0 = inv(nv)[E1["id"]]
c, x = nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Trả", "returnReport": {"items": [{"equipmentId": E1["id"], "damaged": 1, "lost": 1}], "note": "Vỡ 1, thiếu 1"}})
chk("Trả: ghi hỏng và mất", c == 200 and x["status"] == "Trả", x if c != 200 else "")
q1 = inv(nv)[E1["id"]]
chk("Kho: tốt giảm 2, hỏng +1, chờ xác nhận mất +1", q1["qtyGood"] == q0["qtyGood"] - 2 and q1["qtyBroken"] == q0["qtyBroken"] + 1 and q1["qtyLostPending"] == q0["qtyLostPending"] + 1, {k: q1[k] for k in ("qtyGood", "qtyBroken", "qtyLostPending")})
lr = nv.call("GET", "/api/loss-reports")[1]; open_l = [x for x in lr["reports"] if x.get("recordId") == r1["id"]]
chk("Tự tạo báo mất chờ xác nhận gắn với phiếu", len(open_l) == 1 and open_l[0]["status"] == "Chờ xác nhận" and open_l[0]["quantity"] == 1)
pt = gv.call("GET", "/api/points/me")[1]
chk("Điểm thi đua: làm hỏng 1 (−5) → còn 95; mất chờ xác nhận chưa trừ", pt["score"] == 95, pt.get("score"))
# ---- hoàn tác trả
c, x = nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Mượn"}); q2 = inv(nv)[E1["id"]]
chk("Hoàn tác trả: số lượng về như trước", c == 200 and q2["qtyGood"] == q0["qtyGood"] and q2["qtyBroken"] == q0["qtyBroken"] and q2["qtyLostPending"] == q0["qtyLostPending"], {k: q2[k] for k in ("qtyGood", "qtyBroken", "qtyLostPending")})
chk("Hoàn tác trả: trả lại điểm đã trừ (100)", gv.call("GET", "/api/points/me")[1]["score"] == 100)
chk("Hoàn tác trả: báo mất bị gỡ", not [x for x in nv.call("GET", "/api/loss-reports")[1]["reports"] if x.get("recordId") == r1["id"] and x["status"] == "Chờ xác nhận"])
c, x = nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Trả", "returnReport": {"items": [{"equipmentId": E1["id"], "damaged": E1["qtyGood"], "lost": 1}]}}); chk("Hỏng + mất vượt số đã mượn bị chặn", c in (400, 409), x)
c, x = nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Trả", "returnReport": {"items": [{"equipmentId": E1["id"], "consumed": 1}]}}); chk("Ghi 'đã dùng hết' cho thiết bị thường bị chặn", c in (400, 409), x)
c, x = nv.call("PATCH", f"/api/records/{r1['id']}/status", {"status": "Trả", "returnReport": {"items": []}}); chk("Trả đủ, không hỏng, không mất", c == 200 and x["status"] == "Trả")
chk("Trả đủ: kho giữ nguyên", inv(nv)[E1["id"]]["qtyGood"] == q0["qtyGood"])
# ---- trả trễ: lần 1 chỉ nhắc, lần 2 trừ điểm
def late_record(day_n, slot):
    c, r = rec([{**E2, "quantity": 1}], who=tt, day_=wd(day_n), periods=[slot]); nv.call("PATCH", f"/api/records/{r['id']}/status", {"status": "Mượn"})
    old = vn(datetime.date.today() - datetime.timedelta(days=3)); sql(f"UPDATE records SET data = jsonb_set(jsonb_set(data,'{{returnDate}}','\"{old}\"'),'{{borrowDate}}','\"{old}\"') WHERE id='{r['id']}'")
    return r
la = late_record(12, "S1"); c, x = nv.call("PATCH", f"/api/records/{la['id']}/status", {"status": "Trả", "returnReport": {"items": []}})
ptt = tt.call("GET", "/api/points/me")[1]; chk("Trả trễ lần 1: chỉ nhắc nhở, không trừ điểm", c == 200 and ptt["score"] == 100, ptt.get("score"))
lb = late_record(13, "S2"); nv.call("PATCH", f"/api/records/{lb['id']}/status", {"status": "Trả", "returnReport": {"items": []}})
chk("Trả trễ lần 2: trừ 2 điểm/ngày × 3 ngày = 6 → còn 94", tt.call("GET", "/api/points/me")[1]["score"] == 94, tt.call("GET", "/api/points/me")[1]["score"])
# ---- khóa khi dưới 70 điểm
chk("Nhân viên thiết bị KHÔNG tự trừ điểm thi đua (403, khi đã có Ban giám hiệu)", nv.call("POST", "/api/points/adjust", {"userId": "pw-giaovien", "teacherName": "x", "points": -35, "reason": "Thử"})[0] == 403)
c, x = ht.call("POST", "/api/points/adjust", {"userId": "pw-giaovien", "teacherName": "Giáo viên (thử nghiệm)", "points": -35, "reason": "Thử khóa"}); chk("Trừ điểm thủ công (cần lý do)", c in (200, 201) and gv.call("GET", "/api/points/me")[1]["score"] == 65, x if c != 200 else "")
c, r = rec([{**E2, "quantity": 1}], day_=wd(14), periods=["S1"]); chk("Dưới 70 điểm: bị khóa đăng ký (403)", c == 403 and "tạm khóa" in r["error"], r)
chk("Nhân viên thiết bị KHÔNG tự mở khóa (403)", nv.call("POST", "/api/points/unlock", {"userId": "pw-giaovien"})[0] == 403)
chk("Ban giám hiệu mở khóa (đưa điểm về mức mở khóa)", ht.call("POST", "/api/points/unlock", {"userId": "pw-giaovien"})[0] in (200, 201) and gv.call("GET", "/api/points/me")[1]["score"] >= 70)
c, r = rec([{**E2, "quantity": 1}], day_=wd(14), periods=["S1"]); chk("Sau mở khóa đăng ký lại được", c == 201, r if c != 201 else "")
chk("Giáo viên không chỉnh điểm của mình (403)", gv.call("POST", "/api/points/adjust", {"userId": "pw-giaovien", "points": 50, "reason": "x"})[0] in (401, 403))
# ---- hóa chất hết hạn, thiết bị giá trị cao
c, chem = nv.call("POST", "/api/inventory/equipment", {"name": "Hóa chất quá hạn thử", "subjectId": "hoa-hoc", "kind": "Hóa chất", "qtyGood": 5, "expiry": vn(datetime.date.today() - datetime.timedelta(days=10)), "hazard": "Độc", "minStock": 2})
c2, r = rec([{"id": chem["id"], "name": chem["name"], "quantity": 1}], subjectId="hoa-hoc", subjectName="Hóa học", day_=wd(15), periods=["S1"]); chk("Hóa chất quá hạn: chặn mượn (409)", c2 == 409 and "hết hạn" in r["error"], r)
c, hv = nv.call("POST", "/api/inventory/equipment", {"name": "Máy chiếu giá trị cao thử", "subjectId": "vat-li", "qtyGood": 2, "unitPrice": 8500000, "highValue": True})
c, rh = rec([{"id": hv["id"], "name": hv["name"], "quantity": 1}], day_=wd(16), periods=["S1"], **{}) if False else (None, None)
dd1, dd2 = vn(wd(16)), vn(wd(18))
c, rh = gv.call("POST", "/api/records", mk(borrowDate=dd1, returnDate=dd2, equipment=hv["name"] + " (x1)", periods=["S1", "S2"], items=[{"equipmentId": hv["id"], "quantity": 1}]))
chk("Thiết bị giá trị cao mượn nhiều ngày: gắn nhãn duyệt đặc biệt", c == 201 and rh.get("needsSpecialApproval") is True, rh if c != 201 else rh.get("specialReason"))
c, x = nv.call("PATCH", f"/api/records/{rh['id']}/status", {"status": "Mượn"}); chk("Duyệt không có ghi chú Ban giám hiệu bị chặn (409/403)", c in (403, 409), x)
c, x = nv.call("PATCH", f"/api/records/{rh['id']}/status", {"status": "Mượn", "specialApprovalNote": "BGH đồng ý bằng miệng 20/11"}); chk("Đã có Ban giám hiệu: nhân viên thiết bị KHÔNG duyệt được phiếu giá trị cao dù ghi chú (403)", c == 403, c)
# ---- thông báo
c, n = nv.call("GET", "/api/notifications"); chk("Nhân viên thiết bị nhận thông báo phiếu mới", c == 200 and len(n) >= 3, len(n))
c, u = nv.call("GET", "/api/notifications/unread-count"); chk("Đếm thông báo chưa đọc", c == 200)
chk("Đánh dấu đã đọc tất cả", nv.call("POST", "/api/notifications/mark-all-read")[0] == 200 and nv.call("GET", "/api/notifications/unread-count")[1] in (0, {"count": 0}, {"unread": 0}))
chk("Thống kê tổng quan", nv.call("GET", "/api/stats")[0] == 200 and nv.call("GET", "/api/stats/vat-li")[0] == 200)
done()

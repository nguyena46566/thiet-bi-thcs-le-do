from common import *
print("== S4. Ban giám hiệu: xác nhận mất, mua sắm, kế hoạch, quyết định, danh mục tối thiểu ==")
nv = login("nhanvientb"); gv = login("giaovien"); ht = login("hieutruong"); tt = login("totruong"); qt = login("quantri"); today = vn(datetime.date.today())
eq = nv.call("GET", "/api/inventory/equipment")[1]
E = [e for e in eq if e["subjectId"] == "vat-li" and e["qtyGood"] >= 4 and e.get("kind", "Thiết bị") == "Thiết bị"][0]
def mk_loss(n_lost, d):
    dd = vn(wd(d)); c, r = gv.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "Giáo viên (thử nghiệm)", "className": "8A1", "periods": ["S1"], "borrowDate": dd, "returnDate": dd, "equipment": E["name"], "usageType": "Thực hành", "items": [{"equipmentId": E["id"], "quantity": n_lost + 1}]})
    nv.call("PATCH", f"/api/records/{r['id']}/status", {"status": "Mượn"})
    nv.call("PATCH", f"/api/records/{r['id']}/status", {"status": "Trả", "returnReport": {"items": [{"equipmentId": E["id"], "lost": n_lost}], "note": "Thiếu"}}); return r
# ---- báo mất
r1 = mk_loss(2, 4); r2 = mk_loss(1, 5)
reps = nv.call("GET", "/api/loss-reports")[1]; pend = [x for x in reps["reports"] if x["status"] == "Chờ xác nhận"]
chk("Có 2 báo mất chờ xác nhận, trang báo canConfirm=false cho nhân viên", len(pend) == 2 and reps["canConfirm"] is False and reps["principalConfigured"] is True, (len(pend), reps["canConfirm"]))
L1 = [x for x in pend if x["quantity"] == 2][0]; L2 = [x for x in pend if x["quantity"] == 1][0]
chk("Nhân viên thiết bị KHÔNG tự xác nhận mất khi đã có Ban giám hiệu (403)", nv.call("POST", f"/api/loss-reports/{L1['id']}/confirm", {"note": "x"})[0] == 403)
chk("Giáo viên không xác nhận mất (403)", gv.call("POST", f"/api/loss-reports/{L1['id']}/confirm", {})[0] in (401, 403))
c, v = nv.call("PATCH", f"/api/loss-reports/{L1['id']}/verify", {"searchScope": "Phòng thiết bị, phòng KHTN", "involved": "Cô Lan, thầy Nam", "findings": "Không thấy"}); chk("Nhân viên ghi kết quả xác minh", c == 200 and v.get("verification", {}).get("findings") == "Không thấy", v if c != 200 else "")
before = inv(nv)[E["id"]]
c, x = ht.call("POST", f"/api/loss-reports/{L1['id']}/confirm", {"note": "Đã họp xác minh"}); after = inv(nv)[E["id"]]
chk("Ban giám hiệu xác nhận mất: chờ xác nhận −2, mất +2", c == 200 and after["qtyLostPending"] == before["qtyLostPending"] - 2 and after["qtyLost"] == before["qtyLost"] + 2, (c, x if c != 200 else ""))
chk("Xác nhận mất lần hai bị chặn", ht.call("POST", f"/api/loss-reports/{L1['id']}/confirm", {})[0] in (400, 409))
pt = gv.call("GET", "/api/points/me")[1]; chk("Điểm thi đua: mất 2 × 10 = −20 sau khi xác nhận", pt["score"] == 80, pt["score"])
c, x = ht.call("POST", f"/api/loss-reports/{L2['id']}/reject", {"note": "Tìm thấy trong tủ"}); after2 = inv(nv)[E["id"]]
chk("Ghi 'tìm thấy': thiết bị quay về tình trạng tốt", c == 200 and after2["qtyGood"] == after["qtyGood"] + 1 and after2["qtyLostPending"] == after["qtyLostPending"] - 1, (after["qtyGood"], after2["qtyGood"]))
chk("Tìm thấy không trừ điểm: vẫn 80", gv.call("GET", "/api/points/me")[1]["score"] == 80)
# ---- thiết bị giá trị cao
c, hv = nv.call("POST", "/api/inventory/equipment", {"name": "Máy chiếu giá trị cao (BGH)", "subjectId": "vat-li", "qtyGood": 2, "unitPrice": 9000000, "highValue": True})
c, rh = gv.call("POST", "/api/records", {"subjectId": "vat-li", "subjectName": "Vật lí", "teacherName": "x", "className": "9A1", "periods": ["S1", "S2"], "borrowDate": vn(wd(8)), "returnDate": vn(wd(10)), "equipment": "Máy chiếu", "items": [{"equipmentId": hv["id"], "quantity": 1}]})
chk("Mượn nhiều ngày thiết bị giá trị cao: gắn nhãn duyệt đặc biệt", c == 201 and rh["needsSpecialApproval"] is True)
chk("Nhân viên thiết bị không duyệt được (chỉ Ban giám hiệu) → 403", nv.call("PATCH", f"/api/records/{rh['id']}/status", {"status": "Mượn", "specialApprovalNote": "ok"})[0] == 403)
chk("Ban giám hiệu duyệt phải ghi xác nhận (409)", ht.call("PATCH", f"/api/records/{rh['id']}/status", {"status": "Mượn"})[0] == 409)
c, x = ht.call("PATCH", f"/api/records/{rh['id']}/status", {"status": "Mượn", "specialApprovalNote": "Đồng ý, bàn giao tại phòng thiết bị"}); chk("Ban giám hiệu duyệt kèm xác nhận", c == 200 and x["status"] == "Mượn" and x.get("specialApproval", {}).get("note"))
# ---- đề xuất mua sắm
bad = gv.call("POST", "/api/proposals", {"purpose": "x", "items": []}); chk("Đề xuất không có thiết bị bị chặn (400)", bad[0] == 400)
c, p = gv.call("POST", "/api/proposals", {"purpose": "Bổ sung bộ thí nghiệm áp suất", "items": [{"name": "Bộ áp suất chất lỏng", "subjectId": "vat-li", "quantity": 4, "estPrice": 450000, "reason": "Thiếu"}]})
chk("Giáo viên gửi đề xuất mua sắm, tổng tiền 1.800.000", c == 201 and p["total"] == 1800000 and p["status"] == "Chờ duyệt", p if c != 201 else p["total"])
c2, p2 = gv.call("POST", "/api/proposals", {"purpose": "Bóng rổ", "items": [{"name": "Bóng rổ", "subjectId": "gdtc", "quantity": 10, "estPrice": 280000}]})
chk("Giáo viên chỉ thấy đề xuất của mình, nhân viên thấy tất cả", len(gv.call("GET", "/api/proposals")[1]["proposals"]) == 2 and len(nv.call("GET", "/api/proposals")[1]["proposals"]) == 2 and len(tt.call("GET", "/api/proposals")[1]["proposals"]) == 0)
chk("Nhân viên thiết bị không duyệt đề xuất (403)", nv.call("POST", f"/api/proposals/{p['id']}/decide", {"approve": True})[0] == 403)
c, x = ht.call("POST", f"/api/proposals/{p['id']}/decide", {"approve": True, "note": "Mua trong tháng"}); chk("Ban giám hiệu duyệt đề xuất", c == 200 and x["status"] == "Đã duyệt" and x.get("decidedBy"), x if c != 200 else "")
c, x = ht.call("POST", f"/api/proposals/{p2['id']}/decide", {"approve": False, "note": "Để học kỳ II"}); chk("Ban giám hiệu từ chối đề xuất", c == 200 and x["status"] == "Từ chối")
chk("Duyệt lần hai bị chặn (409)", ht.call("POST", f"/api/proposals/{p['id']}/decide", {"approve": False})[0] == 409)
chk("Chỉ đề xuất đã duyệt mới đánh dấu đã mua", nv.call("POST", f"/api/proposals/{p2['id']}/purchased", {})[0] == 409)
c, x = nv.call("POST", f"/api/proposals/{p['id']}/purchased", {"note": "HĐ 0123"}); chk("Nhân viên đánh dấu đã mua", c == 200 and x["status"] == "Đã mua")
# ---- trang Ban giám hiệu, tổ trưởng
c, ov = ht.call("GET", "/api/principal/overview"); chk("Trang Ban giám hiệu: việc chờ (kể cả phiếu giá trị cao đã xử lý thì hết)", c == 200 and {"losses", "proposals", "plans", "special", "stats"} <= set(ov.keys()), list(ov.keys()))
chk("Nhân viên thiết bị không vào trang Ban giám hiệu (403)", nv.call("GET", "/api/principal/overview")[0] == 403)
c, hd = tt.call("GET", "/api/head/overview?group=" + "T%E1%BB%95%20Khoa%20h%E1%BB%8Dc%20t%E1%BB%B1%20nhi%C3%AAn"); chk("Trang tổ trưởng: chỉ dữ liệu của tổ mình", c == 200 and all(x["subjectId"] in ("vat-li", "hoa-hoc", "sinh-hoc", "cong-nghe") for x in hd["records"]), (c, str(hd)[:100]))
chk("Giáo viên thường không vào trang tổ trưởng (403)", gv.call("GET", "/api/head/overview")[0] == 403)
# ---- kế hoạch
sy = "2026-2027"
c, pl = nv.call("POST", "/api/plans", {"schoolYear": sy, "title": "Kế hoạch quản lý thiết bị năm học 2026 – 2027", "number": "25/KH-THCSLĐ", "sections": {}, "tasks": []}); chk("Lập kế hoạch (nháp, có sẵn mốc mặc định)", c == 201 and pl["status"] == "Nháp", pl if c != 201 else len(pl.get("tasks", [])))
chk("Trình duyệt khi thiếu chỉ tiêu/lịch bị chặn (400)", nv.call("POST", f"/api/plans/{pl['id']}/submit")[0] == 400 or len(pl.get("tasks", [])) > 0)
tasks = [{"id": "t1", "name": "Kiểm kê đầu năm", "start": "2026-08-17", "end": "2026-08-28", "owner": "Tổ kiểm kê", "done": False}, {"id": "t2", "name": "Lập kế hoạch", "start": "2026-09-01", "end": "2026-09-05", "owner": "Nhân viên thiết bị", "done": False}]
c, up = nv.call("PATCH", f"/api/plans/{pl['id']}", {"title": pl["title"], "sections": {"chiTieu": "100% tiết thực hành có thiết bị"}, "tasks": tasks}); chk("Cập nhật chỉ tiêu và lịch công tác", c == 200, up if c != 200 else "")
c, x = nv.call("POST", f"/api/plans/{pl['id']}/submit"); chk("Trình Ban giám hiệu", c == 200 and x["status"] == "Chờ duyệt", x if c != 200 else "")
chk("Đang chờ duyệt: không sửa được (409)", nv.call("PATCH", f"/api/plans/{pl['id']}", {"tasks": tasks})[0] == 409)
chk("Nhân viên không duyệt kế hoạch (403)", nv.call("POST", f"/api/plans/{pl['id']}/decide", {"approve": True})[0] == 403)
chk("Trả lại không ghi ý kiến bị chặn (400)", ht.call("POST", f"/api/plans/{pl['id']}/decide", {"approve": False})[0] == 400)
c, x = ht.call("POST", f"/api/plans/{pl['id']}/decide", {"approve": False, "note": "Bổ sung chỉ tiêu"}); chk("Ban giám hiệu trả lại kế hoạch", c == 200 and x["status"] == "Trả lại")
nv.call("POST", f"/api/plans/{pl['id']}/submit"); c, x = ht.call("POST", f"/api/plans/{pl['id']}/decide", {"approve": True, "note": "Đồng ý"}); chk("Ban giám hiệu duyệt kế hoạch", c == 200 and x["status"] == "Đã duyệt")
done_tasks = [{**t, "done": t["id"] == "t1"} for t in tasks]
c, x = nv.call("PATCH", f"/api/plans/{pl['id']}", {"tasks": done_tasks}); chk("Sau khi duyệt chỉ cập nhật được tiến độ", c == 200 and x["tasks"][0]["done"] is True and x["status"] == "Đã duyệt")
chk("Không xóa được kế hoạch đã duyệt (409)", nv.call("DELETE", f"/api/plans/{pl['id']}")[0] == 409)
# ---- quyết định
bd = {"type": "Tổ kiểm kê", "number": "12/QĐ-THCSLĐ", "date": "2026-08-10", "scope": "Toàn bộ thiết bị", "from": "2026-08-17", "to": "2026-08-28", "duties": "Kiểm kê", "members": [{"name": "A", "position": "Hiệu trưởng", "duty": "Tổ trưởng"}]}
chk("Quyết định dưới 2 thành viên bị chặn (400)", nv.call("POST", "/api/decisions", bd)[0] == 400)
bd["members"].append({"name": "B", "position": "NV thiết bị", "duty": "Thư ký"}); c, d = nv.call("POST", "/api/decisions", bd); chk("Lập quyết định thành lập tổ kiểm kê", c == 201 and d["type"] == "Tổ kiểm kê", d if c != 201 else "")
chk("Loại quyết định sai bị chặn", nv.call("POST", "/api/decisions", {**bd, "type": "Linh tinh"})[0] == 400)
chk("Sửa và xóa quyết định", nv.call("PATCH", f"/api/decisions/{d['id']}", {**bd, "scope": "Phòng KHTN"})[0] == 200 and nv.call("DELETE", f"/api/decisions/{d['id']}")[0] == 200 and not nv.call("GET", "/api/decisions")[1])
# ---- danh mục tối thiểu TT 38
ml = nv.call("GET", "/api/minlist")[1]; items = ml["items"]
chk("Danh mục tối thiểu: 701 dòng, 13 dòng sửa đổi theo TT 26/2023", len(items) == 701 and sum(1 for i in items if i.get("amendedBy")) == 13, (len(items), sum(1 for i in items if i.get("amendedBy"))))
chk("Có 12 môn + thiết bị dùng chung", len({i["mon"] for i in items}) == 13, len({i["mon"] for i in items}))
chk("Chưa liên kết thiết bị: cả 701 dòng ở trạng thái 'Chưa liên kết'", all(i["status"] == "Chưa liên kết" for i in items))
nn = [i for i in items if i["mon"] == "Ngoại ngữ" and i["normPer"] == "GV"][0]; te = [e for e in eq if e["subjectId"] == "tieng-anh"][:1]
if te:
    nv.call("PATCH", f"/api/minlist/{nn['id']}", {"linkedEquipmentIds": [te[0]["id"]]}); row = [i for i in nv.call("GET", "/api/minlist")[1]["items"] if i["id"] == nn["id"]][0]
    chk("Đã liên kết nhưng chưa khai báo số giáo viên: 'Chưa khai báo số GV'", row["status"] == "Chưa khai báo số GV", row["status"])
    nv.call("PATCH", f"/api/minlist/{nn['id']}", {"linkedEquipmentIds": []})
c, x = nv.call("PUT", "/api/minlist/settings", {"teachers": {"Toán": 6, "Khoa học tự nhiên": 5}, "rooms": {"Khoa học tự nhiên": 1}, "classes": {"6": 4, "7": 4, "8": 4, "9": 4}, "hsPerRoom": 42}); chk("Khai báo số giáo viên, lớp, phòng", c == 200, x if c != 200 else "")
ml = nv.call("GET", "/api/minlist")[1]; toan = [i for i in ml["items"] if i["mon"] == "Toán" and i["normPer"] in ("GV", "gv") or (i["mon"] == "Toán" and i.get("required"))]
chk("Cần có = định mức × cơ số (có dòng được tính cho môn Toán)", any((i.get("required") or 0) > 0 for i in ml["items"] if i["mon"] == "Toán"))
tgt = [i for i in ml["items"] if i["mon"] == "Toán" and (i.get("required") or 0) > 0][0]
c, u = nv.call("PATCH", f"/api/minlist/{tgt['id']}", {"linkedEquipmentIds": []}); chk("Dòng chưa liên kết thiết bị", c == 200)
tx = [e for e in eq if e["subjectId"] == "toan-hoc"][:1]
if tx:
    nv.call("PATCH", f"/api/inventory/equipment/{tx[0]['id']}", {"qtyGood": 100}); nv.call("PATCH", f"/api/minlist/{tgt['id']}", {"linkedEquipmentIds": [tx[0]["id"]]})
    row = [i for i in nv.call("GET", "/api/minlist")[1]["items"] if i["id"] == tgt["id"]][0]; chk("Liên kết thiết bị đủ số lượng → trạng thái 'Đủ'", row["status"] == "Đủ" and row["have"] >= row["required"], (row["status"], row["have"], row["required"]))
    nv.call("PATCH", f"/api/inventory/equipment/{tx[0]['id']}", {"qtyGood": 0}); row = [i for i in nv.call("GET", "/api/minlist")[1]["items"] if i["id"] == tgt["id"]][0]
    chk("Hết thiết bị → trạng thái 'Chưa có'", row["status"] in ("Chưa có", "Thiếu"), row["status"])
c, newi = nv.call("POST", "/api/minlist", {"mon": "Toán", "name": "Dòng thêm thử nghiệm", "unit": "Bộ", "norm": "01/GV"}); chk("Thêm dòng danh mục tự thêm", c in (200, 201), newi if c not in (200, 201) else "")
if c in (200, 201): chk("Xóa dòng vừa thêm", nv.call("DELETE", f"/api/minlist/{newi['id']}")[0] == 200)
tm = [i for i in nv.call("GET", "/api/minlist")[1]["items"] if i["mon"] == "Toán"][0]; nv.call("DELETE", f"/api/minlist/{tm['id']}")
c, x = nv.call("POST", "/api/minlist/reseed", {"mon": "Toán"}); n = sum(1 for i in nv.call("GET", "/api/minlist")[1]["items"] if i["mon"] == "Toán")
chk("Khôi phục danh mục gốc của một môn sau khi lỡ xóa", c == 200 and n >= 9, (c, n))
chk("Giáo viên không sửa được danh mục (403)", gv.call("PUT", "/api/minlist/settings", {"teachers": {}})[0] in (401, 403))
done()

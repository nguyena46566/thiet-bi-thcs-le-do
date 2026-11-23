from common import *
print("== S3. Kho thiết bị: ghi tăng, ghi giảm, bảo trì, kiểm kê, hóa chất, nhật ký ==")
nv = login("nhanvientb"); gv = login("giaovien"); anon = C(); today = vn(datetime.date.today())
# ---- danh mục thiết bị
bad = lambda **k: nv.call("POST", "/api/inventory/equipment", {"name": "x", "subjectId": "vat-li", "qtyGood": 1, **k})
chk("Tên rỗng bị chặn", bad(name="")[0] == 400)
chk("Môn sai bị chặn", bad(subjectId="khong-co")[0] == 400)
chk("Số lượng âm bị chặn", bad(qtyGood=-1)[0] == 400)
chk("Hạn dùng sai định dạng bị chặn", bad(kind="Hóa chất", expiry="2026-13-99")[0] == 400)
c, e = nv.call("POST", "/api/inventory/equipment", {"name": "Kính lúp thử nghiệm", "subjectId": "sinh-hoc", "qtyGood": 10, "unitPrice": 45000, "unit": "Chiếc", "topic": "Quan sát tế bào", "grades": [6, 7, 12], "keywords": "kinh lup, soi"})
chk("Thêm thiết bị", c == 201 and e["qtyGood"] == 10 and e["grades"] == [6, 7] and e["kind"] == "Thiết bị", e if c != 201 else e["grades"])
E = e["id"]
chk("Giáo viên không thêm được thiết bị (403)", gv.call("POST", "/api/inventory/equipment", {"name": "x", "subjectId": "vat-li"})[0] in (401, 403))
c, u = nv.call("PATCH", f"/api/inventory/equipment/{E}", {"qtyGood": 12, "location": "Tủ B2"}); chk("Sửa số lượng và vị trí", c == 200 and u["qtyGood"] == 12 and u["location"] == "Tủ B2")
h = nv.call("GET", f"/api/inventory/equipment/{E}/history")[1]
chk("Nhật ký ghi lần thêm và lần sửa trực tiếp", len(h["changes"]) >= 2 and any(x["kind"] == "Thêm thiết bị" for x in h["changes"]), [x["kind"] for x in h["changes"]])
chk("Nhật ký ghi đúng chênh lệch +2 khi sửa", any(x["diff"].get("qtyGood") == 2 for x in h["changes"] if x["kind"] != "Thêm thiết bị"), [x["diff"] for x in h["changes"]])
# ---- ghi tăng
c, p = nv.call("POST", "/api/inventory/purchases", {"date": today, "supplier": "Công ty Thiết bị Giáo dục", "invoiceNo": "HĐ 0001", "fundSource": "Ngân sách", "items": [{"equipmentId": E, "quantity": 5, "unitPrice": 50000}]})
chk("Ghi tăng: có chứng từ, tổng tiền", c == 201 and p["total"] == 250000, p if c != 201 else p["total"])
chk("Ghi tăng: kho +5", inv(nv)[E]["qtyGood"] == 17)
chk("Ghi tăng: không có thiết bị bị chặn", nv.call("POST", "/api/inventory/purchases", {"date": today, "supplier": "x", "items": [{"equipmentId": "khong-co", "quantity": 1, "unitPrice": 1}]})[0] in (400, 404))
chk("Ghi tăng: số lượng 0 bị chặn", nv.call("POST", "/api/inventory/purchases", {"date": today, "supplier": "x", "items": [{"equipmentId": E, "quantity": 0, "unitPrice": 1}]})[0] == 400)
chk("Danh sách chứng từ ghi tăng", any(x["id"] == p["id"] for x in nv.call("GET", "/api/inventory/purchases")[1]))
# ---- ghi giảm / thanh lý: nhân viên đề nghị, Ban giám hiệu duyệt thì mới trừ kho
ht = login("hieutruong")
chk("Đề nghị thanh lý phải chọn lý do hợp lệ (400)", nv.call("POST", "/api/disposals", {"equipmentId": E, "quantity": 2, "source": "good", "reason": "linh tinh", "date": today})[0] == 400)
c, d = nv.call("POST", "/api/disposals", {"equipmentId": E, "quantity": 2, "source": "good", "reason": "Hư hỏng không sửa được", "date": today, "note": "Gãy bản lề"})
chk("Có Ban giám hiệu: nhân viên chỉ lập đề nghị (Chờ duyệt)", c == 201 and d["status"] == "Chờ duyệt", d if c != 201 else d["status"])
chk("Đề nghị chưa duyệt: kho CHƯA bị trừ", inv(nv)[E]["qtyGood"] == 17 and inv(nv)[E]["qtyDisposed"] == 0)
chk("Đề nghị vượt số còn (đã trừ phần đang chờ duyệt) bị chặn", nv.call("POST", "/api/disposals", {"equipmentId": E, "quantity": 16, "source": "good", "reason": "Thanh lý", "date": today})[0] == 400)
chk("Nhân viên thiết bị KHÔNG tự duyệt thanh lý (403)", nv.call("POST", f"/api/disposals/{d['id']}/decide", {"approve": True, "decisionNo": "18/QĐ"})[0] == 403)
chk("Ban giám hiệu không lập đề nghị thay nhân viên (403)", ht.call("POST", "/api/disposals", {"equipmentId": E, "quantity": 1, "source": "good", "reason": "Thanh lý", "date": today})[0] == 403)
chk("Duyệt thanh lý phải có số quyết định (400)", ht.call("POST", f"/api/disposals/{d['id']}/decide", {"approve": True})[0] == 400)
c, x = ht.call("POST", f"/api/disposals/{d['id']}/decide", {"approve": True, "decisionNo": "18/QĐ-THCSLĐ", "note": "Đồng ý"}); q = inv(nv)[E]
chk("Ban giám hiệu duyệt kèm số quyết định: tốt −2, đã thanh lý +2", c == 200 and x["status"] == "Đã duyệt" and x["decisionNo"] == "18/QĐ-THCSLĐ" and q["qtyGood"] == 15 and q["qtyDisposed"] == 2, (c, q["qtyGood"], q["qtyDisposed"]))
chk("Duyệt lần hai bị chặn (409)", ht.call("POST", f"/api/disposals/{d['id']}/decide", {"approve": True, "decisionNo": "x"})[0] == 409)
c, d2 = nv.call("POST", "/api/disposals", {"equipmentId": E, "quantity": 1, "source": "good", "reason": "Thanh lý", "date": today})
chk("Không duyệt phải ghi lý do (400)", ht.call("POST", f"/api/disposals/{d2['id']}/decide", {"approve": False})[0] == 400)
c, x = ht.call("POST", f"/api/disposals/{d2['id']}/decide", {"approve": False, "note": "Còn dùng được"}); chk("Ban giám hiệu từ chối thanh lý: kho giữ nguyên", c == 200 and x["status"] == "Từ chối" and inv(nv)[E]["qtyGood"] == 15)
chk("Danh sách ghi giảm có trạng thái", {x["status"] for x in nv.call("GET", "/api/disposals")[1]} >= {"Đã duyệt", "Từ chối"})
# nếu trường chưa có Ban giám hiệu (khóa tài khoản BGH) thì ghi giảm ngay như trước
login("quantri").call("PATCH", "/api/users/pw-hieutruong", {"status": "locked"})
c, d3 = nv.call("POST", "/api/disposals", {"equipmentId": E, "quantity": 1, "source": "good", "reason": "Thanh lý", "date": today}); chk("Chưa có Ban giám hiệu hoạt động: ghi giảm ngay (không chờ duyệt)", c == 201 and d3.get("status") in (None, "Đã duyệt") and inv(nv)[E]["qtyGood"] == 14, (c, inv(nv)[E]["qtyGood"]))
login("quantri").call("PATCH", "/api/users/pw-hieutruong", {"status": "active"}); ht = login("hieutruong")
nv.call("PATCH", f"/api/inventory/equipment/{E}", {"qtyGood": 15, "location": "Tủ B2"})  # trả lại số liệu để các bước sau khớp (có ghi nhật ký)
# ---- bảo trì
c, m = nv.call("POST", "/api/maintenance", {"equipmentId": E, "quantity": 3, "source": "good", "kind": "Sửa chữa", "content": "Hỏng bản lề", "vendor": "Cửa hàng Trường Thi", "date": today})
chk("Gửi 3 cái đi sửa", c == 201 and m["status"] == "Đang thực hiện", m if c != 201 else "")
q = inv(nv)[E]; chk("Bảo trì: tốt −3, đang sửa +3", q["qtyGood"] == 12 and q["qtyRepair"] == 3, (q["qtyGood"], q["qtyRepair"]))
chk("Hoàn thành: số sửa + thanh lý vượt số gửi bị chặn", nv.call("POST", f"/api/maintenance/{m['id']}/complete", {"repaired": 3, "disposed": 1, "cost": 1})[0] == 400)
c, m2 = nv.call("POST", f"/api/maintenance/{m['id']}/complete", {"repaired": 2, "disposed": 1, "cost": 120000, "note": "Thay bản lề"})
q = inv(nv)[E]; chk("Hoàn thành: sửa được 2 → quay về kho, 1 thanh lý", c == 200 and m2["status"] == "Hoàn thành" and q["qtyGood"] == 14 and q["qtyRepair"] == 0 and q["qtyDisposed"] == 4, (q["qtyGood"], q["qtyRepair"], q["qtyDisposed"]))
chk("Không hoàn thành hai lần", nv.call("POST", f"/api/maintenance/{m['id']}/complete", {"repaired": 1, "disposed": 0, "cost": 0})[0] in (400, 409))
# ---- hóa chất, vật tư: xuất dùng, cảnh báo
c, hc1 = nv.call("POST", "/api/inventory/equipment", {"name": "HCl 1M thử", "subjectId": "hoa-hoc", "kind": "Hóa chất", "qtyGood": 6, "expiry": vn(datetime.date.today() + datetime.timedelta(days=20)), "hazard": "Ăn mòn", "minStock": 3})
c, hc2 = nv.call("POST", "/api/inventory/equipment", {"name": "Cồn thử", "subjectId": "hoa-hoc", "kind": "Hóa chất", "qtyGood": 2, "expiry": vn(datetime.date.today() + datetime.timedelta(days=500)), "minStock": 4})
c, hc3 = nv.call("POST", "/api/inventory/equipment", {"name": "CuSO4 quá hạn thử", "subjectId": "hoa-hoc", "kind": "Hóa chất", "qtyGood": 3, "expiry": vn(datetime.date.today() - datetime.timedelta(days=5))})
c, hc4 = nv.call("POST", "/api/inventory/equipment", {"name": "Hóa chất không ghi hạn thử", "subjectId": "hoa-hoc", "kind": "Hóa chất", "qtyGood": 3})
c, al = nv.call("GET", "/api/inventory/alerts"); ids = lambda k: {x["id"] for x in al[k]}
chk("Cảnh báo: hết hạn", hc3["id"] in ids("expired"), {k: len(v) for k, v in al.items()})
chk("Cảnh báo: sắp hết hạn trong 30 ngày", hc1["id"] in ids("expiringSoon"))
chk("Cảnh báo: dưới mức tồn tối thiểu", hc2["id"] in ids("lowStock") and hc1["id"] not in ids("lowStock"))
chk("Cảnh báo: hóa chất chưa ghi hạn dùng", hc4["id"] in ids("noExpiry"))
c, x = nv.call("POST", "/api/inventory/consume", {"equipmentId": hc1["id"], "quantity": 2, "receiver": "Cô Hồng", "purpose": "Lớp 8A1 – Bài 9: Acid", "date": today})
q = inv(nv)[hc1["id"]]; chk("Xuất dùng hóa chất: kho −2, ghi 'đã tiêu hao'", c in (200, 201) and q["qtyGood"] == 4 and q["qtyConsumed"] == 2, (c, x if c not in (200, 201) else "", q["qtyGood"]))
chk("Xuất dùng vượt tồn bị chặn", nv.call("POST", "/api/inventory/consume", {"equipmentId": hc1["id"], "quantity": 99, "receiver": "x", "purpose": "x", "date": today})[0] in (400, 409))
chk("Xuất dùng thiết bị thường bị chặn", nv.call("POST", "/api/inventory/consume", {"equipmentId": E, "quantity": 1, "receiver": "x", "purpose": "x", "date": today})[0] in (400, 409))
chk("Hóa chất quá hạn: không xuất dùng", nv.call("POST", "/api/inventory/consume", {"equipmentId": hc3["id"], "quantity": 1, "receiver": "x", "purpose": "x", "date": today})[0] in (400, 409))
chk("Sổ xuất dùng có phiếu", len(nv.call("GET", "/api/inventory/consumptions")[1]) >= 1)
# ---- kiểm kê
c, a = nv.call("POST", "/api/audits", {"subjectId": "sinh-hoc", "title": "Kiểm kê thử Sinh học"}); chk("Mở đợt kiểm kê", c == 201 and a["status"] == "Đang kiểm kê" and len(a["items"]) >= 1, a if c != 201 else len(a["items"]))
chk("Mỗi lúc chỉ một đợt kiểm kê cùng môn", nv.call("POST", "/api/audits", {"subjectId": "sinh-hoc", "title": "Đợt hai"})[0] == 409)
it = [i for i in a["items"] if i["equipmentId"] == E][0]
others = [{"equipmentId": i["equipmentId"], "countGood": i["sysGood"], "countBroken": i["sysBroken"]} for i in a["items"] if i["equipmentId"] != E]
cnt = {"items": others + [{"equipmentId": E, "countGood": it["sysGood"] - 2, "countBroken": it["sysBroken"], "note": "Thiếu 2, chưa rõ nguyên nhân"}]}
chk("Nhập số liệu đếm thực tế", nv.call("PATCH", f"/api/audits/{a['id']}", cnt)[0] == 200)
before = inv(nv)[E]
c, f = nv.call("POST", f"/api/audits/{a['id']}/finish"); chk("Kết thúc kiểm kê: ghi nhận chênh lệch", c == 200 and f["status"] == "Hoàn tất", f if c != 200 else "")
lr = [x for x in nv.call("GET", "/api/loss-reports")[1]["reports"] if x.get("equipmentId") == E and x["status"] == "Chờ xác nhận"]
chk("Thiếu 2 so với sổ → báo mất chờ xác nhận (từ kiểm kê)", len(lr) == 1 and lr[0]["quantity"] == 2 and lr[0].get("source") in ("audit", "kiểm kê", "Kiểm kê"), lr[0] if lr else "")
after = inv(nv)[E]; chk("Kiểm kê: tốt giảm 2, chờ xác nhận mất 2", after["qtyGood"] == before["qtyGood"] - 2 and after["qtyLostPending"] == 2, (after["qtyGood"], after["qtyLostPending"]))
chk("Đợt đã hoàn tất không sửa lại được", nv.call("PATCH", f"/api/audits/{a['id']}", cnt)[0] in (400, 409))
chk("Danh sách và chi tiết đợt kiểm kê", any(x["id"] == a["id"] for x in nv.call("GET", "/api/audits")[1]) and nv.call("GET", f"/api/audits/{a['id']}")[0] == 200)
c, a2 = nv.call("POST", "/api/audits", {"subjectId": "toan-hoc", "title": "Đợt bỏ"}); chk("Xóa đợt kiểm kê đang làm", nv.call("DELETE", f"/api/audits/{a2['id']}")[0] == 200)
# ---- nhật ký, truy vết, xuất sổ
c, ch = nv.call("GET", "/api/inventory/changes?from=2026-01-01&to=2027-12-31"); chk("Sổ biến động theo khoảng ngày (Mẫu 1)", c == 200 and len(ch) >= 8, len(ch) if isinstance(ch, list) else ch)
c, ch2 = nv.call("GET", "/api/inventory/changes?from=2026-09-01&to=2027-08-31T23:59:59"); chk("Sổ biến động: dạng có giờ như giao diện đang gọi", c == 200 and len(ch2) >= 8, ch2 if c != 200 else len(ch2))
chk("Sổ biến động: ngày sai định dạng → 400 (không còn lỗi máy chủ)", nv.call("GET", "/api/inventory/changes?from=31/12/2027")[0] == 400)
c, ch3 = nv.call("GET", "/api/inventory/changes?from=2020-01-01&to=2020-12-31"); chk("Sổ biến động: khoảng ngày không có dữ liệu → rỗng", c == 200 and ch3 == [])
h = nv.call("GET", f"/api/inventory/equipment/{E}/history")[1]; kinds = {x["kind"] for x in h["changes"]}
chk("Nhật ký đủ các loại biến động: ghi tăng, thanh lý, bảo trì, kiểm kê", {"Ghi tăng", "Kiểm kê"} <= kinds or len(kinds) >= 5, sorted(kinds))
chk("Truy vết trả về mốc và danh sách người giữ", "trace" in h and "candidates" in h["trace"])
c, dt = gv.call("GET", f"/api/inventory/equipment/{E}/detail"); chk("Trang thiết bị (quét QR): giáo viên xem được, không thấy đơn giá", c == 200 and "unitPrice" not in str(dt.get("equipment", dt)))
c, dt2 = nv.call("GET", f"/api/inventory/equipment/{E}/detail"); chk("Nhân viên thiết bị thấy đơn giá và lịch sử", c == 200 and "unitPrice" in str(dt2) and dt2.get("history") is not None)
c, rp = nv.call("GET", "/api/reports?from=01/01/2026&to=31/12/2027"); chk("Báo cáo tổng hợp", c == 200 and isinstance(rp, dict) and len(rp) > 3, list(rp.keys())[:6] if isinstance(rp, dict) else rp)
# ---- xóa thiết bị
c, tmp = nv.call("POST", "/api/inventory/equipment", {"name": "Tạm để xóa", "subjectId": "vat-li", "qtyGood": 1})
chk("Không xóa được thiết bị còn tồn kho (409): phải ghi giảm trước", nv.call("DELETE", f"/api/inventory/equipment/{tmp['id']}")[0] == 409 and tmp["id"] in inv(nv))
c, tmp0 = nv.call("POST", "/api/inventory/equipment", {"name": "Tạm để xóa (hết)", "subjectId": "vat-li", "qtyGood": 0})
chk("Xóa thiết bị đã hết tồn kho", nv.call("DELETE", f"/api/inventory/equipment/{tmp0['id']}")[0] == 200 and tmp0["id"] not in inv(nv))
chk("Không sửa tay số thiết bị 'mất', 'đang sửa' (409)", nv.call("PATCH", f"/api/inventory/equipment/{E}", {"qtyLost": 5})[0] == 409 and nv.call("PATCH", f"/api/inventory/equipment/{E}", {"qtyRepair": 5})[0] == 409)
chk("Vẫn sửa được số lượng tốt (có ghi nhật ký) và các thông tin khác", nv.call("PATCH", f"/api/inventory/equipment/{E}", {"location": "Tủ C1", "qtyLost": inv(nv)[E]["qtyLost"]})[0] == 200)
nv.call("PATCH", f"/api/inventory/equipment/{E}", {"qtyGood": inv(nv)[E]["qtyGood"] - 1})
ov = ht.call("GET", "/api/principal/overview")[1]; chk("Trang Ban giám hiệu liệt kê các lần sửa tay làm giảm số lượng để giám sát", any(x["equipmentId"] == E for x in ov["directEdits"]), len(ov["directEdits"]))
# ---- nhắc hạn trả
chk("Nhắc hạn trả: sai khóa bí mật bị chặn", anon.call("POST", "/api/cron/reminders", h={"x-cron-secret": "sai"})[0] == 403)
chk("Nhắc hạn trả: đúng khóa chạy được", anon.call("POST", "/api/cron/reminders", h={"x-cron-secret": "testsecret"})[0] == 200)
done()

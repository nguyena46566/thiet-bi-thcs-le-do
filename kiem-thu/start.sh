#!/bin/bash
# dùng: start.sh [biến môi trường thêm ...]   – luôn tạo CSDL PostgreSQL mới
for P in $(pgrep -f "node server.js"); do kill $P 2>/dev/null; done
for i in $(seq 1 20); do curl -s -o /dev/null -m 1 localhost:4000/ || break; sleep 0.5; done
if [ "$NORESET" != "1" ]; then node /home/claude/w/reset.mjs >/dev/null 2>&1; rm -rf /home/claude/w/app/backend/data; fi
cd /home/claude/w/app/backend
env NODE_ENV=production PORT=4000 DATABASE_URL=postgres://app:app@localhost:5432/thietbi SESSION_SECRET=demo CRON_SECRET=testsecret GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback "$@" setsid nohup node server.js > /tmp/demo.log 2>&1 < /dev/null &
for i in $(seq 1 30); do sleep 1; grep -q "Server: http" /tmp/demo.log && break; done
for i in $(seq 1 40); do [ "$(curl -s -o /dev/null -w "%{http_code}" localhost:4000/api/auth/options)" = "200" ] && break; sleep 1; done
curl -s -o /dev/null -w "server %{http_code} " localhost:4000/api/auth/options; grep -E "Lưu trữ" /tmp/demo.log | tail -1

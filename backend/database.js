/**
 * Lưu trữ dữ liệu (phiếu mượn + thông báo).
 *
 * - Có DATABASE_URL  -> dùng PostgreSQL (Supabase, Neon, Render Postgres...). Dữ liệu KHÔNG mất khi deploy lại.
 * - Không có         -> dùng file JSON trong backend/data/ (chỉ để chạy thử trên máy).
 *
 * Mọi hàm đều async để hai chế độ dùng chung một giao diện.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const MAX_NOTIFICATIONS = 200;

export const newId = () => crypto.randomUUID();
const DOC_TABLES = ["equipment", "purchases", "penalties", "audits", "maintenance"];

function countStats(list) {
  return {
    total: list.length,
    borrowing: list.filter((r) => r.status === "Mượn").length,
    returned: list.filter((r) => r.status === "Trả").length,
    pending: list.filter((r) => r.status === "Chờ duyệt").length,
  };
}

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

// =====================================================================
// Chế độ 1: PostgreSQL
// =====================================================================
async function createPgDriver(databaseUrl) {
  const { default: pg } = await import("pg");

  // Bỏ sslmode trong URL để tự cấu hình SSL (Supabase/Neon dùng chứng chỉ riêng)
  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  const useSsl = process.env.PGSSL ? process.env.PGSSL !== "false" : !isLocal;

  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[DB] Lỗi kết nối:", err.message));

  const q = (text, params) => pool.query(text, params);

  async function init() {
    await q(`
      CREATE TABLE IF NOT EXISTS records (
        id          TEXT PRIMARY KEY,
        subject_id  TEXT NOT NULL,
        status      TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        data        JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_subject_idx ON records (subject_id);
      CREATE INDEX IF NOT EXISTS records_status_idx  ON records (status);
      CREATE INDEX IF NOT EXISTS records_created_idx ON records (created_at DESC);
      CREATE INDEX IF NOT EXISTS records_user_idx    ON records ((data->>'userId'));

      CREATE TABLE IF NOT EXISTS notifications (
        id          TEXT PRIMARY KEY,
        read        BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        data        JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at DESC);
    `);
    // Các bảng của phân hệ kho: thiết bị, phiếu nhập kho, điểm thi đua
    for (const t of DOC_TABLES) {
      await q(`CREATE TABLE IF NOT EXISTS ${t} (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        data JSONB NOT NULL
      ); CREATE INDEX IF NOT EXISTS ${t}_created_idx ON ${t} (created_at DESC);`);
    }
    await importLegacyJson();
  }

  /** Lần đầu chuyển sang Postgres: nếu bảng trống mà còn file records.json cũ thì chép sang. */
  async function importLegacyJson() {
    const file = path.join(dataDir, "records.json");
    if (!fs.existsSync(file)) return;
    const { rows } = await q("SELECT COUNT(*)::int AS n FROM records");
    if (rows[0].n > 0) return;
    let old = [];
    try { old = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return; }
    for (const r of old) {
      if (!r?.id) continue;
      await q(
        "INSERT INTO records (id, subject_id, status, created_at, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [r.id, r.subjectId || "", r.status || "Chờ duyệt", r.createdAt || new Date().toISOString(), r]
      );
    }
    if (old.length) console.log(`[DB] Đã chép ${old.length} phiếu từ records.json sang Postgres`);
  }

  const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

  const records = {
    async findAll({ subjectId, status, search } = {}) {
      const where = [];
      const params = [];
      if (subjectId) { params.push(subjectId); where.push(`subject_id = $${params.length}`); }
      if (status) { params.push(status); where.push(`status = $${params.length}`); }
      if (search) {
        params.push(`%${escapeLike(search)}%`);
        const p = `$${params.length}`;
        where.push(`(data->>'teacherName' ILIKE ${p} OR data->>'equipment' ILIKE ${p} OR data->>'className' ILIKE ${p})`);
      }
      const sql = `SELECT data FROM records ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`;
      const { rows } = await q(sql, params);
      return rows.map((r) => r.data);
    },
    async findById(id) {
      const { rows } = await q("SELECT data FROM records WHERE id = $1", [id]);
      return rows[0]?.data || null;
    },
    async create(record) {
      await q(
        "INSERT INTO records (id, subject_id, status, created_at, data) VALUES ($1,$2,$3,$4,$5)",
        [record.id, record.subjectId, record.status, record.createdAt, record]
      );
      return record;
    },
    async update(id, updates) {
      const { rows } = await q(
        `UPDATE records SET data = data || $2::jsonb, status = COALESCE($3, status)
         WHERE id = $1 RETURNING data`,
        [id, JSON.stringify(updates), updates.status ?? null]
      );
      return rows[0]?.data || null;
    },
    async remove(id) {
      const { rowCount } = await q("DELETE FROM records WHERE id = $1", [id]);
      return rowCount > 0;
    },
    async stats(subjectId) {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'Mượn')::int      AS borrowing,
                COUNT(*) FILTER (WHERE status = 'Trả')::int       AS returned,
                COUNT(*) FILTER (WHERE status = 'Chờ duyệt')::int AS pending
         FROM records ${subjectId ? "WHERE subject_id = $1" : ""}`,
        subjectId ? [subjectId] : []
      );
      return rows[0];
    },
    /** Phiếu còn giữ thiết bị (Chờ duyệt / Mượn) - dùng để tính tồn kho */
    async findActive() {
      const { rows } = await q("SELECT data FROM records WHERE status IN ('Chờ duyệt','Mượn')");
      return rows.map((r) => r.data);
    },
    /** Phiếu do một tài khoản tạo (trang "Phiếu của tôi") */
    async findByUser(userId) {
      const { rows } = await q("SELECT data FROM records WHERE data->>'userId' = $1 ORDER BY created_at DESC", [userId]);
      return rows.map((r) => r.data);
    },
  };

  const notifications = {
    async create(n) {
      await q("INSERT INTO notifications (id, read, created_at, data) VALUES ($1,$2,$3,$4)", [n.id, n.read, n.createdAt, n]);
      await q(
        `DELETE FROM notifications WHERE id IN (
           SELECT id FROM notifications ORDER BY created_at DESC OFFSET ${MAX_NOTIFICATIONS})`
      );
      return n;
    },
    async list({ limit = 50, unreadOnly = false } = {}) {
      const { rows } = await q(
        `SELECT data || jsonb_build_object('read', read) AS data FROM notifications
         ${unreadOnly ? "WHERE read = false" : ""} ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return rows.map((r) => r.data);
    },
    async unreadCount() {
      const { rows } = await q("SELECT COUNT(*)::int AS n FROM notifications WHERE read = false");
      return rows[0].n;
    },
    async markRead(id) {
      const { rows } = await q(
        "UPDATE notifications SET read = true WHERE id = $1 RETURNING data || jsonb_build_object('read', true) AS data",
        [id]
      );
      return rows[0]?.data || null;
    },
    async markAllRead() {
      const { rowCount } = await q("UPDATE notifications SET read = true WHERE read = false");
      return { updated: rowCount };
    },
    async remove(id) {
      const { rowCount } = await q("DELETE FROM notifications WHERE id = $1", [id]);
      return rowCount > 0;
    },
  };

  /** Bảng dạng tài liệu đơn giản (id, created_at, data JSONB) */
  function collection(t) {
    if (!DOC_TABLES.includes(t)) throw new Error("Bảng không hợp lệ: " + t);
    return {
      async all() {
        const { rows } = await q(`SELECT data FROM ${t} ORDER BY created_at DESC`);
        return rows.map((r) => r.data);
      },
      async get(id) {
        const { rows } = await q(`SELECT data FROM ${t} WHERE id = $1`, [id]);
        return rows[0]?.data || null;
      },
      async insert(doc) {
        await q(`INSERT INTO ${t} (id, created_at, data) VALUES ($1, $2, $3)`, [doc.id, doc.createdAt || new Date().toISOString(), doc]);
        return doc;
      },
      async update(id, patch) {
        const { rows } = await q(`UPDATE ${t} SET data = data || $2::jsonb WHERE id = $1 RETURNING data`, [id, JSON.stringify(patch)]);
        return rows[0]?.data || null;
      },
      async remove(id) {
        const { rowCount } = await q(`DELETE FROM ${t} WHERE id = $1`, [id]);
        return rowCount > 0;
      },
      async count() {
        const { rows } = await q(`SELECT COUNT(*)::int AS n FROM ${t}`);
        return rows[0].n;
      },
    };
  }

  return { kind: "postgres", pool, init, records, notifications, collection };
}

// =====================================================================
// Chế độ 2: file JSON (chạy thử trên máy)
// =====================================================================
function createFileDriver() {
  const cache = new Map(); // đọc file một lần, sau đó dùng bộ nhớ

  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const file = path.join(dataDir, `${name}.json`);
    let list = [];
    try { list = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { /* chưa có file */ }
    cache.set(name, list);
    return list;
  }

  function save(name) {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, `${name}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache.get(name), null, 2), "utf-8");
    fs.renameSync(tmp, file); // ghi nguyên tử: không hỏng file nếu tắt máy giữa chừng
  }

  const records = {
    async findAll({ subjectId, status, search } = {}) {
      let list = load("records");
      if (subjectId) list = list.filter((r) => r.subjectId === subjectId);
      if (status) list = list.filter((r) => r.status === status);
      if (search) {
        const s = search.toLowerCase();
        list = list.filter((r) =>
          [r.teacherName, r.equipment, r.className].some((v) => String(v || "").toLowerCase().includes(s))
        );
      }
      return [...list].sort(byNewest);
    },
    async findById(id) {
      return load("records").find((r) => r.id === id) || null;
    },
    async create(record) {
      load("records").push(record);
      save("records");
      return record;
    },
    async update(id, updates) {
      const list = load("records");
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return null;
      list[i] = { ...list[i], ...updates };
      save("records");
      return list[i];
    },
    async remove(id) {
      const list = load("records");
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return false;
      list.splice(i, 1);
      save("records");
      return true;
    },
    async stats(subjectId) {
      const list = load("records");
      return countStats(subjectId ? list.filter((r) => r.subjectId === subjectId) : list);
    },
    async findActive() {
      return load("records").filter((r) => r.status === "Chờ duyệt" || r.status === "Mượn");
    },
    async findByUser(userId) {
      return load("records").filter((r) => r.userId === userId).sort(byNewest);
    },
  };

  const notifications = {
    async create(n) {
      const list = load("notifications");
      list.unshift(n);
      if (list.length > MAX_NOTIFICATIONS) list.splice(MAX_NOTIFICATIONS);
      save("notifications");
      return n;
    },
    async list({ limit = 50, unreadOnly = false } = {}) {
      let list = load("notifications");
      if (unreadOnly) list = list.filter((n) => !n.read);
      return list.slice(0, limit);
    },
    async unreadCount() {
      return load("notifications").filter((n) => !n.read).length;
    },
    async markRead(id) {
      const n = load("notifications").find((x) => x.id === id);
      if (!n) return null;
      n.read = true;
      save("notifications");
      return n;
    },
    async markAllRead() {
      const list = load("notifications");
      let updated = 0;
      for (const n of list) if (!n.read) { n.read = true; updated++; }
      save("notifications");
      return { updated };
    },
    async remove(id) {
      const list = load("notifications");
      const i = list.findIndex((n) => n.id === id);
      if (i === -1) return false;
      list.splice(i, 1);
      save("notifications");
      return true;
    },
  };

  function collection(t) {
    if (!DOC_TABLES.includes(t)) throw new Error("Bảng không hợp lệ: " + t);
    return {
      async all() { return [...load(t)].sort(byNewest); },
      async get(id) { return load(t).find((x) => x.id === id) || null; },
      async insert(doc) { load(t).push(doc); save(t); return doc; },
      async update(id, patch) {
        const list = load(t); const i = list.findIndex((x) => x.id === id);
        if (i === -1) return null;
        list[i] = { ...list[i], ...patch }; save(t); return list[i];
      },
      async remove(id) {
        const list = load(t); const i = list.findIndex((x) => x.id === id);
        if (i === -1) return false;
        list.splice(i, 1); save(t); return true;
      },
      async count() { return load(t).length; },
    };
  }

  return { kind: "file", pool: null, init: async () => {}, records, notifications, collection };
}

// =====================================================================
const db = process.env.DATABASE_URL
  ? await createPgDriver(process.env.DATABASE_URL)
  : createFileDriver();

export default db;

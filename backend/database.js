import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "records.json");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize file if not exists
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([], null, 2), "utf-8");
}

function readAll() {
  try {
    const raw = fs.readFileSync(dbPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(records) {
  fs.writeFileSync(dbPath, JSON.stringify(records, null, 2), "utf-8");
}

function findAll({ subjectId, status, search } = {}) {
  let records = readAll();

  if (subjectId) {
    records = records.filter((r) => r.subjectId === subjectId);
  }
  if (status) {
    records = records.filter((r) => r.status === status);
  }
  if (search) {
    const s = search.toLowerCase();
    records = records.filter(
      (r) =>
        r.teacherName.toLowerCase().includes(s) ||
        r.equipment.toLowerCase().includes(s) ||
        r.className.toLowerCase().includes(s)
    );
  }

  // Sort by createdAt descending
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return records;
}

function findById(id) {
  const records = readAll();
  return records.find((r) => r.id === id) || null;
}

function create(record) {
  const records = readAll();
  records.push(record);
  writeAll(records);
  return record;
}

function update(id, updates) {
  const records = readAll();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;

  records[index] = { ...records[index], ...updates };
  writeAll(records);
  return records[index];
}

function remove(id) {
  const records = readAll();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return false;

  records.splice(index, 1);
  writeAll(records);
  return true;
}

function countAll() {
  const records = readAll();
  return {
    total: records.length,
    borrowing: records.filter((r) => r.status === "Mượn").length,
    returned: records.filter((r) => r.status === "Trả").length,
    pending: records.filter((r) => r.status === "Chờ duyệt").length,
  };
}

function countBySubject(subjectId) {
  const records = readAll().filter((r) => r.subjectId === subjectId);
  return {
    total: records.length,
    borrowing: records.filter((r) => r.status === "Mượn").length,
    returned: records.filter((r) => r.status === "Trả").length,
    pending: records.filter((r) => r.status === "Chờ duyệt").length,
  };
}

export default {
  findAll,
  findById,
  create,
  update,
  remove,
  countAll,
  countBySubject,
};

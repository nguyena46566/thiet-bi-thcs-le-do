import pg from "/home/claude/w/app/backend/node_modules/pg/lib/index.js";
const c = new pg.Client({ connectionString: "postgres://app:app@localhost:5432/thietbi" }); await c.connect();
const r = await c.query(process.argv[2]); console.log(r.rows ? JSON.stringify(r.rows.slice(0, 50)) : r.rowCount); await c.end();

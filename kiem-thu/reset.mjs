import pg from "/home/claude/w/app/backend/node_modules/pg/lib/index.js";
const c = new pg.Client({ connectionString: "postgres://app:app@localhost:5432/postgres" }); await c.connect();
await c.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='thietbi' AND pid<>pg_backend_pid()");
await c.query("DROP DATABASE IF EXISTS thietbi"); await c.query("CREATE DATABASE thietbi"); await c.end(); console.log("db reset");

// JDBM – Janitor Jibesh Database Monk
// MIT License · Arjun M Liji · https://github.com/arjc/jdbm
require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "public")));

/* ---------- Models ---------- */
const Table = mongoose.model("JdbmTable", new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  columns: [{ _id: false, name: String, type: String }]
}, { timestamps: true }));

const Record = mongoose.model("JdbmRecord", new mongoose.Schema({
  table: { type: String, index: true, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true }));

/* ---------- Helpers ---------- */
const NAME_RE = /^[a-z0-9_-]{1,40}$/;
const COL_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/;
const RESERVED = ["id", "createdAt"];
const TYPES = ["text", "longtext", "number", "boolean", "date"];
const list = v => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function coerce(type, v) {
  if (type === "number") {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  if (type === "boolean") return v === "on" || v === "true" || v === true;
  if (type === "date") {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return v == null ? "" : String(v);
}
const flat = r => ({ id: r._id, ...r.data, createdAt: r.createdAt });

// Dashboard protection (HTTP Basic). Disabled if ADMIN_PASSWORD is not set.
function admin(req, res, next) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return next();
  const [scheme, b64] = (req.headers.authorization || "").split(" ");
  if (scheme === "Basic" && b64) {
    const [user, ...rest] = Buffer.from(b64, "base64").toString().split(":");
    if (user === (process.env.ADMIN_USER || "admin") && rest.join(":") === pass) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="JDBM"');
  res.status(401).send("Authentication required");
}

/* ---------- Dashboard ---------- */
app.get("/", admin, wrap(async (req, res) => {
  const tables = await Table.find().sort("name").lean();
  const agg = await Record.aggregate([{ $group: { _id: "$table", n: { $sum: 1 } } }]);
  const counts = Object.fromEntries(agg.map(x => [x._id, x.n]));
  res.render("index", { tables, counts, types: TYPES, error: req.query.error || null });
}));

app.post("/tables", admin, wrap(async (req, res) => {
  const name = String(req.body.name || "").trim().toLowerCase();
  const names = list(req.body.colName), types = list(req.body.colType);
  const columns = [];
  names.forEach((n, i) => {
    n = String(n).trim();
    if (n) columns.push({ name: n, type: TYPES.includes(types[i]) ? types[i] : "text" });
  });
  const unique = new Set(columns.map(c => c.name)).size === columns.length;
  if (!NAME_RE.test(name) || !columns.length || !unique ||
      columns.some(c => !COL_RE.test(c.name) || RESERVED.includes(c.name))) {
    return res.redirect("/?error=" + encodeURIComponent(
      "Table names: a-z, 0-9, - or _. Column names: letters, digits, _ (not 'id' or 'createdAt'), no duplicates."));
  }
  try { await Table.create({ name, columns }); }
  catch (e) { return res.redirect("/?error=" + encodeURIComponent("That table already exists.")); }
  res.redirect("/tables/" + name);
}));

app.get("/tables/:name", admin, wrap(async (req, res) => {
  const t = await Table.findOne({ name: req.params.name }).lean();
  if (!t) return res.status(404).send("Table not found");
  const records = await Record.find({ table: t.name }).sort("-createdAt").lean();
  res.render("table", { t, records, base: `${req.protocol}://${req.get("host")}` });
}));

app.post("/tables/:name/records", admin, wrap(async (req, res) => {
  const t = await Table.findOne({ name: req.params.name }).lean();
  if (!t) return res.sendStatus(404);
  const data = {};
  t.columns.forEach(c => { data[c.name] = coerce(c.type, req.body[c.name]); });
  await Record.create({ table: t.name, data });
  res.redirect("/tables/" + t.name);
}));

app.post("/tables/:name/records/:id/delete", admin, wrap(async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) {
    await Record.deleteOne({ _id: req.params.id, table: req.params.name });
  }
  res.redirect("/tables/" + req.params.name);
}));

app.post("/tables/:name/delete", admin, wrap(async (req, res) => {
  await Record.deleteMany({ table: req.params.name });
  await Table.deleteOne({ name: req.params.name });
  res.redirect("/");
}));

/* ---------- Public REST API (read-only) ---------- */
app.get("/api/:table", cors(), wrap(async (req, res) => {
  const t = await Table.findOne({ name: req.params.table }).lean();
  if (!t) return res.status(404).json({ error: "Table not found" });
  const records = await Record.find({ table: t.name }).sort("-createdAt").lean();
  res.json(records.map(flat));
}));

app.get("/api/:table/:id", cors(), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Record not found" });
  const r = await Record.findOne({ _id: req.params.id, table: req.params.table }).lean();
  if (!r) return res.status(404).json({ error: "Record not found" });
  res.json(flat(r));
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something went wrong.");
});

/* ---------- Start ---------- */
const uri = process.env.MONGODB_URI;
if (!uri) { console.error("JDBM: MONGODB_URI is not set."); process.exit(1); }
mongoose.connect(uri).then(() => {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`JDBM running on port ${port}`));
}).catch(e => { console.error("JDBM: MongoDB connection failed:", e.message); process.exit(1); });

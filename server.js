const express = require("express");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();

// 👇 CORS obligatorio para Stremio
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const M3U_URL = process.env.M3U_URL;
const TOKEN = process.env.ADDON_TOKEN;

let cache = { time: 0, channels: [] };

function requireToken(req, res, next) {
  if (req.query.token !== TOKEN) return res.status(401).send("Unauthorized");
  next();
}

async function loadM3U() {
  if (Date.now() - cache.time < 600000) return cache.channels;

  const res = await fetch(M3U_URL);
  const text = await res.text();
  const lines = text.split("\n");

  const channels = [];
  let current = null;

  for (const l of lines) {
    if (l.startsWith("#EXTINF")) {
      const name = l.split(",").pop().trim();
      current = { id: name.toLowerCase().replace(/\s+/g, "-"), name };
    } else if (l.startsWith("http") && current) {
      current.url = l.trim();
      channels.push(current);
      current = null;
    }
  }

  cache = { time: Date.now(), channels };
  return channels;
}

app.get("/manifest.json", requireToken, (req, res) => {
  res.json({
    id: "leo.iptv",
    version: "1.0",
    name: "Leo IPTV",
    resources: ["catalog", "stream"],
    types: ["tv"],
    catalogs: [{ type: "tv", id: "channels", name: "Channels" }]
  });
});

app.get("/catalog/tv/channels.json", requireToken, async (req, res) => {
  const ch = await loadM3U();
  res.json({ metas: ch.map(c => ({ id: c.id, type: "tv", name: c.name })) });
});

app.get("/stream/tv/:id.json", requireToken, async (req, res) => {
  const ch = await loadM3U();
  const c = ch.find(x => x.id === req.params.id);
  res.json({ streams: c ? [{ url: c.url }] : [] });
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log("Addon running on port " + PORT));




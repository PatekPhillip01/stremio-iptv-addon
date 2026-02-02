const express = require("express");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();

/* ===============================
   CONFIG
================================ */
const M3U_URL = process.env.M3U_URL;
const TOKEN = process.env.ADDON_TOKEN;
const PORT = process.env.PORT || 7000;

/* ===============================
   CORS (OBLIGATORIO PARA STREMIO)
================================ */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ===============================
   SIMPLE AUTH
================================ */
function requireToken(req, res, next) {
  if (req.query.token !== TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ===============================
   M3U CACHE
================================ */
let cache = {
  time: 0,
  channels: [],
};

async function loadM3U() {
  // Cache 10 minutos
  if (Date.now() - cache.time < 10 * 60 * 1000) {
    return cache.channels;
  }

  const res = await fetch(M3U_URL);
  const text = await res.text();
  const lines = text.split("\n");

  const channels = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      const name = line.split(",").pop().trim();
      current = {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name,
      };
    } else if (line.startsWith("http") && current) {
      current.url = line.trim();
      channels.push(current);
      current = null;
    }
  }

  cache = { time: Date.now(), channels };
  return channels;
}

/* ===============================
   STREMIO ROUTES
================================ */

// Manifest
app.get("/manifest.json", requireToken, (req, res) => {
  res.json({
    id: "leo.iptv",
    version: "1.0",
    name: "Leo IPTV",
    description: "Personal IPTV Addon",
    resources: ["catalog", "stream"],
    types: ["tv"],
    catalogs: [
      {
        type: "tv",
        id: "channels",
        name: "Channels",
      },
    ],
  });
});

// Catalog
app.get("/catalog/tv/channels.json", requireToken, async (req, res) => {
  const channels = await loadM3U();
  res.json({
    metas: channels.map((c) => ({
      id: c.id,
      type: "tv",
      name: c.name,
    })),
  });
});

// Stream
app.get("/stream/tv/:id.json", requireToken, async (req, res) => {
  const channels = await loadM3U();
  const channel = channels.find((c) => c.id === req.params.id);

  res.json({
    streams: channel ? [{ url: channel.url }] : [],
  });
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`Addon running on port ${PORT}`);
});

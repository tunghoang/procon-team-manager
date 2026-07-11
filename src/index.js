require("dotenv").config();
require("./models");

const path = require("path");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const { authenticate } = require("./middleware/authenticate");
const routes = require("./routes");

const app = express();

require("./docs.js")("/docs", app);
require("./jobqueue.js");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

app.set("trust proxy", true);

// Middleware
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json());

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Serve React build
if (process.env.NODE_ENV !== "staging") {
  const buildPath = path.join(__dirname, "../build");

  function serveIndexHtml(req, res) {
    res.sendFile(path.join(buildPath, "index.html"));
  }

  app.use(express.static(buildPath));

  app.get(
    [
      "/login",

      "/admin",
      "/admin/*",

      "/tournament",
      "/tournament/*",

      "/competition",
      "/competition/*",

      "/rounds",
      "/rounds/*",

      "/matches",
      "/matches/*",

      "/teams",
      "/teams/*",

      "/questions",
      "/questions/*",

      "/answers",
      "/answers/*",
    ],
    serveIndexHtml
  );
}

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

app.use("/api", authenticate);

for (const route in routes) {
  app.use(`/api${route}`, routes[route]);
}

app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
});

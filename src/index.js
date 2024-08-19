require("dotenv").config();
require("./models");
const path = require("path");
const express = require("express");
const app = express();
const cors = require("cors");
const { authenticate } = require("./middleware/authenticate");
const routes = require("./routes");
require("./docs.js")("/docs", app);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";
function serveIndexHtml(req, res) {
  res.sendFile("index.html", {
    root: path.join(__dirname, "../../procon-react/build/"),
  });
}

app.use("/", express.static("../procon-react/build"));
app.get("/rounds/*", serveIndexHtml);
app.get("/matches/*", serveIndexHtml);
app.get("/teams/*", serveIndexHtml);
app.get("/questions/*", serveIndexHtml);
app.get("/answers/*", serveIndexHtml);
app.get("/rounds/*", serveIndexHtml);
app.get("/competition/*", serveIndexHtml);
app.get("/rounds", serveIndexHtml);
app.get("/matches", serveIndexHtml);
app.get("/teams", serveIndexHtml);
app.get("/questions", serveIndexHtml);
app.get("/answers", serveIndexHtml);
app.get("/rounds", serveIndexHtml);
app.get("/competition", serveIndexHtml);

app.use(express.json());
app.use(cors());
app.use(authenticate);

for (const route in routes) {
  app.use(route, routes[route]);
}

app.listen(PORT, HOST, () => {
  console.log(`server is running on port ${HOST}:${PORT}`);
});

require("dotenv").config();
require("./models");
const express = require("express");
const app = express();
const cors = require("cors");
const { authenticate } = require("./middleware/authenticate");
const routes = require("./routes");
const { getAudioFile } = require("./controllers/question");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

app.use(express.json());
app.use(cors());
app.use(authenticate);

app.get("/audio/:fileName", getAudioFile);

for (const route in routes) {
  app.use(route, routes[route]);
}

app.listen(PORT, HOST, () => {
  console.log(`server is running on port ${HOST}:${PORT}`);
});

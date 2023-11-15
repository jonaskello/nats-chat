import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { MyAuthToken, Data } from "@nats-chat/shared";

const app = express();
const port = 3050;
const cookieName = "myCookie";

const data: Data = await readData();

async function readData(): Promise<Data> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rawData = await fs.readFile(path.join(__dirname, "../../../data.json"), "utf8");
  const data: Data = JSON.parse(rawData);
  return data;
}

app.use(cookieParser());
app.use(express.json());

app.post("/login", (req, res, next) => {
  const { user, pass } = req.body;
  const userRecord = data.users[user];
  console.log("pass", pass);
  console.log("userRecord", userRecord);
  if (userRecord === undefined || userRecord.pass !== pass) {
    res.statusCode = 401;
    res.send("Invalid user/pass");
    return;
  }
  const cookieValue: MyAuthToken = { signature: "signature-that-should-be-encrypted", user: "bob" };
  res.cookie(cookieName, JSON.stringify(cookieValue), { maxAge: 900000, httpOnly: false });
  res.statusCode = 200;
  res.send(`Login successful`);
});

// Remove cookie
app.get("/logout", (req, res, next) => {
  res.clearCookie(cookieName);
  res.send(`<div>Logged out</div> <div><a href="/">Continue</a></div>`);
});

app.get("/rooms", async (req, res) => {
  const rooms = Object.keys(data.rooms);
  res.send(rooms);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

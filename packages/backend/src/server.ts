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

// need cookieParser middleware before we can do anything with cookies
app.use(cookieParser());

app.use(express.json()); // to support JSON-encoded bodies

// set a cookie
app.post("/login", (req, res, next) => {
  // Check username/password
  const { user, pass } = req.body;
  const userRecord = data.users[user];
  console.log("pass", pass);
  console.log("userRecord", userRecord);
  if (userRecord === undefined || userRecord.pass !== pass) {
    res.statusCode = 401;
    res.send("Invalid user/pass");
    return;
  }

  // // check if client sent cookie
  // var cookie = req.cookies.cookieName;
  // if (cookie === undefined) {
  //   // no: set a new cookie
  const cookieValue: MyAuthToken = { signature: "signature-that-should-be-encrypted", user: "bob" };
  res.cookie(cookieName, JSON.stringify(cookieValue), { maxAge: 900000, httpOnly: false });
  console.log("cookie created successfully");
  // } else {
  //   // yes, cookie was already present
  //   console.log("cookie exists", cookie);
  // }
  //   next(); // <-- important!
  res.send(`<div>Logged in</div> <div><a href="/">Continue</a></div>`);
});

// Remove cookie
app.get("/logout", (req, res, next) => {
  res.clearCookie(cookieName);
  console.log("cookie cleared");
  res.send(`<div>Logged out</div> <div><a href="/">Continue</a></div>`);
});

app.get("/rooms", async (req, res) => {
  // const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // const data = await fs.readFile(path.join(__dirname, "../../../data.json"), "utf8");
  // const parsed: Data = JSON.parse(data);
  const rooms = Object.keys(data.rooms);
  res.send(rooms);
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

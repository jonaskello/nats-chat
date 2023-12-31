import express from "express";
import cookieParser from "cookie-parser";
import { MyAuthToken, Data, readData } from "@nats-chat/shared";

const app = express();
const port = 3050;
const cookieName = "myCookie";

const data: Data = await readData();

app.use(cookieParser());
app.use(express.json());

app.post("/login", (req, res, next) => {
  const { user, pass } = req.body;
  const userRecord = data.users[user];
  if (userRecord === undefined || userRecord.pass !== pass) {
    res.statusCode = 401;
    res.send("Invalid user/pass");
    return;
  }
  const cookieValue: MyAuthToken = { signature: "signature-that-should-be-encrypted", user };
  res.cookie(cookieName, JSON.stringify(cookieValue), { maxAge: 900000, httpOnly: false });
  res.statusCode = 200;
  res.send(`Login successful`);
});

app.get("/login", (req, res, next) => {
  var cookie = req.cookies[cookieName];
  if (cookie !== undefined) {
    console.log("cookie exists", cookie);
    const parsed = JSON.parse(cookie);
    res.statusCode = 200;
    res.send(JSON.stringify({ user: parsed.user }));
  } else {
    res.statusCode = 401;
    res.send(`Not logged in`);
  }
});

app.get("/logout", (req, res, next) => {
  res.clearCookie(cookieName);
  res.send(`<div>Logged out</div> <div><a href="/">Continue</a></div>`);
});

app.get("/rooms", async (req, res) => {
  const rooms = Object.keys(data.rooms);
  res.send(rooms);
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

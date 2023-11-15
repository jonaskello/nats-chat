import express from "express";
import cookieParser from "cookie-parser";
import { MyAuthToken } from "@nats-chat/shared";

const app = express();
const port = 3050;
const cookieName = "myCookie";

// need cookieParser middleware before we can do anything with cookies
app.use(cookieParser());

// set a cookie
app.use("/login", (req, res, next) => {
  // check if client sent cookie
  var cookie = req.cookies.cookieName;
  if (cookie === undefined) {
    // no: set a new cookie
    const cookieValue: MyAuthToken = { signature: "signature-that-should-be-encrypted", user: "bob" };
    res.cookie(cookieName, JSON.stringify(cookieValue), { maxAge: 900000, httpOnly: false });
    console.log("cookie created successfully");
  } else {
    // yes, cookie was already present
    console.log("cookie exists", cookie);
  }
  //   next(); // <-- important!
  res.send(`<div>Logged in</div> <div><a href="/">Continue</a></div>`);
});

// Remove cookie
app.get("/logout", (req, res, next) => {
  res.clearCookie(cookieName);
  console.log("cookie cleared");
  res.send(`<div>Logged out</div> <div><a href="/">Continue</a></div>`);
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

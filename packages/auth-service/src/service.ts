import fs from "fs";
import { program } from "commander";
import * as Nats from "nats";
import * as Nkeys from "nkeys.js";
import * as Jwt from "nats-jwt";
import { Data, MyAuthToken, readData } from "@nats-chat/shared";
import { AuthorizationRequestClaims, Opts, User } from "./types";

program
  .option("-nats.url <nats-url>")
  .option("-nats.user <nats-user>")
  .option("-nats.pass <nats-pass>")
  .option("-issuer.seed <issuer-seed>")
  .option("-xkey.seed <xkey-seed>")
  .option("-users <users-json>")
  .action((opts) => {
    run(opts);
  });

program.parse(process.argv);

async function run(opts: Opts) {
  const natsUrl = opts["Nats.url"];
  const natsUser = opts["Nats.user"];
  const natsPass = opts["Nats.pass"];
  const issuerSeed = opts["Issuer.seed"];
  const usersFile = opts["Users"];

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  // Parse the issuer account signing key.
  const issuerKeyPair = Nkeys.fromSeed(enc.encode(issuerSeed));

  // Load users file and their reights
  const userData = await readData();

  // Open the NATS connection passing the auth account creds file.
  const nc = await Nats.connect({ servers: natsUrl, user: natsUser, pass: natsPass });

  // Start subscription
  const sub = nc.subscribe("$SYS.REQ.USER.AUTH");
  console.log(`listening for ${sub.getSubject()} requests...`);
  for await (const msg of sub) {
    await msgHandler(msg, enc, dec, userData, issuerKeyPair);
  }
}

async function msgHandler(req: Nats.Msg, enc: TextEncoder, dec: TextDecoder, userData: Data, issuerKeyPair: Nkeys.KeyPair) {
  // Helper function to construct an authorization response.
  const respondMsg = async (req: Nats.Msg, userNkey: string, serverId: string, userJwt: string, errMsg: string) => {
    let token: string;
    try {
      token = await Jwt.encodeAuthorizationResponse(userNkey, serverId, issuerKeyPair, { jwt: userJwt, error: errMsg }, {});
    } catch (err) {
      console.log("error encoding response JWT: %s", err);
      req.respond(undefined);
      return;
    }
    let data = enc.encode(token);
    req.respond(data);
  };

  // Check for Xkey header and decrypt
  let token: Uint8Array = req.data;

  // Decode the authorization request claims.
  let rc: AuthorizationRequestClaims;
  try {
    Jwt.encodeAuthorizationResponse;
    rc = Jwt.decode<AuthorizationRequestClaims>(dec.decode(token)) as AuthorizationRequestClaims;
    console.log("rc.nats.connect_opts.auth_token", rc.nats.connect_opts.auth_token);
  } catch (e) {
    return respondMsg(req, "", "", "", (e as Error).message);
  }

  // Used for creating the auth response.
  const userNkey = rc.nats.user_nkey;
  const serverId = rc.nats.server_id.id;

  // // Check if the user exists.
  // const userProfile = users[rc.nats.connect_opts.user!];
  // if (!userProfile) {
  //   return respondMsg(req, userNkey, serverId, "", "user not found");
  // }

  // Try parse token
  const authToken = rc.nats.connect_opts.auth_token;
  if (!authToken) {
    return respondMsg(req, userNkey, serverId, "", "no auth_token in request");
  }
  let parsedAuthToken: MyAuthToken;
  try {
    parsedAuthToken = JSON.parse(authToken);
    console.log("parsedAuthToken", parsedAuthToken);
  } catch (e) {
    return respondMsg(req, "", "", "", (e as Error).message);
  }

  // Check if the token is valid.
  if (parsedAuthToken.signature !== "signature-that-should-be-encrypted") {
    return respondMsg(req, userNkey, serverId, "", "invalid credentials");
  }

  // // Check if the credential is valid.
  // if (userProfile.pass != rc.nats.connect_opts.pass) {
  //   return respondMsg(req, userNkey, serverId, "", "invalid credentials");
  // }

  // Prepare a user JWT.
  // Sign it with the issuer key since this is non-operator mode.
  let ejwt: string;
  try {
    ejwt = await Jwt.encodeUser(
      rc.nats.connect_opts.user!,
      rc.nats.user_nkey,
      issuerKeyPair,
      // Set the associated permissions if present.
      // userProfile.permissions,
      { pub: { allow: ["all1"], deny: [] }, sub: { allow: ["all1"], deny: [] } },
      // {},
      {
        // Audience contains the account in non-operator mode.
        // aud: userProfile.account,
        aud: "APP",
      }
    );
  } catch (e) {
    return respondMsg(req, userNkey, serverId, "", "error signing user JWT");
  }

  return respondMsg(req, userNkey, serverId, ejwt, "");
}

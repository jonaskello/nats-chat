import * as Nats from "nats";
import * as Nkeys from "nkeys.js";
import * as Jwt from "nats-jwt";
import { Data, MyAuthToken, readData } from "@nats-chat/shared";
import { AuthorizationRequestClaims } from "./types";

run();

async function run() {
  const natsUrl = "nats://localhost:4228";
  const natsUser = "auth";
  const natsPass = "auth";
  const issuerSeed = "SAANDLKMXL6CUS3CP52WIXBEDN6YJ545GDKC65U5JZPPV6WH6ESWUA6YAI";

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
    console.log("Auth service got message");
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

  // Try parse token
  const authToken = rc.nats.connect_opts.auth_token;
  if (!authToken) {
    return respondMsg(req, userNkey, serverId, "", "no auth_token in request");
  }
  let parsedAuthToken: MyAuthToken;
  try {
    parsedAuthToken = JSON.parse(authToken);
  } catch (e) {
    return respondMsg(req, "", "", "", (e as Error).message);
  }

  // Check if the token is valid.
  if (parsedAuthToken.signature !== "signature-that-should-be-encrypted") {
    return respondMsg(req, userNkey, serverId, "", "invalid credentials");
  }

  // Check if the user exists.
  const userProfile = userData.users[parsedAuthToken.user];
  if (!userProfile) {
    return respondMsg(req, userNkey, serverId, "", "user not found");
  }

  // Get the requested subjects for this connection
  const clientInfo = rc.nats.client_info;
  const requestedSubjects = clientInfo.split(";");

  // Gather permissions for user
  const allowedRooms = Object.entries(userData.rooms)
    .filter(([, room]) => room.users.includes(parsedAuthToken.user))
    .map(([roomName]) => roomName);

  // Prepare a user JWT.
  let ejwt: string;
  try {
    ejwt = await Jwt.encodeUser(
      rc.nats.connect_opts.user!,
      rc.nats.user_nkey,
      issuerKeyPair,
      // Add "public" because if the allowed array is empty then all is allowed
      { pub: { allow: ["public", ...allowedRooms], deny: [] }, sub: { allow: ["public", ...allowedRooms], deny: [] } },
      { aud: userProfile.account }
    );
  } catch (e) {
    return respondMsg(req, userNkey, serverId, "", "error signing user JWT");
  }

  return respondMsg(req, userNkey, serverId, ejwt, "");
}

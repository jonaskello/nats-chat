import fs from "fs";
import { program } from "commander";
import * as Nats from "nats";
import * as Nkeys from "nkeys.js";
import * as Jwt from "nats-jwt";
import { MyAuthToken } from "@nats-chat/shared";

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

type Opts = {
  "Nats.url": string;
  "Nats.user": string;
  "Nats.pass": string;
  "Issuer.seed": string;
  "Xkey.seed": string;
  Users: string;
};

// type AuthorizationRequestClaims = {
//   user_nkey: string;
//   server_id: { id: string };
//   connect_opts: { user?: string; pass?: string; token?: string };
// };

type AuthorizationRequestClaims = {
  aud?: string;
  exp?: number;
  jti?: string;
  iat?: number;
  iss?: string;
  name?: string;
  nbf?: number;
  sub?: string;
  nats: {
    server_id: {
      name: string;
      host: string;
      id: string;
      version?: string;
      cluster?: string;
      tags?: string[];
      xkey?: string;
    };
    user_nkey: string;
    client_info: {
      host?: string;
      id?: number;
      user?: string;
      name?: string;
      tags?: string[];
      name_tag?: string;
      kind?: string;
      type?: string;
      mqtt_id?: string;
      nonce?: string;
    };
    connect_opts: {
      jwt?: string;
      nkey?: string;
      sig?: string;
      auth_token?: string;
      user?: string;
      pass?: string;
      name?: string;
      lang?: string;
      version?: string;
      protocol: number;
    };
    client_tls?: {
      version?: string;
      cipher?: string;
      certs?: string[];
      verified_chains?: string[][];
    };
    request_nonce?: string;
    tags?: string[];
    type?: string;
    version?: number;
  };
};

type Permissions = {
  pub: { allow: Array<string>; deny: Array<string> };
  sub: { allow: Array<string>; deny: Array<string> };
  resp: { max: number; ttl: number };
};

type User = {
  pass: string;
  account: string;
  permissions?: Permissions;
};

async function run(opts: Opts) {
  const natsUrl = opts["Nats.url"];
  const natsUser = opts["Nats.user"];
  const natsPass = opts["Nats.pass"];
  const issuerSeed = opts["Issuer.seed"];
  const xkeySeed = opts["Xkey.seed"];
  const usersFile = opts["Users"];

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  // Parse the issuer account signing key.
  const issuerKeyPair = Nkeys.fromSeed(enc.encode(issuerSeed));

  // Parse the xkey seed if present.
  let curveKeyPair: Nkeys.KeyPair | undefined;
  // if (xkeySeed.length > 0) {
  //   curveKeyPair = Nkeys.fromSeed(enc.encode(xkeySeed));
  // }

  // Load and decode the users file.
  const usersData = fs.readFileSync(usersFile, "utf-8");
  const users = JSON.parse(usersData);

  // Open the NATS connection passing the auth account creds file.
  const nc = await Nats.connect({ servers: natsUrl, user: natsUser, pass: natsPass });

  // Start subscription
  const sub = nc.subscribe("$SYS.REQ.USER.AUTH");
  console.log(`listening for ${sub.getSubject()} requests...`);
  for await (const msg of sub) {
    await msgHandler(msg, curveKeyPair, enc, dec, users, issuerKeyPair);
  }
}

async function msgHandler(
  req: Nats.Msg,
  curveKeyPair: Nkeys.KeyPair | undefined,
  enc: TextEncoder,
  dec: TextDecoder,
  users: Record<string, User>,
  issuerKeyPair: Nkeys.KeyPair
) {
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

    // // Check if encryption is required.
    // const xkey = req.headers?.get("Nats-Server-Xkey");
    // if (xkey && xkey.length > 0 && curveKeyPair) {
    //   try {
    //     //  data = curveKeyPair.Seal(data, xkey);
    //     data = new Uint8Array();
    //   } catch (err) {
    //     console.log("error encrypting response JWT: %s", err);
    //     req.respond(undefined);
    //     return;
    //   }
    // }

    req.respond(data);
  };

  // Check for Xkey header and decrypt
  let token: Uint8Array;
  // const xkey = req.headers?.get("Nats-Server-Xkey");
  // if (xkey && xkey.length > 0) {
  //   if (!curveKeyPair) {
  //     return respondMsg(req, "", "", "", "xkey not supported");
  //   }
  //   // Decrypt the message.
  //   try {
  //     // TODO: No open function to call...
  //     // const token = curveKeyPair.open(req.data, xkey);
  //     token = new Uint8Array();
  //   } catch (e) {
  //     return respondMsg(req, "", "", "", "error decrypting message");
  //   }
  // } else {
  token = req.data;
  // }

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
      {},
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

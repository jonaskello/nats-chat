export type Opts = {
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

export type AuthorizationRequestClaims = {
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

export type Permissions = {
  pub: { allow: Array<string>; deny: Array<string> };
  sub: { allow: Array<string>; deny: Array<string> };
  resp: { max: number; ttl: number };
};

export type User = {
  pass: string;
  account: string;
  permissions?: Permissions;
};

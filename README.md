# nats-chat

Example chat appliation using NATS with dynamic authorization.

## How to run

```
pnpm install
docker compose up -d
pnpm serve
```

Then goto http://localhost:3040/

## Explaination

This applications main purpose is to demonstrate this authentication and authorization flow:

1. User enters credentials (username, password) and posts it to HTTP backend.
2. HTTP backend validates the credentials (normally the backend would delegate authentication to an identity provider using eg. OIDC).
3. HTTP backend issues a cookie containing a token with username and a signature that can be validated later (in the real world it would be signed by a public key).
4. The client connects to NATS server via websockets passing along the token from the cookie (ideally the cookie would be http-only and NATS supports this by the websocket.jwt_cookie setting, however it is currently blocked for use with auth callout because it validates this setting to only be used with some other trust settings that probably are not relevant for auth callout scenario).
5. The NATS server is configred for auth callout so it calls the auth service defined in th is example.
6. The auth service gets the token from the connection and validates the signature of it (in a real world scenario it would get the public key from the issuer to do this eg. via well-known url for OIDC).
7. The auth service looks up the permissions for the user specified in the token. These persmissions are stored in a JSON file in this example, in a real-world scenario they would be in a database or some external system.
8. The auth service replies with a NATS defined JWT containg the allowed subjects to publish and subscribe to.

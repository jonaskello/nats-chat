# nats-chat

Example chat appliation using NATS with dynamic authorization.

## How to run

```
pnpm install
docker compose up -d
pnpm serve
```

Then goto http://localhost:3040/

## What is this?

This example is a chat application using NATS.
A user can login, join a chat room and then publish and subscribe to messages of that room.
The main point of the example is that the user can only join chat rooms to which he has been granted access.

In a real-world scenario there would be tens of thousends of chat rooms and the user may have access to several thousends of them.
This makes it impractical and inefficent to tell NATS all permissions that the user has up-front since they could get very large.
The permission are also highly dynamic, since the user at any time can be granted access to a new chat room (granting access is not possible in this example yet).

However even if the user has access to thousends of chat rooms, he will only join a few of them for each session he uses the application.
So we would want to tell NATS only about the permissions to the rooms that the user actually tries to join.
Say the user joins 10 rooms, then we need to tell NATS only about them.

The problem is we do not know at connection-time which rooms the user will want to join so we cannot provide that information at that time (in JWT issed by auth callout at connection time).
For this reason, each time a subscription attempt fails, we need to close the connection and re-connect, sending information about what chat rooms we want access to.
So if the user currently has joined 3 rooms and want to join a 4th room that would initially fail becuase current JWT only has the 3 current rooms.
So we disconnect from NATS and then connect again passing all 4 rooms in the client_info field.

## Flow

This applications main purpose is to demonstrate this authentication and authorization flow:

1. User enters credentials (username, password) and posts it to HTTP backend.
2. HTTP backend validates the credentials (normally the backend would delegate authentication to an identity provider using eg. OIDC).
3. HTTP backend creates a cookie containing a token with username and a signature that can be validated later. This example just includes a plain text signature but in a real-world scenario it would use the token issued by identity provider which is signed by the provider's public key.
4. The client connects to NATS server via websockets passing along the token from the cookie. Ideally the cookie would be http-only and NATS supports this by the websocket.jwt_cookie setting. However this setting is currently blocked for use with auth callout because the NATS server validates this setting to only be used with some other trust settings that probably are not relevant for auth callout scenario).
5. The NATS server is configred for auth callout so it calls the auth service defined in the is example, passing along the token.
6. The auth service gets the token from the request and validates the signature of it. In a real world scenario it would get the public key from the issuer to do this eg. via well-known url for OIDC.
7. The auth service looks up the permissions for the user specified in the token. These persmissions are stored in a JSON file in this example. In a real-world scenario they would be in a database or some external ACL system.
8. The auth service replies with a NATS defined JWT containg the allowed subjects to publish and subscribe to.

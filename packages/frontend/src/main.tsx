import React, { useEffect, useState, useRef } from "react";
import * as ReactDomClient from "react-dom/client";
import * as Nats from "nats.ws";

const container = document.getElementById("root");
const root = ReactDomClient.createRoot(container!);
root.render(<Main />);

type NatsConnectionState = NatsConnectionFailed | NatsConnectionConnecting | NatsConnectionConnected;
type NatsConnectionFailed = {
  readonly type: "Failed";
  readonly error: string;
};
type NatsConnectionConnecting = {
  readonly type: "Connecting";
};
type NatsConnectionConnected = {
  readonly type: "Connected";
  readonly connection: Nats.NatsConnection;
};

type Rooms = Record<string, Room>;

type Room = {
  readonly subscription: Nats.Subscription;
  readonly messages: string;
};

type State = {
  readonly natsConnectionState: NatsConnectionState;
  readonly rooms: Rooms;
  readonly messageText: string;
  readonly messageResult: string;
  readonly selectedRoom: string;
};

function Main() {
  const natsUrl = "ws://localhost:9228";
  const [state, setState] = useState<State>({
    natsConnectionState: { type: "Connecting" },
    rooms: {},
    messageText: "/join olle",
    messageResult: "",
    selectedRoom: "",
  });
  console.log("MAIN - State", state);
  const stateRef = useRef<State>();
  stateRef.current = state;

  useEffect(() => {
    let nc: Nats.NatsConnection;
    const connect = async () => {
      try {
        // Get token from cookie
        const natsCookieValue = getCookie("myCookie");
        if (natsCookieValue === undefined) {
          throw new Error("No cookie value");
        }
        // nc = await Nats.connect({ servers: natsUrl, user: "alice", pass: "alice" });
        nc = await Nats.connect({ servers: natsUrl, token: natsCookieValue });
        setState({ ...state, natsConnectionState: { type: "Connected", connection: nc } });
      } catch (ex) {
        console.log("error while connecting");
        setState({ ...state, natsConnectionState: { type: "Failed", error: ex.message } });
      }
    };
    connect();
    return () => {
      console.log("CLOSING NATS CONNECTION!");
      nc && nc.close();
    };
  }, [natsUrl]);

  ///
  const { natsConnectionState } = state;

  if (natsConnectionState.type === "Connecting") {
    return <div>Connecting...</div>;
  }
  if (natsConnectionState.type === "Failed") {
    return <ConnectionFailed error={natsConnectionState.error} />;
  }

  return (
    <div>
      <LoginLogout />
      <br />
      <table>
        <tbody>
          <tr>
            <td>
              <select size={10} value={state.selectedRoom} onChange={(e) => setState({ ...state, selectedRoom: e.target.value })}>
                {Object.keys(state.rooms).map((r) => (
                  <option key={r} value={r}>
                    #{r}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <textarea cols={40} rows={11} value={state.rooms[state.selectedRoom]?.messages}></textarea>
            </td>
          </tr>
        </tbody>
      </table>
      <br />
      <br />
      <div>
        <input type="text" size={20} value={state.messageText} onChange={(e) => setState({ ...state, messageText: e.target.value })} />
        <button onClick={() => sendMessage(natsConnectionState.connection, state.messageText, stateRef, setState)}>Send</button>
      </div>
      <div>{state.messageResult}</div>
    </div>
  );
}

function ConnectionFailed({ error }: { error: string }) {
  return (
    <div>
      <div>Connection failed: {error}</div> <br />
      <LoginLogout />
    </div>
  );
}

function LoginLogout() {
  return (
    <div>
      <div>
        <a href="/login">login</a>
      </div>
      <br />
      <div>
        <a href="/logout">logout</a>
      </div>
    </div>
  );
}

function sendMessage(
  nc: Nats.NatsConnection,
  message: string,
  stateRef: React.MutableRefObject<State | undefined>,
  setState: (state: State) => void
): void {
  const state = stateRef.current;
  if (state === undefined) {
    return;
  }
  console.log("message", message);
  console.log("rooms", state.rooms);
  if (message.startsWith("/")) {
    const cmdParts = message.split(" ");
    switch (cmdParts[0]) {
      case "/join": {
        const room = cmdParts[1]?.trim();
        if (room === undefined || room.length === 0) {
          setState({ ...state, messageResult: `No room`, messageText: "" });
          return;
        }
        const sub = nc.subscribe(room, {
          callback: createSubscriptionCallback(stateRef, setState),
        });
        setState({
          ...state,
          messageResult: `Joined room ${room}`,
          messageText: "",
          rooms: { ...state.rooms, [room]: { subscription: sub, messages: "" } },
        });
        return;
      }
      case "/leave": {
        const room = cmdParts[1]?.trim();
        if (room === undefined || room.length === 0) {
          setState({ ...state, messageResult: `No room`, messageText: "" });
          return;
        }
        const theRoom = state.rooms[room];
        theRoom?.subscription.drain();
        delete state.rooms[room];
        setState({ ...state, messageResult: `Left room ${room}`, rooms: state.rooms });
        return;
      }
      default:
        setState({ ...state, messageResult: `Invalid commmand ${cmdParts[0]}` });
        return;
    }
  } else {
    const room = state.selectedRoom;
    if (room.length === 0) {
      setState({ ...state, messageResult: `No room`, messageText: "" });
      return;
    }
    console.log(`Publishing ${message} to room ${room}`);
    nc.publish(room, message);
    setState({ ...state, messageResult: `Message sent to room ${room}`, messageText: "" });
  }
}

function createSubscriptionCallback(stateRef: React.MutableRefObject<State | undefined>, setState: (state: State) => void) {
  return (err: Nats.NatsError | null, msg: Nats.Msg) => {
    console.log("hello there");
    const state = stateRef.current;
    if (state === undefined) {
      return;
    }
    const room = msg.subject;
    const roomState = state.rooms[room];
    console.log("room", room, "state", roomState);
    if (roomState) {
      const sc = Nats.StringCodec();
      const newState: State = {
        ...state,
        rooms: { ...state.rooms, [room]: { ...roomState, messages: roomState.messages + sc.decode(msg.data) + "\n" } },
      };
      console.log("newState", newState);
      setState(newState);
    }
  };
}

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const cookieValue = parts?.pop()?.split(";").shift();
    if (cookieValue === undefined) {
      return undefined;
    }
    return decodeURIComponent(cookieValue);
  }
  return undefined;
}

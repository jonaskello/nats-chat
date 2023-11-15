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

type RoomSubscriptionState = RoomSubscriptionStateSubscribed | RoomSubscriptionStateError;

type RoomSubscriptionStateSubscribed = {
  readonly type: "Subscribed";
  readonly subscription: Nats.Subscription;
  readonly messages: string;
};

type RoomSubscriptionStateError = {
  readonly type: "Error";
  readonly error: string;
};

type State = {
  readonly natsConnectionState: NatsConnectionState;
  readonly availableRooms: ReadonlyArray<string>;
  readonly subscribedRooms: Record<string, RoomSubscriptionState>;
  readonly messageText: string;
  readonly messageResult: string;
  readonly selectedRoom: string;
};

function Main() {
  const natsUrl = "ws://localhost:9228";
  const [state, setState] = useState<State>({
    natsConnectionState: { type: "Connecting" },
    availableRooms: [],
    subscribedRooms: {},
    messageText: "",
    messageResult: "",
    selectedRoom: "",
  });
  const stateRef = useRef<State>();
  stateRef.current = state;

  // Get rooms
  useEffect(() => {
    fetch("/rooms")
      .then((response) => response.json())
      .then((data) => {
        const currentState = stateRef.current;
        if (!currentState) return;
        const newState: State = { ...currentState, availableRooms: data, selectedRoom: data[0] };
        console.log("newState", newState);
        setState(newState);
      })
      .catch((error) => console.log(error));
  }, []);

  // Connect to NATS
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
        const currentState = stateRef.current;
        if (!currentState) return;
        setState({ ...currentState, natsConnectionState: { type: "Connected", connection: nc } });
      } catch (ex) {
        console.log("error while connecting");
        const currentState = stateRef.current;
        if (!currentState) return;
        setState({ ...currentState, natsConnectionState: { type: "Failed", error: ex.message } });
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
      <Chat stateRef={stateRef} setState={setState} />
    </div>
  );
}

function Chat({ stateRef, setState }: { stateRef: React.MutableRefObject<State | undefined>; setState: (state: State) => void }) {
  const state = stateRef.current;
  if (state === undefined) {
    return <div>no state</div>;
  }
  console.log("CHAT state", state);
  const selectedRoomSubState = state.subscribedRooms[state.selectedRoom];
  return (
    <div>
      <table>
        <tbody>
          <tr>
            <td>
              <select size={10} value={state.selectedRoom} onChange={(e) => setState({ ...state, selectedRoom: e.target.value })}>
                {state.availableRooms.map((r) => (
                  <option key={r} value={r}>
                    #{r}
                  </option>
                ))}
              </select>
            </td>
            <td>
              {selectedRoomSubState !== undefined ? (
                selectedRoomSubState.type === "Subscribed" ? (
                  <div>
                    <textarea readOnly cols={40} rows={11} value={selectedRoomSubState.messages}></textarea>
                    <button onClick={() => leaveRoom(stateRef, setState)}>Leave</button>
                  </div>
                ) : (
                  <div>ERROR: {selectedRoomSubState.error}</div>
                )
              ) : (
                <div>
                  <div>Not joined</div>
                  <button onClick={() => joinRoom(stateRef, setState)}>Join</button>
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <br />
      <br />
      <div>
        <input type="text" size={20} value={state.messageText} onChange={(e) => setState({ ...state, messageText: e.target.value })} />
        <button onClick={() => sendMessage(stateRef, setState)}>Send</button>
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

function leaveRoom(stateRef: React.MutableRefObject<State | undefined>, setState: (state: State) => void): void {
  const state = stateRef.current;
  if (state === undefined) {
    return;
  }
  const room = state.selectedRoom;
  if (room === undefined || room.length === 0) {
    setState({ ...state, messageResult: `No room`, messageText: "" });
    return;
  }
  const theRoom = state.subscribedRooms[room];
  delete state.subscribedRooms[room];
  if (theRoom?.type === "Subscribed") {
    theRoom?.subscription.drain();
  }
  setState({ ...state, messageResult: `Left room ${room}`, subscribedRooms: state.subscribedRooms });
  return;
}

function joinRoom(stateRef: React.MutableRefObject<State | undefined>, setState: (state: State) => void): void {
  const state = stateRef.current;
  if (state === undefined) {
    return;
  }
  const natsConnectionState = state.natsConnectionState;
  if (natsConnectionState.type !== "Connected") {
    setState({ ...state, messageResult: `Not connected`, messageText: "" });
    return;
  }
  const room = state.selectedRoom;
  const sub = natsConnectionState.connection.subscribe(room, {
    callback: createSubscriptionCallback(stateRef, setState),
  });
  setState({
    ...state,
    messageResult: `Joined room ${room}`,
    messageText: "",
    selectedRoom: room,
    subscribedRooms: { ...state.subscribedRooms, [room]: { type: "Subscribed", subscription: sub, messages: "" } },
  });
}

function sendMessage(stateRef: React.MutableRefObject<State | undefined>, setState: (state: State) => void): void {
  const state = stateRef.current;
  if (state === undefined) {
    return;
  }
  const natsConnectionState = state.natsConnectionState;
  if (natsConnectionState.type !== "Connected") {
    setState({ ...state, messageResult: `Not connected`, messageText: "" });
    return;
  }
  const message = state.messageText;
  const room = state.selectedRoom;
  if (room.length === 0) {
    setState({ ...state, messageResult: `No room`, messageText: "" });
    return;
  }
  console.log(`Publishing ${message} to room ${room}`);
  natsConnectionState.connection.publish(room, message);
  setState({ ...state, messageResult: `Message sent to room ${room}`, messageText: "" });
}

function createSubscriptionCallback(stateRef: React.MutableRefObject<State | undefined>, setState: (state: State) => void) {
  return (err: Nats.NatsError | null, msg: Nats.Msg) => {
    const state = stateRef.current;
    if (state === undefined) {
      return;
    }

    if (err) {
      const room = err.permissionContext?.subject;
      if (room === undefined) {
        throw new Error(`Subscription error without permissionContext: ${err.code}, ${err.message}`);
      }
      console.log("err.permissionContext?.subject", err?.permissionContext?.subject);
      const newState: State = {
        ...state,
        subscribedRooms: { ...state.subscribedRooms, [room]: { type: "Error", error: err.message ?? "" } },
      };
      setState(newState);
      return;
    }
    const room = msg.subject;
    const roomState = state.subscribedRooms[room];
    if (roomState?.type === "Subscribed") {
      const sc = Nats.StringCodec();
      const newState: State = {
        ...state,
        subscribedRooms: { ...state.subscribedRooms, [room]: { ...roomState, messages: roomState.messages + sc.decode(msg.data) + "\n" } },
      };
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

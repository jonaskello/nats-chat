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

type RoomState = RoomStateSubscribed | RoomStateError;

type RoomStateSubscribed = {
  readonly type: "Subscribed";
  readonly subscription: Nats.Subscription;
  readonly messages: string;
  readonly upgradeTokenAttempts: number;
};

type RoomStateError = {
  readonly type: "Error";
  readonly error: string;
};

type State = LoggedInState | NotLoggedInState;

type LoggedInState = {
  readonly type: "LoggedInState";
  readonly loggedInUser: string;
  readonly natsConnectionState: NatsConnectionState;
  readonly availableRooms: ReadonlyArray<string>;
  readonly subscribedRooms: Record<string, RoomState>;
  readonly messageText: string;
  readonly messageResult: string;
  readonly selectedRoom: string;
};

type NotLoggedInState = {
  readonly type: "NotLoggedInState";
  readonly user: string;
  readonly pass: string;
  readonly error: string;
};

type ChatMessage = {
  readonly sender: string;
  readonly message: string;
};

const natsUrl = "ws://localhost:9228";

function Main() {
  const [state, setState] = useState<State>({
    type: "NotLoggedInState",
    user: "",
    pass: "",
    error: "",
  });
  const stateRef = useRef<State>(state);
  stateRef.current = state;

  if (state.type !== "LoggedInState") {
    return <Login stateRef={stateRef} setState={setState} />;
  }

  return (
    <div>
      <span>
        {state.loggedInUser}
        &nbsp;
        <a href="/logout">logout</a>
      </span>
      <br />
      <br />
      <Chat stateRef={stateRef} setState={setState} />
    </div>
  );
}

function Chat({ stateRef, setState }: { stateRef: React.MutableRefObject<State>; setState: (state: State) => void }) {
  const state = stateRef.current;
  if (state.type !== "LoggedInState") {
    return <div>state is undefined</div>;
  }

  // Get rooms
  useEffect(() => {
    fetch("/rooms")
      .then((response) => response.json())
      .then((data) => {
        const currentState = stateRef.current;
        if (currentState === undefined || currentState.type !== "LoggedInState") {
          return;
        }
        const newState: LoggedInState = { ...currentState, availableRooms: data, selectedRoom: data[0] };
        setState(newState);
      })
      .catch((error) => console.error(error));
  }, []);

  // Connect to NATS
  useEffect(() => {
    let nc: Nats.NatsConnection;
    const connect = async () => {
      try {
        const stateBeforeConnect = stateRef.current;
        if (stateBeforeConnect === undefined || stateBeforeConnect.type !== "LoggedInState") {
          throw new Error("Unexpected state");
        }
        nc = await connectToNats(stateBeforeConnect);
        const stateAfterConnect = stateRef.current;
        if (stateAfterConnect === undefined || stateAfterConnect.type !== "LoggedInState") {
          throw new Error("Unexpected state");
        }
        setState({ ...stateAfterConnect, natsConnectionState: { type: "Connected", connection: nc } });
      } catch (ex) {
        const currentState = stateRef.current;
        if (currentState === undefined || currentState.type !== "LoggedInState") {
          return;
        }
        setState({ ...currentState, natsConnectionState: { type: "Failed", error: ex.message } });
      }
    };
    connect();
    return () => {
      nc && nc.close();
    };
  }, []);

  const { natsConnectionState } = state;

  if (natsConnectionState.type === "Connecting") {
    return <div>Connecting...</div>;
  }
  if (natsConnectionState.type === "Failed") {
    return (
      <div>
        <div>Connection failed: {natsConnectionState.error}</div> <br />
      </div>
    );
  }
  const selectedRoomState = state.subscribedRooms[state.selectedRoom];
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
              {selectedRoomState !== undefined && selectedRoomState.type === "Subscribed" ? (
                <div>
                  <textarea readOnly cols={40} rows={11} value={selectedRoomState.messages}></textarea>
                  <button onClick={() => leaveRoom(stateRef, setState)}>Leave</button>
                </div>
              ) : (
                <div>
                  <div>{selectedRoomState && selectedRoomState.type === "Error" && selectedRoomState.error}</div>
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

function Login({ stateRef, setState }: { stateRef: React.MutableRefObject<State>; setState: (state: State) => void }) {
  const state = stateRef.current;

  useEffect(() => {
    tryLogin(stateRef, setState).catch((error) => console.error(error));
  }, []);

  if (state.type !== "NotLoggedInState") {
    return <div>Unexpected state</div>;
  }
  return (
    <div>
      <table>
        <tbody>
          <tr>
            <td>{state.error}</td>
          </tr>
          <tr>
            <td>User</td>
            <td>
              <input type="text" size={20} value={state.user} onChange={(e) => setState({ ...state, user: e.target.value })} />
            </td>
          </tr>
          <tr>
            <td>Password</td>
            <td>
              <input type="text" size={20} value={state.pass} onChange={(e) => setState({ ...state, pass: e.target.value })} />
            </td>
          </tr>
        </tbody>
      </table>
      <button onClick={async () => tryLogin(stateRef, setState)}>Login</button>
    </div>
  );
}

async function tryLogin(stateRef: React.MutableRefObject<State>, setState: (state: State) => void) {
  const state = stateRef.current;
  if (state.type !== "NotLoggedInState") {
    return;
  }
  // Fetching /login  will cause the cookie to be set
  const resp = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: state.user, pass: state.pass }),
  });
  if (resp.status === 200) {
    setState({
      type: "LoggedInState",
      loggedInUser: state.user,
      natsConnectionState: { type: "Connecting" },
      availableRooms: [],
      subscribedRooms: {},
      messageText: "",
      messageResult: "",
      selectedRoom: "",
    });
  } else {
    setState({ ...state, error: resp.status.toString() });
  }
}

function leaveRoom(stateRef: React.MutableRefObject<State>, setState: (state: State) => void): void {
  const state = stateRef.current;
  if (state.type !== "LoggedInState") {
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

function joinRoom(stateRef: React.MutableRefObject<State>, setState: (state: State) => void): void {
  const state = stateRef.current;
  if (state.type !== "LoggedInState") {
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
    subscribedRooms: { ...state.subscribedRooms, [room]: { type: "Subscribed", subscription: sub, messages: "", upgradeTokenAttempts: 0 } },
  });
}

function sendMessage(stateRef: React.MutableRefObject<State>, setState: (state: State) => void): void {
  const state = stateRef.current;
  if (state.type !== "LoggedInState") {
    return;
  }
  const natsConnectionState = state.natsConnectionState;
  if (natsConnectionState.type !== "Connected") {
    setState({ ...state, messageResult: `Not connected`, messageText: "" });
    return;
  }
  const theRoom = state.subscribedRooms[state.selectedRoom];
  if (!theRoom || theRoom.type === "Error") {
    setState({ ...state, messageResult: `No room to send to, try joining a room first`, messageText: "" });
    return;
  }
  const cm: ChatMessage = { sender: state.loggedInUser, message: state.messageText };
  natsConnectionState.connection.publish(state.selectedRoom, JSON.stringify(cm));
  setState({ ...state, messageResult: `Message sent to room ${state.selectedRoom}`, messageText: "" });
}

function createSubscriptionCallback(stateRef: React.MutableRefObject<State>, setState: (state: State) => void) {
  return async (err: Nats.NatsError | null, msg: Nats.Msg) => {
    const state = stateRef.current;
    if (state.type !== "LoggedInState") {
      return;
    }
    if (err) {
      const room = err.permissionContext?.subject;
      if (room === undefined) {
        throw new Error(`Subscription error without permissionContext: ${err.code}, ${err.message}`);
      }
      // Check if we are already trying to upgrade the token for this room, if so give up
      const roomState = state.subscribedRooms[room];
      if (roomState?.type === "Subscribed" && roomState.upgradeTokenAttempts > 0) {
        setState({ ...state, subscribedRooms: { ...state.subscribedRooms, [room]: { type: "Error", error: err.message ?? "" } } });
        return;
      }
      // Subscription failed, try to upgrade the token to include permission to subscribe to the subject
      // To do this we need to disconnect from NATS and then re-connect passing the subjects we want access to
      if (state.natsConnectionState.type === "Connected") {
        console.log("Closing NATS connection to upgrade token");
        await state.natsConnectionState.connection.drain();
      }
      // Set state to indicate that we are connecting
      setState({ ...state, natsConnectionState: { type: "Connecting" } });
      // We now connect again
      const nc = await connectToNats(state);
      const stateAfterConnect = stateRef.current;
      if (stateAfterConnect === undefined || stateAfterConnect.type !== "LoggedInState") {
        throw new Error("Unexpected state");
      }
      // After we connected, try subscribe again
      const sub = nc.subscribe(room, { callback: createSubscriptionCallback(stateRef, setState) });
      setState({
        ...stateAfterConnect,
        natsConnectionState: { type: "Connected", connection: nc },
        subscribedRooms: { ...state.subscribedRooms, [room]: { type: "Subscribed", messages: "", upgradeTokenAttempts: 1, subscription: sub } },
      });
      return;
    }
    const room = msg.subject;
    const roomState = state.subscribedRooms[room];
    if (roomState?.type === "Subscribed") {
      const sc = Nats.StringCodec();
      const decodedMessage = sc.decode(msg.data);
      const parsedMessage: ChatMessage = JSON.parse(decodedMessage);
      const newState: State = {
        ...state,
        subscribedRooms: {
          ...state.subscribedRooms,
          [room]: { ...roomState, messages: roomState.messages + parsedMessage.sender + ": " + parsedMessage.message + "\n" },
        },
      };
      setState(newState);
    }
  };
}

async function connectToNats(state: LoggedInState): Promise<Nats.NatsConnection> {
  // Get token from cookie
  const natsCookieValue = getCookie("myCookie");
  if (natsCookieValue === undefined) {
    throw new Error("No cookie value");
  }
  const subjects: ReadonlyArray<string> = Object.keys(state.subscribedRooms);
  console.log(`Connecting to NATS requesting subjects: ${JSON.stringify(subjects)}`);
  // nc = await Nats.connect({ servers: natsUrl, user: "alice", pass: "alice" });
  const nc = await Nats.connect({ servers: natsUrl, token: natsCookieValue, user: subjects.join(";") });
  return nc;
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

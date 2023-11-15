import React, { useEffect, useState, useRef } from "react";
import * as ReactDomClient from "react-dom/client";
import * as Nats from "nats.ws";

const container = document.getElementById("root");
const root = ReactDomClient.createRoot(container!);
root.render(<Index />);

type NatsConnectionState = NatsConnectionFailed | NatsConnectionConnecting | NatsConnectionConnected;
type NatsConnectionFailed = {
  type: "Failed";
  error: string;
};
type NatsConnectionConnecting = {
  type: "Connecting";
};
type NatsConnectionConnected = {
  type: "Connected";
  connection: Nats.NatsConnection;
};

type Rooms = Record<string, Room>;

type Room = {
  subscription: Nats.Subscription;
  messages: string;
};

function Index() {
  const natsUrl = "ws://localhost:9228";
  const [natsConnectionState, setNatsConnectionState] = useState<NatsConnectionState>({ type: "Connecting" });
  const [messageText, setMessageText] = useState<string>("/join olle");
  const [messageResult, setMessageResult] = useState<string>("");
  const [rooms, setRooms] = useState<Rooms>({});
  const roomsRef = useRef<Rooms>();
  roomsRef.current = rooms;
  const [selectedRoom, setSelectedRoom] = useState<string>("");

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
        setNatsConnectionState({ type: "Connected", connection: nc });
      } catch (ex) {
        console.log("error while connecting");
        setNatsConnectionState({ type: "Failed", error: ex.message });
      }
    };
    connect();
    return () => {
      console.log("CLOSING NATS CONNECTION!");
      nc && nc.close();
    };
  }, [natsUrl]);

  if (natsConnectionState.type === "Connecting") {
    return <div>Connecting...</div>;
  }
  if (natsConnectionState.type === "Failed") {
    return <ConnectionFailed error={natsConnectionState.error} />;
  }

  return (
    <div>
      INDEX!
      <br></br>
      <LoginLogout />
      <br />
      <table>
        <tbody>
          <tr>
            <td>
              <select size={10} value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
                {Object.keys(rooms).map((r) => (
                  <option key={r} value={r}>
                    #{r}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <textarea cols={40} rows={11} value={rooms[selectedRoom]?.messages}></textarea>
            </td>
          </tr>
        </tbody>
      </table>
      <br />
      <br />
      <div>
        <input type="text" size={20} value={messageText} onChange={(e) => setMessageText(e.target.value)} />
        <button
          onClick={() => {
            const result = sendMessage(natsConnectionState.connection, messageText, selectedRoom, roomsRef, setRooms);
            setMessageResult(result);
            setMessageText("");
          }}
        >
          Send
        </button>
      </div>
      <div>{messageResult}</div>
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
  room: string,
  roomsRef: React.MutableRefObject<Rooms | undefined>,
  setRooms: (rooms: Rooms) => void
) {
  const rooms = roomsRef.current;
  if (rooms === undefined) {
    return `No rooms`;
  }
  console.log("message", message);
  console.log("rooms", rooms);
  if (message.startsWith("/")) {
    const cmdParts = message.split(" ");
    switch (cmdParts[0]) {
      case "/join": {
        const room = cmdParts[1]?.trim();
        if (room === undefined || room.length === 0) {
          return "No room";
        }
        const sub = nc.subscribe(room, {
          callback: (err, msg) => {
            console.log("hello there");
            const roomState = roomsRef.current?.[room];
            console.log("room", room, "state", roomState);
            if (roomState) {
              const sc = Nats.StringCodec();
              setRooms({ ...rooms, [room]: { ...roomState, messages: (roomState.messages += sc.decode(msg.data) + "\n") } });
            }
          },
        });
        setRooms({ ...rooms, [room]: { subscription: sub, messages: "" } });
        return `Joined room ${room}`;
      }
      case "/leave": {
        const room = cmdParts[1]?.trim();
        if (room === undefined || room.length === 0) {
          return "No room";
        }
        const theRoom = rooms[room];
        theRoom?.subscription.drain();
        delete rooms[room];
        setRooms(rooms);
        return `Left room ${room}`;
      }
      default:
        return `Invalid commmand ${cmdParts[0]}`;
    }
  } else {
    if (room.length === 0) {
      return `No room`;
    }
    console.log(`Publishing ${message} to room ${room}`);
    nc.publish(room, message);
    return `Message sent to room ${room}`;
  }
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

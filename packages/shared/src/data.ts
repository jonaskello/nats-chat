export type User = {
  readonly pass: string;
  readonly account: string;
};

export type Room = {
  readonly users: ReadonlyArray<string>;
};

export type Data = {
  readonly users: Record<string, User>;
  readonly rooms: Record<string, Room>;
};

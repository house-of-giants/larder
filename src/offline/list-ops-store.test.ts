import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { createListOps } from "./list-ops-store";
import type { QueuedOp } from "./queue";

const eggs = "1listItems" as Id<"listItems">;
const rolls = "2listItems" as Id<"listItems">;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function harness(storedQueue: QueuedOp[]) {
  const read = deferred<QueuedOp[]>();
  const sent: string[] = [];
  const writes: QueuedOp[][] = [];
  const ops = createListOps({
    read: () => read.promise,
    write: (queue) => {
      writes.push(queue);
    },
    send: async (op) => {
      sent.push(`${op.listItemId}:${op.status}`);
    },
  });
  return { ops, sent, writes, finishRead: () => read.resolve(storedQueue) };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createListOps startup", () => {
  it("sends nothing until the stored queue is read, then lets the newer tap win", async () => {
    const { ops, sent, finishRead } = harness([{ listItemId: eggs, status: "checked", at: 1 }]);
    ops.setCanSend(true);
    const load = ops.load();
    await ops.tap(eggs, "needed", 2);
    await settled();
    expect(sent).toEqual([]);
    expect(ops.getQueue()).toEqual([{ listItemId: eggs, status: "needed", at: 2 }]);

    finishRead();
    await load;
    await settled();
    expect(sent).toEqual(["1listItems:needed"]);
    expect(ops.getQueue()).toEqual([]);
  });

  it("replays stored taps for other items alongside startup taps", async () => {
    const { ops, sent, finishRead } = harness([{ listItemId: rolls, status: "checked", at: 1 }]);
    ops.setCanSend(true);
    const load = ops.load();
    await ops.tap(eggs, "checked", 2);
    finishRead();
    await load;
    await settled();
    expect(sent).toEqual(["2listItems:checked", "1listItems:checked"]);
  });

  it("does not overwrite the stored queue before reading it", async () => {
    const { ops, writes, finishRead } = harness([{ listItemId: rolls, status: "checked", at: 1 }]);
    const load = ops.load();
    await ops.tap(eggs, "checked", 2);
    expect(writes).toEqual([]);
    finishRead();
    await load;
    expect(writes.at(-1)).toEqual([
      { listItemId: rolls, status: "checked", at: 1 },
      { listItemId: eggs, status: "checked", at: 2 },
    ]);
  });
});

describe("createListOps after startup", () => {
  it("sends a tap straight away with a signal", async () => {
    const { ops, sent, finishRead } = harness([]);
    ops.setCanSend(true);
    finishRead();
    await ops.load();
    await ops.tap(eggs, "checked", 3);
    expect(sent).toEqual(["1listItems:checked"]);
    expect(ops.getQueue()).toEqual([]);
  });

  it("queues taps with no signal and sends them when the signal returns", async () => {
    const { ops, sent, finishRead } = harness([]);
    finishRead();
    await ops.load();
    await ops.tap(eggs, "checked", 3);
    await ops.tap(rolls, "checked", 4);
    expect(sent).toEqual([]);
    expect(ops.getQueue()).toHaveLength(2);
    ops.setCanSend(true);
    await settled();
    expect(sent).toEqual(["1listItems:checked", "2listItems:checked"]);
    expect(ops.getQueue()).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { drain, enqueue, settle, type QueuedOp } from "./queue";

const eggs = "1listItems" as Id<"listItems">;
const rolls = "2listItems" as Id<"listItems">;
const ham = "3listItems" as Id<"listItems">;

describe("enqueue", () => {
  it("appends an op for an item not yet queued", () => {
    const queue = enqueue([{ listItemId: eggs, status: "checked", at: 1 }], {
      listItemId: rolls,
      status: "checked",
      at: 2,
    });
    expect(queue).toEqual([
      { listItemId: eggs, status: "checked", at: 1 },
      { listItemId: rolls, status: "checked", at: 2 },
    ]);
  });

  it("keeps one op per item, the latest", () => {
    let queue: QueuedOp[] = [];
    queue = enqueue(queue, { listItemId: eggs, status: "checked", at: 1 });
    queue = enqueue(queue, { listItemId: rolls, status: "checked", at: 2 });
    queue = enqueue(queue, { listItemId: eggs, status: "skipped", at: 3 });
    expect(queue).toEqual([
      { listItemId: rolls, status: "checked", at: 2 },
      { listItemId: eggs, status: "skipped", at: 3 },
    ]);
  });

  it("leaves one needed op after a queued check then un-check", () => {
    let queue: QueuedOp[] = [];
    queue = enqueue(queue, { listItemId: eggs, status: "checked", at: 1 });
    queue = enqueue(queue, { listItemId: eggs, status: "needed", at: 2 });
    expect(queue).toEqual([{ listItemId: eggs, status: "needed", at: 2 }]);
  });

  it("does not change the queue it was given", () => {
    const before: QueuedOp[] = [{ listItemId: eggs, status: "checked", at: 1 }];
    enqueue(before, { listItemId: eggs, status: "needed", at: 2 });
    expect(before).toEqual([{ listItemId: eggs, status: "checked", at: 1 }]);
  });
});

describe("drain", () => {
  it("sends every op in queue order and returns nothing left when all succeed", async () => {
    const sent: string[] = [];
    const queue: QueuedOp[] = [
      { listItemId: eggs, status: "checked", at: 1 },
      { listItemId: rolls, status: "skipped", at: 2 },
      { listItemId: ham, status: "needed", at: 3 },
    ];
    const left = await drain(queue, async (op) => {
      sent.push(`${op.listItemId}:${op.status}`);
    });
    expect(sent).toEqual(["1listItems:checked", "2listItems:skipped", "3listItems:needed"]);
    expect(left).toEqual([]);
  });

  it("keeps failures for the next attempt and still sends the rest", async () => {
    const sent: string[] = [];
    const queue: QueuedOp[] = [
      { listItemId: eggs, status: "checked", at: 1 },
      { listItemId: rolls, status: "checked", at: 2 },
      { listItemId: ham, status: "checked", at: 3 },
    ];
    const left = await drain(queue, async (op) => {
      sent.push(op.listItemId);
      if (op.listItemId === rolls) throw new Error("no signal");
    });
    expect(sent).toEqual([eggs, rolls, ham]);
    expect(left).toEqual([{ listItemId: rolls, status: "checked", at: 2 }]);
  });

  it("waits for each send before starting the next", async () => {
    const events: string[] = [];
    const queue: QueuedOp[] = [
      { listItemId: eggs, status: "checked", at: 1 },
      { listItemId: rolls, status: "checked", at: 2 },
    ];
    await drain(queue, async (op) => {
      events.push(`start ${op.listItemId}`);
      await new Promise((resolve) => setTimeout(resolve, op.listItemId === eggs ? 10 : 0));
      events.push(`end ${op.listItemId}`);
    });
    expect(events).toEqual([
      "start 1listItems",
      "end 1listItems",
      "start 2listItems",
      "end 2listItems",
    ]);
  });
});

describe("settle", () => {
  it("drops the ops that went through and keeps the ones that failed", () => {
    const a: QueuedOp = { listItemId: eggs, status: "checked", at: 1 };
    const b: QueuedOp = { listItemId: rolls, status: "checked", at: 2 };
    expect(settle([a, b], [a, b], [b])).toEqual([b]);
  });

  it("keeps an op queued while the drain was running, even for an item it sent", () => {
    const sentCheck: QueuedOp = { listItemId: eggs, status: "checked", at: 1 };
    const laterUncheck: QueuedOp = { listItemId: eggs, status: "needed", at: 2 };
    const other: QueuedOp = { listItemId: rolls, status: "checked", at: 3 };
    // The drain took [sentCheck]; meanwhile eggs was un-checked and rolls was checked.
    const current = enqueue(enqueue([sentCheck], laterUncheck), other);
    expect(settle(current, [sentCheck], [])).toEqual([laterUncheck, other]);
  });
});

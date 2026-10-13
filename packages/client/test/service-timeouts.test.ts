import { expect, test } from "bun:test"
import { timeoutTracker } from "../src/service-probe"

const info = { id: "owner", version: "1", url: "http://127.0.0.1:4096", pid: 4242, password: "secret" }

test("recovery starts on the third consecutive timeout for the same owner", () => {
  const tracker = timeoutTracker()
  expect(tracker.record({ info, timedOut: true })).toBeUndefined()
  expect(tracker.record({ info: { ...info }, timedOut: true })).toBeUndefined()
  expect(tracker.record({ info, timedOut: true })).toBe(info)
})

test.each([{ id: "other" }, { version: "2" }, { url: "http://127.0.0.1:4097" }, { pid: 4243 }])(
  "a changed registration resets the timeout count: %j",
  (change) => {
    const tracker = timeoutTracker()
    tracker.record({ info, timedOut: true })
    tracker.record({ info, timedOut: true })
    const next = { ...info, ...change }
    expect(tracker.record({ info: next, timedOut: true })).toBeUndefined()
    expect(tracker.record({ info: next, timedOut: true })).toBeUndefined()
    expect(tracker.record({ info: next, timedOut: true })).toBe(next)
  },
)

test.each([
  { info, timedOut: false },
  { info: undefined, timedOut: true },
  { info: undefined, timedOut: false },
])("a non-timeout or missing registration resets the timeout count: %j", (registration) => {
  const tracker = timeoutTracker()
  tracker.record({ info, timedOut: true })
  tracker.record({ info, timedOut: true })
  expect(tracker.record(registration)).toBeUndefined()
  expect(tracker.record({ info, timedOut: true })).toBeUndefined()
  expect(tracker.record({ info, timedOut: true })).toBeUndefined()
  expect(tracker.record({ info, timedOut: true })).toBe(info)
})

test("password changes do not change registration identity", () => {
  const tracker = timeoutTracker()
  tracker.record({ info, timedOut: true })
  expect(tracker.record({ info: { ...info, password: "changed" }, timedOut: true })).toBeUndefined()
  expect(tracker.record({ info, timedOut: true })).toBe(info)
})

test("completed recovery resets the counter and ensure invocations stay independent", () => {
  const first = timeoutTracker()
  const second = timeoutTracker()
  first.record({ info, timedOut: true })
  first.record({ info, timedOut: true })
  expect(second.record({ info, timedOut: true })).toBeUndefined()
  expect(first.record({ info, timedOut: true })).toBe(info)
  first.reset()
  expect(first.record({ info, timedOut: true })).toBeUndefined()
  expect(first.record({ info, timedOut: true })).toBeUndefined()
  expect(second.record({ info, timedOut: true })).toBeUndefined()
  expect(first.record({ info, timedOut: true })).toBe(info)
})

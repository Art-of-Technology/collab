const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { load } = require("./helpers.cjs");
const model = load("src/lib/agent-floor-model.ts");
const { commentHtml } = load("src/lib/comment-html.ts", {
  "isomorphic-dompurify": { default: require("isomorphic-dompurify") },
  marked: require("marked"),
});
const now = Date.now();
const at = (offset) => new Date(now + offset).toISOString();
const snapshot = () => ({
  workspace: { id: "ws", slug: "team", name: "Team" },
  projects: [
    {
      id: "p",
      name: "Project",
      color: null,
      statuses: [{ id: "s", name: "In review", isFinal: false }],
    },
  ],
  projectPage: { page: 0, search: "", projectId: "", hasMore: false },
  agents: [
    { id: "a", name: "writer" },
    { id: "b", name: "reviewer" },
  ],
  tasks: ["a", "b"].map((id) => ({
    id: `task-${id}`,
    issueId: `issue-${id}`,
    issueKey: `T-${id}`,
    title: "Review UI",
    projectId: "p",
    status: "In review",
    final: false,
    handoffState: "claimed",
    contentHtml: commentHtml("Evidence\nNext step"),
    claimedById: id,
    senderId: "a",
    recipientIds: [id],
    updatedAt: at(-1000),
  })),
  events: ["a", "b"].map((id) => ({
    id: `event-${id}`,
    agentId: id,
    taskId: `task-${id}`,
    projectId: "p",
    action: "AGENT_PROGRESS",
    contentHtml: commentHtml("Reviewing evidence"),
    at: at(-1000),
  })),
  generatedAt: at(0),
  limited: false,
});
test("two agents on one project retain separate claims and stale work never implies execution", () => {
  const data = snapshot();
  assert.equal(model.agentReport(data, "a", now).tasks[0].id, "task-a");
  assert.equal(model.agentReport(data, "b", now).tasks[0].id, "task-b");
  assert.equal(model.agentReport(data, "a", now).typing, true);
  assert.equal(
    model.agentReport(data, "a", now + model.RECENT_REPORT_MS).typing,
    false,
  );
  for (const status of ["Unblocked", "Waiting for review", "On hold", "Blocked"]) {
    data.tasks[0].status = status;
    assert.equal(model.agentReport(data, "a", now).typing, true);
    assert.equal(model.agentReport(data, "a", now).label, "Recent work report");
  }
  data.tasks[0].status = "In review";
  data.tasks[0].handoffState = "completed";
  assert.equal(model.agentReport(data, "a", now).typing, false);
  assert.equal(model.agentReport(data, "b", now, "other").tasks.length, 0);
});
test("refresh deduplicates activity and does not replay older history or infer approval", () => {
  const previous = snapshot();
  const next = snapshot();
  const playback = model.createFloorPlayback(previous);
  const event = {
    ...next.events[0],
    id: "new",
    action: "AGENT_PASSED",
    at: at(1000),
  };
  next.events.unshift(event, { ...event, id: "historical", at: at(-60000) });
  next.generatedAt = at(2000);
  assert.deepEqual(
    Array.from(model.arrivingEvents(previous, next, playback.seen), (e) => e.id),
    ["new"],
  );
  assert.equal(model.arrivingEvents(next, next, playback.seen).length, 0);
  assert.equal(model.agentReport(next, "a", now + 2000).typing, false);
  assert.equal(model.eventLabels.AGENT_PASSED, "Passed work on");
});
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((w) => matches(row, w));
    if (key === "OR") return value.some((w) => matches(row, w));
    const actual = row?.[key];
    if (value == null || typeof value !== "object") return value === actual;
    if ("some" in value) return actual?.some((r) => matches(r, value.some));
    if ("in" in value) return value.in.includes(actual);
    if ("has" in value) return actual?.includes(value.has);
    if ("hasSome" in value)
      return actual?.some((v) => value.hasSome.includes(v));
    if ("startsWith" in value) return actual?.startsWith(value.startsWith);
    if ("contains" in value) return actual?.toLowerCase().includes(value.contains.toLowerCase());
    return actual != null && matches(actual, value);
  });
}
function project(row, select) {
  return Object.fromEntries(
    Object.entries(select).map(([key, spec]) => [
      key,
      spec === true
        ? row[key]
        : Array.isArray(row[key])
          ? row[key].map((r) => project(r, spec.select))
          : row[key]
            ? project(row[key], spec.select)
            : null,
    ]),
  );
}
function fixture() {
  const ws = {
    id: "ws",
    slug: "team",
    name: "Team",
    ownerId: "alice",
    members: [
      { userId: "bob", status: true },
      { userId: "revoked", status: false },
    ],
  };
  const foreign = {
    id: "foreign",
    slug: "other",
    ownerId: "outsider",
    members: [],
  };
  const projects = [
    {
      id: "p",
      name: "Visible",
      color: null,
      workspaceId: "ws",
      workspace: ws,
      statuses: [],
    },
    {
      id: "hidden",
      name: "PRIVATE PROJECT",
      color: null,
      workspaceId: "foreign",
      workspace: foreign,
      statuses: [],
    },
  ];
  const agents = [
    {
      id: "a",
      name: "writer",
      userId: "alice",
      workspaceId: "ws",
      labelIds: [],
    },
    {
      id: "b",
      name: "reviewer",
      userId: "bob",
      workspaceId: "ws",
      labelIds: ["review"],
    },
    {
      id: "r",
      name: "revoked-agent",
      userId: "revoked",
      workspaceId: "ws",
      labelIds: [],
    },
  ];
  const handoff = (id, projectRow = projects[0], recipient = "writer") => ({
    id,
    workspaceId: "ws",
    status: "claimed",
    claimedById: recipient === "writer" ? "a" : "r",
    senderId: null,
    content: `content-${id}`,
    recipientNames: [recipient],
    labelIds: [],
    updatedAt: new Date(),
    issue: {
      id: `issue-${id}`,
      issueKey: `T-${id}`,
      title: `title-${id}`,
      projectId: projectRow.id,
      project: projectRow,
      workspaceId: "ws",
      workspace: ws,
      statusId: null,
      status: "Started",
      projectStatus: null,
    },
  });
  const rows = [
    handoff("ok"),
    handoff("secret", projects[1]),
    handoff("revoked", projects[0], "revoked-agent"),
  ];
  const event = (id, task = "ok", projectId = "p") => ({
    id,
    action: "AGENT_PROGRESS",
    details: JSON.stringify({
      agent: { id: "a", name: "untrusted-name" },
      handoffId: task,
      content: `report-${id}`,
      secret: "NEVER RETURN",
    }),
    createdAt: new Date(),
    itemId: `issue-${task}`,
    itemType: "ISSUE",
    workspaceId: "ws",
    projectId,
  });
  const activities = [
    event("visible"),
    event("foreign-event", "secret", "hidden"),
    event("wrong-project", "ok", "hidden"),
    {
      ...event("spoof"),
      details: JSON.stringify({
        agent: { id: "outsider" },
        handoffId: "ok",
        content: "SPOOFED",
      }),
    },
  ];
  const calls = [];
  const many = (name, records) => ({
    findMany: async ({ where, select, take, skip = 0, orderBy = [] }) => {
      calls.push(name);
      assert.ok(take <= 501);
      return records
        .filter((row) => matches(row, where))
        .sort((a, b) => {
          for (const order of Array.isArray(orderBy) ? orderBy : [orderBy]) {
            const [key, direction] = Object.entries(order)[0];
            const cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
            if (cmp) return direction === "desc" ? -cmp : cmp;
          }
          return 0;
        })
        .slice(skip, skip + take)
        .map((row) => project(row, select));
    },
  });
  const prisma = {
    workspace: {
      findFirst: async ({ where, select }) => {
        calls.push("workspace");
        const row = [ws, foreign].find((r) => matches(r, where));
        return row ? project(row, select) : null;
      },
    },
    project: many("projects", projects),
    agentRegistration: many("agents", agents),
    agentHandoff: many("handoffs", rows),
    issueActivity: many("activity", activities),
  };
  const service = load("src/lib/agent-floor.ts", {
    "server-only": {},
    "@/lib/prisma": { prisma },
    "@/lib/agent-floor-model": model,
    "@/lib/comment-html": { commentHtml },
  });
  return { ...service, rows, calls, ws, projects, activities, handoff, event };
}
test("server snapshot enforces workspace and issue/project access, recipient access, and activity provenance", async () => {
  const f = fixture();
  for (const user of ["", "outsider", "revoked"])
    assert.equal(await f.readAgentFloor(user, "ws"), null);
  assert.ok(!f.calls.includes("handoffs"));
  const result = await f.readAgentFloor("alice", "team");
  assert.deepEqual(
    Array.from(result.projects, (p) => p.id),
    ["p"],
  );
  assert.deepEqual(
    Array.from(result.tasks, (t) => t.id),
    ["ok"],
  );
  assert.deepEqual(
    Array.from(result.events, (e) => e.id),
    ["visible"],
  );
  assert.equal(result.tasks[0].status, "Started");
  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE PROJECT|content-secret|content-revoked|SPOOFED|NEVER RETURN|userId|labelIds|ownerId/,
  );
  f.ws.members[0].status = false;
  assert.equal(await f.readAgentFloor("bob", "ws"), null);
});
test("read endpoint rejects anonymous callers, rechecks membership, and masks internal errors", async () => {
  for (const mode of ["anonymous", "removed", "failure", "ok"]) {
    let reads = 0;
    const { GET } = load(
      "src/app/api/workspaces/[workspaceId]/agent-floor/route.ts",
      {
        "next/server": {
          NextResponse: {
            json: (body, opts) => new Response(JSON.stringify(body), opts),
          },
        },
        "@/lib/request-session": {
          getServerSession: async () =>
            mode === "anonymous" ? null : { user: { id: "alice" } },
        },
        "@/lib/auth": { authOptions: {} },
        "@/lib/agent-floor": {
          readAgentFloor: async () => {
            reads++;
            if (mode === "failure") throw new Error("SECRET DATABASE URL");
            return mode === "removed" ? null : snapshot();
          },
        },
      },
      { URL },
    );
    const response = await GET(new Request("https://collab.test/api/workspaces/ws/agent-floor"), {
      params: Promise.resolve({ workspaceId: "ws" }),
    });
    assert.equal(
      response.status,
      { anonymous: 401, removed: 404, failure: 503, ok: 200 }[mode],
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(reads, mode === "anonymous" ? 0 : 1);
    assert.doesNotMatch(await response.text(), /SECRET/);
  }
});
function floorComponent(globals = {}) {
  return load("src/components/agents/floor/OrganisationFloor.tsx", {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/dynamic": { default: () => () => null },
    "next/link": {
      default: ({ children, ...props }) => React.createElement("a", props, children),
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => React.createElement("button", props, children),
    },
    "@/lib/agent-floor-model": model,
  }, globals).OrganisationFloor;
}
test("server-rendered fallback exposes distinct agents, real statuses and sanitized reports", () => {
  const data = snapshot();
  data.tasks[0].contentHtml = commentHtml("# Evidence\n\n[Build](https://example.com/build)\n\n<script>alert(1)</script>");
  data.agents[0].name = "<img src=x onerror=alert(1)>";
  const html = renderToStaticMarkup(React.createElement(floorComponent(), { initial: data }));
  assert.match(html, /reviewer/);
  assert.match(html, /In review/);
  assert.match(html, /task board/i);
  assert.match(html, /href="https:\/\/example.com\/build"/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /\/team\/issues\/T-a/);
  assert.match(html, /Reported progress/);
});
test("a reconnect establishes a new baseline instead of replaying missed work", () => {
  const previous = snapshot(),
    next = snapshot();
  next.generatedAt = at(120000);
  next.events.unshift({ ...next.events[0], id: "missed", at: at(60000) });
  assert.equal(model.arrivingEvents(previous, next, model.createFloorPlayback(previous).seen).length, 0);
});
function sceneFixture() {
  const THREE = require("three");
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<div id="floor"></div>');
  const { document } = dom.window;
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    this.lines = [];
    return { fillRect() {}, fillText: (text) => this.lines.push(text) };
  };
  let renderScene, pending, time = 0;
  const stats = { cancelled: 0, disposed: 0, disconnected: 0, geometriesDisposed: 0 };
  class Renderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    render(scene) { renderScene = scene; }
    dispose() { stats.disposed++; }
    forceContextLoss() {}
  }
  class Controls {
    target = new THREE.Vector3();
    update() {}
    dispose() { stats.disposed++; }
  }
  const { createFloorRenderer } = load("src/components/agents/floor/floor-renderer.ts", {
    three: { ...THREE, WebGLRenderer: Renderer },
    "three/examples/jsm/controls/OrbitControls.js": { OrbitControls: Controls },
    "@/lib/agent-floor-model": model,
  }, {
    window: dom.window, document,
    performance: { now: () => time },
    requestAnimationFrame: (fn) => { pending = fn; return 1; },
    cancelAnimationFrame: () => { stats.cancelled++; },
    ResizeObserver: class {
      observe() {}
      disconnect() { stats.disconnected++; }
    },
  });
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  const host = document.getElementById("floor");
  const create = () => createFloorRenderer(host, { onAgent() {}, onProject() {}, onFailure() {} });
  let controller = create();
  const data = snapshot();
  let props = {
    snapshot: data, projects: data.projects, selected: "", animate: true,
    playback: model.createFloorPlayback(data),
  };
  controller.update(props);
  pending(0);
  renderScene.traverse((object) => {
    if (object.geometry) object.geometry.addEventListener("dispose", () => stats.geometriesDisposed++);
  });
  const objects = (predicate) => {
    const result = [];
    renderScene.traverse((object) => { if (predicate(object)) result.push(object); });
    return result;
  };
  return {
    get props() { return props; }, stats, host,
    update(next = {}) {
      props = { ...props, ...next };
      controller.update(props);
      pending(time);
    },
    arrive(events, offset = 20000, animate = props.animate) {
      const next = { ...props.snapshot, generatedAt: at(offset), events: [...events, ...props.snapshot.events] };
      model.updateFloorPlayback(props.playback, props.snapshot, next, animate);
      this.update({ snapshot: next, animate });
    },
    step(ms) { for (const end = time + ms; time < end;) { time += 100; pending(time); } },
    actors: () => objects((object) => object.userData.agent),
    board: (id) => objects((object) => object.userData.task === id)[0],
    card(actor) { return actor.children.find((object) => object.geometry?.type === "PlaneGeometry"); },
    unmount() { controller.dispose(); },
    remount() { controller.dispose(); controller = create(); controller.update(props); pending(time); },
    close() { controller.dispose(); controller.dispose(); dom.window.close(); },
  };
}
const claim = (data, id, taskId = "task-a", action = "AGENT_CLAIM") => ({
  ...data.events[0], id, taskId, action, at: new Date(Date.parse(data.generatedAt) + 1000).toISOString(),
});
test("3D actors walk once, return to laptops, and dispose resources", () => {
  const f = sceneFixture();
  try {
    assert.equal(f.actors().length, 2);
    const desk = f.actors()[0].position.clone();
    f.arrive([claim(f.props.snapshot, "claim")]);
    const writer = f.actors().find((actor) => actor.userData.agent === "a");
    f.step(2500);
    assert.ok(writer.position.distanceTo(desk) > 1);
    f.step(8500);
    assert.ok(writer.position.distanceTo(desk) < 0.01);
    f.remount();
    f.arrive([claim(f.props.snapshot, "claim")], 40000);
    f.step(2500);
    assert.ok(f.actors().find((a) => a.userData.agent === "a").position.distanceTo(desk) < 0.01);
  } finally { f.close(); }
  assert.equal(f.host.querySelectorAll("canvas").length, 0);
  assert.equal(f.stats.disposed, 4);
  assert.equal(f.stats.disconnected, 2);
  assert.ok(f.stats.cancelled > 0);
  assert.ok(f.stats.geometriesDisposed > 0);
});
test("queued claims retain progress and card identity across refresh, drill-down and scene remount", () => {
  const f = sceneFixture();
  try {
    const data = f.props.snapshot;
    data.tasks = ["A", "B", "C"].map((id) => ({ ...data.tasks[0], id, issueKey: `T-${id}`, status: `Status ${id}` }));
    const desk = f.actors().find((a) => a.userData.agent === "a").position.clone();
    f.arrive(data.tasks.map((task) => claim(data, `claim-${task.id}`, task.id)));
    const carried = () => f.card(f.actors().find((a) => a.userData.agent === "a"));
    f.step(4500);
    assert.equal(carried().visible, true);
    assert.deepEqual(Array.from(carried().material.map.image.lines), ["T-A", "Status A"]);
    f.update({ projects: [] });
    f.step(1000);
    f.update({ projects: data.projects });
    assert.equal(carried().visible, true);
    assert.equal(f.board("A").visible, false);
    f.step(10200);
    assert.equal(carried().visible, true);
    assert.deepEqual(Array.from(carried().material.map.image.lines), ["T-B", "Status B"]);
    f.step(5200);
    f.arrive([], 40000);
    f.step(5200);
    assert.equal(carried().visible, true);
    assert.deepEqual(Array.from(carried().material.map.image.lines), ["T-C", "Status C"]);
    f.remount();
    assert.equal(carried().visible, true);
    assert.deepEqual(Array.from(carried().material.map.image.lines), ["T-C", "Status C"]);
    f.step(6000);
    assert.equal(f.props.playback.queues.size, 0);
    assert.ok(f.actors().find((a) => a.userData.agent === "a").position.distanceTo(desk) < 0.01);
    f.remount();
    f.step(2500);
    assert.ok(f.actors().find((a) => a.userData.agent === "a").position.distanceTo(desk) < 0.01);
  } finally { f.close(); }
});
test("deleted queued tasks unblock loaded rooms without losing off-page queues or replaying consumed events", () => {
  const f = sceneFixture();
  try {
    const initial = f.props.snapshot;
    const other = { ...initial.projects[0], id: "other" };
    const tasks = ["A", "B"].map((id) => ({ ...initial.tasks[0], id, issueKey: `T-${id}` }));
    const offPageTask = { ...tasks[0], id: "off-page", projectId: other.id };
    const data = { ...initial, projects: [...initial.projects, other], tasks: [...tasks, offPageTask] };
    f.update({ snapshot: data, projects: data.projects });
    const desk = f.actors().find((actor) => actor.userData.agent === "a").position.clone();
    f.unmount(); // List view keeps polling without a renderer.
    const events = [
      ...tasks.map((task) => claim(data, `claim-${task.id}`, task.id)),
      { ...claim(data, "claim-off-page", offPageTask.id), projectId: other.id },
    ];
    f.arrive(events);
    const playback = f.props.playback;
    const key = model.floorActorKey("p", "a");
    const otherKey = model.floorActorKey(other.id, "a");
    const pendingB = playback.queues.get(key)[1];
    const offPage = playback.queues.get(otherKey)[0];
    const previous = f.props.snapshot;
    const next = { ...previous, projects: initial.projects, tasks: [tasks[1]], generatedAt: at(40000) };
    model.updateFloorPlayback(playback, previous, next, true);
    f.update({ snapshot: next, projects: next.projects });
    f.remount();
    f.step(4500);
    const actor = f.actors().find((actor) => actor.userData.agent === "a");
    assert.equal(f.card(actor).visible, true);
    assert.equal(f.card(actor).material.map.image.lines[0], "T-B");
    assert.equal(playback.queues.get(key)[0], pendingB);
    assert.equal(playback.queues.get(otherKey)[0], offPage);
    assert.equal(offPage.elapsed, 0);
    f.step(6000);
    assert.equal(playback.queues.has(key), false);
    f.arrive(events, 60000);
    f.remount();
    f.step(4500);
    assert.equal(playback.queues.has(key), false);
    assert.ok(f.actors().find((actor) => actor.userData.agent === "a").position.distanceTo(desk) < 0.01);
    assert.equal(playback.queues.get(otherKey)[0], offPage);
    assert.ok(events.every((event) => playback.seen.has(event.id)));
  } finally { f.close(); }
});
test("cancelling during carrying restores every board card and never replays cancelled events", () => {
  const f = sceneFixture();
  try {
    const events = [claim(f.props.snapshot, "first"), claim(f.props.snapshot, "second")];
    const desk = f.actors().find((a) => a.userData.agent === "a").position.clone();
    f.arrive(events);
    f.step(4500);
    assert.equal(f.board("task-a").visible, false);
    f.update({ animate: false });
    assert.equal(f.board("task-a").visible, true);
    assert.equal(f.props.playback.queues.size, 0);
    f.arrive([claim(f.props.snapshot, "disabled")], 40000, false);
    f.update({ animate: true });
    f.remount();
    f.arrive(events, 60000);
    f.step(4500);
    assert.equal(f.board("task-a").visible, true);
    const actor = f.actors().find((a) => a.userData.agent === "a");
    assert.equal(f.card(actor).visible, false);
    assert.ok(actor.position.distanceTo(desk) < 0.01);
    f.arrive([claim(f.props.snapshot, "fresh")], 80000);
    f.step(2500);
    assert.ok(f.actors().find((a) => a.userData.agent === "a").position.distanceTo(desk) > 1);
  } finally { f.close(); }
});
test("late commits arrive once across overlapping snapshots and reconnects establish a baseline", () => {
  const initial = snapshot();
  const playback = model.createFloorPlayback(initial);
  const late = { ...claim(initial, "late"), at: at(-10000) };
  const first = { ...initial, generatedAt: at(20000), events: [late, ...initial.events] };
  model.updateFloorPlayback(playback, initial, first, true);
  assert.deepEqual(Array.from(playback.queues.values()).flat().map((item) => item.event.id), ["late"]);
  playback.queues.clear();
  const missing = { ...first, generatedAt: at(30000), events: [] };
  model.updateFloorPlayback(playback, first, missing, true);
  const returned = { ...first, generatedAt: at(40000) };
  model.updateFloorPlayback(playback, missing, returned, true);
  assert.equal(playback.queues.size, 0);
  const reconnect = { ...returned, generatedAt: at(120000), events: [{ ...late, id: "missed", at: at(100000) }] };
  model.updateFloorPlayback(playback, returned, reconnect, true);
  assert.equal(playback.queues.size, 0);
  model.updateFloorPlayback(playback, reconnect, { ...reconnect, generatedAt: at(140000) }, true);
  assert.equal(playback.queues.size, 0);
});
test("room navigation baselines new history while preserving pending events in existing rooms", () => {
  const initial = snapshot();
  const playback = model.createFloorPlayback(initial);
  const next = { ...initial, generatedAt: at(20000), events: [claim(initial, "claim")] };
  model.updateFloorPlayback(playback, initial, next, true);
  const other = {
    ...next, projectPage: { ...next.projectPage, page: 1 },
    events: [{ ...claim(next, "other-history"), projectId: "other" }], generatedAt: at(30000),
  };
  model.updateFloorPlayback(playback, next, other, true);
  model.updateFloorPlayback(playback, other, { ...next, generatedAt: at(40000) }, true);
  assert.deepEqual(Array.from(playback.queues.values()).flat().map((item) => item.event.id), ["claim"]);
});
test("release and system events stay in the timeline without walk animations", () => {
  const initial = snapshot();
  const playback = model.createFloorPlayback(initial);
  const events = ["AGENT_CLAIM", "AGENT_PASSED", "AGENT_COMPLETE", "AGENT_RELEASE", "AGENT_LABEL_ADDED"].map(
    (action) => ({ ...claim(initial, action, "task-a", action), agentId: action === "AGENT_LABEL_ADDED" ? null : "a" }),
  );
  const next = { ...initial, events, generatedAt: at(20000) };
  model.updateFloorPlayback(playback, initial, next, true);
  assert.deepEqual(Array.from(playback.queues.values()).flat().map((item) => item.event.action), ["AGENT_CLAIM", "AGENT_COMPLETE", "AGENT_PASSED"]);
  const html = renderToStaticMarkup(React.createElement(floorComponent(), { initial: next }));
  assert.match(html, /Released claim/);
  assert.match(html, /System · label routing/);
  assert.match(html, /Label routed work/);
});
test("bounded server paging, search and drill-down reach projects beyond the former cap", async () => {
  const f = fixture();
  f.projects[0].name = "Room 000";
  for (let i = 1; i <= 200; i++) {
    f.projects.push({ ...f.projects[0], id: `p-${i}`, name: `Room ${String(i).padStart(3, "0")}` });
  }
  f.rows.push(f.handoff("last", f.projects.at(-1)));
  const visited = new Set();
  let page = 0, result;
  do {
    result = await f.readAgentFloor("alice", "ws", { page });
    assert.ok(result.projects.length <= 6);
    for (const project of result.projects) visited.add(project.id);
    for (const task of result.tasks) assert.ok(result.projects.some((p) => p.id === task.projectId));
    page++;
  } while (result.projectPage.hasMore);
  assert.equal(visited.size, 201);
  assert.ok(visited.has("p-200"));
  assert.equal(result.tasks[0].id, "last");
  const searched = await f.readAgentFloor("alice", "ws", { search: "room 200" });
  assert.deepEqual(Array.from(searched.projects, (p) => p.id), ["p-200"]);
  assert.equal(searched.tasks[0].id, "last");
  const drilled = await f.readAgentFloor("alice", "ws", { projectId: "p-200" });
  assert.equal(drilled.projects[0].id, "p-200");
  assert.equal(drilled.tasks[0].id, "last");
  for (const query of [{ projectId: "hidden" }, { search: "PRIVATE" }]) {
    const hidden = await f.readAgentFloor("alice", "ws", query);
    assert.equal(hidden.projects.length, 0);
    assert.equal(hidden.tasks.length, 0);
    assert.equal(hidden.events.length, 0);
  }
  for (const page of [NaN, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    const invalid = await f.readAgentFloor("alice", "ws", { page });
    assert.equal(invalid.projectPage.page, 0);
    assert.equal(invalid.projects.length, 6);
  }
});
test("polling route forwards bounded project navigation to the authorized read service", async () => {
  const f = fixture();
  for (let i = 1; i <= 8; i++) f.projects.push({ ...f.projects[0], id: `p-${i}`, name: `Visible ${i}` });
  const { GET } = load("src/app/api/workspaces/[workspaceId]/agent-floor/route.ts", {
    "next/server": { NextResponse: { json: (body, opts) => new Response(JSON.stringify(body), opts) } },
    "@/lib/request-session": { getServerSession: async () => ({ user: { id: "alice" } }) },
    "@/lib/auth": { authOptions: {} },
    "@/lib/agent-floor": { readAgentFloor: f.readAgentFloor },
  }, { URL });
  for (const [query, ids] of [["page=1", ["p-6", "p-7", "p-8"]], ["search=Visible%208", ["p-8"]], ["projectId=p-8", ["p-8"]]]) {
    const response = await GET(new Request(`https://collab.test/api/workspaces/ws/agent-floor?${query}`), { params: Promise.resolve({ workspaceId: "ws" }) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).projects.map((p) => p.id), ids);
  }
});
test("label-trigger producer becomes an authorized system event without an agent identity", async () => {
  const f = fixture();
  const { enqueueLabelHandoff } = load("src/lib/agent-label-triggers.ts", { "node:crypto": require("node:crypto") });
  await enqueueLabelHandoff({
    taskLabel: { findMany: async () => [{ id: "review" }] },
    agentRegistration: { findMany: async () => [{ labelIds: ["review"] }] },
    agentHandoff: { create: async ({ data }) => {
      const row = { ...f.rows[0], ...data, id: "routed", status: "open", claimedById: null, senderId: null };
      f.rows.push(row);
      return row;
    } },
    issueActivity: { create: async ({ data }) => {
      f.activities.push({ ...data, id: "label-event", createdAt: new Date() });
    } },
  }, "alice", { ...f.rows[0].issue, labels: [{ id: "review" }] }, []);
  f.activities.push({ ...f.activities.at(-1), id: "wrong-issue", itemId: "other" });
  const result = await f.readAgentFloor("alice", "ws");
  const event = result.events.find((event) => event.id === "label-event");
  assert.ok(event);
  assert.equal(event.agentId, null);
  assert.equal(event.taskId, "routed");
  assert.equal(result.events.some((event) => event.id === "wrong-issue"), false);
  assert.deepEqual(Array.from(result.agents, (agent) => agent.id).sort(), ["a", "b", "r"]);
  assert.match(renderToStaticMarkup(React.createElement(floorComponent(), { initial: result })), /System · label routing/);
});
test("handoffs and event evidence preserve the inbox rich HTML, Markdown and static SVG image contract", async () => {
  const { JSDOM } = require("jsdom");
  const src = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64")}`;
  for (const content of [
    `# Evidence\n\n**Report**\n\n[Build](https://example.com/build)\n\n![Diagram](${src})`,
    `<h1>Evidence</h1><strong>Report</strong><a href="https://example.com/build">Build</a><img src="${src}" alt="Diagram" onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">unsafe</a>`,
  ]) {
    const f = fixture();
    f.rows[0].content = content;
    const details = JSON.parse(f.activities[0].details);
    f.activities[0].details = JSON.stringify({ ...details, content });
    const result = await f.readAgentFloor("alice", "ws");
    assert.equal(result.tasks[0].contentHtml, commentHtml(content));
    assert.equal(result.events[0].contentHtml, commentHtml(content));
    const dom = new JSDOM(renderToStaticMarkup(React.createElement(floorComponent(), { initial: result })));
    try {
      const surfaces = dom.window.document.querySelectorAll("details");
      assert.equal(surfaces.length, 2);
      for (const surface of surfaces) {
        assert.equal(surface.querySelector("h1").textContent, "Evidence");
        assert.equal(surface.querySelector("strong").textContent, "Report");
        assert.equal(surface.querySelector("a").href, "https://example.com/build");
        assert.equal(surface.querySelector("img").getAttribute("src"), src);
        assert.equal(surface.querySelectorAll("script,svg,iframe,object,embed,[onload],[href^='javascript:']").length, 0);
      }
    } finally { dom.window.close(); }
  }
});
test("project controls and visible-page polling keep requests scoped and retain stale data on failure", async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<div id="app"></div>', { url: "https://collab.test" });
  const saved = Object.fromEntries(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
  const { createRoot } = require("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("app"));
  const f = fixture();
  for (let i = 1; i <= 8; i++) f.projects.push({ ...f.projects[0], id: `p-${i}`, name: `Visible ${i}` });
  let poll, mode = "ok";
  const requests = [];
  const Component = floorComponent({
    document: dom.window.document, URLSearchParams, AbortController,
    setTimeout, clearTimeout,
    setInterval: (fn) => { poll = fn; return 1; }, clearInterval() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    fetch: async (path) => {
      const params = new URL(path, "https://collab.test").searchParams;
      requests.push(Object.fromEntries(params));
      if (mode === "failure") throw new Error("unavailable");
      if (mode === "revoked") return new Response("{}", { status: 404 });
      const next = await f.readAgentFloor("alice", "ws", {
        page: Number(params.get("page")), search: params.get("search"), projectId: params.get("projectId"),
      });
      return new Response(JSON.stringify(next));
    },
  });
  const button = (name) => Array.from(dom.window.document.querySelectorAll("button")).find((item) => item.textContent === name);
  try {
    const initial = await f.readAgentFloor("alice", "ws");
    await React.act(async () => root.render(React.createElement(Component, { initial })));
    assert.equal(requests.length, 0);
    await React.act(async () => button("Next rooms").click());
    assert.equal(requests.at(-1).page, "1");
    assert.match(dom.window.document.body.textContent, /Visible 8/);
    await React.act(async () => {
      const select = dom.window.document.querySelector("select");
      select.value = "p-8";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.deepEqual(requests.at(-1), { page: "0", search: "", projectId: "p-8" });
    await React.act(async () => poll());
    assert.deepEqual(requests.at(-1), { page: "0", search: "", projectId: "p-8" });
    const count = requests.length;
    Object.defineProperty(dom.window.document, "hidden", { value: true, configurable: true });
    await React.act(async () => poll());
    assert.equal(requests.length, count);
    Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
    mode = "failure";
    await React.act(async () => poll());
    assert.match(dom.window.document.body.textContent, /Refresh failed/);
    assert.match(dom.window.document.body.textContent, /Visible 8/);
    mode = "revoked";
    await React.act(async () => poll());
    assert.match(dom.window.document.body.textContent, /Access changed/);
    assert.doesNotMatch(dom.window.document.body.textContent, /Visible 8/);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
  }
});

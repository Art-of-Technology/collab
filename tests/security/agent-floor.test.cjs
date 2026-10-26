const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { load } = require("./helpers.cjs");
const model = load("src/lib/agent-floor-model.ts");
const markdown = load("src/components/ui/markdown-renderer.tsx", {
  "react/jsx-runtime": require("react/jsx-runtime"),
  "react-markdown": { default: require("react-markdown").default },
  "remark-gfm": { default: require("remark-gfm").default },
  "rehype-highlight": { default: require("rehype-highlight").default },
  "rehype-sanitize": { default: require("rehype-sanitize").default },
  "highlight.js/styles/github.css": {},
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
    content: "Evidence\nNext step",
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
    content: "Reviewing evidence",
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
  data.tasks[0].status = "Blocked";
  assert.equal(model.agentReport(data, "a", now).typing, false);
  data.tasks[0].status = "In review";
  data.tasks[0].handoffState = "completed";
  assert.equal(model.agentReport(data, "a", now).typing, false);
  assert.equal(model.agentReport(data, "b", now, "other").tasks.length, 0);
});
test("refresh deduplicates activity and does not replay older history or infer approval", () => {
  const previous = snapshot();
  const next = snapshot();
  const event = {
    ...next.events[0],
    id: "new",
    action: "AGENT_PASSED",
    at: at(1000),
  };
  next.events.unshift(event, { ...event, id: "historical", at: at(-20000) });
  next.generatedAt = at(2000);
  assert.deepEqual(
    Array.from(model.arrivingEvents(previous, next), (e) => e.id),
    ["new"],
  );
  assert.equal(model.arrivingEvents(next, next).length, 0);
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
    findMany: async ({ where, select, take }) => {
      calls.push(name);
      assert.ok(take <= 501);
      return records
        .filter((row) => matches(row, where))
        .slice(0, take)
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
  });
  return { ...service, rows, calls, ws };
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
    );
    const response = await GET(null, {
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
test("server-rendered fallback exposes distinct agents, real statuses and safely escaped reports", () => {
  const data = snapshot();
  data.tasks[0].content = "# Evidence\n\n[Build](https://example.com/build)\n\n<script>alert(1)</script>";
  data.agents[0].name = "<img src=x onerror=alert(1)>";
  const { OrganisationFloor } = load(
    "src/components/agents/floor/OrganisationFloor.tsx",
    {
      react: React,
      "react/jsx-runtime": require("react/jsx-runtime"),
      "next/dynamic": { default: () => () => null },
      "next/link": {
        default: ({ children, ...props }) =>
          React.createElement("a", props, children),
      },
      "@/components/ui/button": {
        Button: ({ children, ...props }) =>
          React.createElement("button", props, children),
      },
      "@/lib/agent-floor-model": model,
      "@/components/ui/markdown-renderer": markdown,
    },
  );
  const html = renderToStaticMarkup(
    React.createElement(OrganisationFloor, { initial: data }),
  );
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
  assert.equal(model.arrivingEvents(previous, next).length, 0);
});
test("3D actors walk once for a new claim, return to their desks, respect reduced motion, and dispose resources", () => {
  const THREE = require("three");
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<div id="floor"></div>');
  const { document } = dom.window;
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect() {},
    fillText() {},
  });
  let renderScene,
    pending,
    cancelled = 0,
    disposed = 0,
    disconnected = 0,
    geometriesDisposed = 0;
  class Renderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    render(scene) {
      renderScene = scene;
    }
    dispose() {
      disposed++;
    }
    forceContextLoss() {}
  }
  class Controls {
    target = new THREE.Vector3();
    update() {}
    dispose() {
      disposed++;
    }
  }
  const { createFloorRenderer } = load(
    "src/components/agents/floor/floor-renderer.ts",
    {
      three: { ...THREE, WebGLRenderer: Renderer },
      "three/examples/jsm/controls/OrbitControls.js": {
        OrbitControls: Controls,
      },
      "@/lib/agent-floor-model": model,
      "@/components/ui/markdown-renderer": markdown,
    },
    {
      window: dom.window,
      document,
      performance: { now: () => 0 },
      requestAnimationFrame: (fn) => {
        pending = fn;
        return 1;
      },
      cancelAnimationFrame: () => {
        cancelled++;
      },
      ResizeObserver: class {
        observe() {}
        disconnect() {
          disconnected++;
        }
      },
    },
  );
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
  });
  const host = document.getElementById("floor");
  const controller = createFloorRenderer(host, {
    onAgent() {},
    onProject() {},
    onFailure() {},
  });
  const data = snapshot();
  const props = {
    snapshot: data,
    projects: data.projects,
    selected: "",
    animate: true,
    events: [],
  };
  controller.update(props);
  pending(0);
  const actors = [];
  renderScene.traverse((object) => {
    if (object.userData.agent) actors.push(object);
    if (object.geometry)
      object.geometry.addEventListener("dispose", () => geometriesDisposed++);
  });
  assert.equal(actors.length, 2);
  const writer = actors.find((actor) => actor.userData.agent === "a");
  const desk = writer.position.clone();
  controller.update({
    ...props,
    events: [{ ...data.events[0], id: "claim", action: "AGENT_CLAIM" }],
  });
  for (let t = 100; t <= 2500; t += 100) pending(t);
  assert.ok(
    writer.position.distanceTo(desk) > 1,
    "confirmed claim walks to the board",
  );
  for (let t = 2600; t <= 11000; t += 100) pending(t);
  assert.ok(writer.position.distanceTo(desk) < 0.01, "returns to the laptop");
  controller.update({
    ...props,
    events: [{ ...data.events[0], id: "claim", action: "AGENT_CLAIM" }],
  });
  for (let t = 11100; t <= 12000; t += 100) pending(t);
  assert.ok(
    writer.position.distanceTo(desk) < 0.01,
    "same event never replays",
  );
  controller.update({
    ...props,
    animate: false,
    events: [{ ...data.events[0], id: "claim-2", action: "AGENT_CLAIM" }],
  });
  for (let t = 12100; t <= 13000; t += 100) pending(t);
  assert.ok(
    writer.position.distanceTo(desk) < 0.01,
    "reduced motion remains seated",
  );
  controller.dispose();
  controller.dispose();
  assert.equal(host.querySelectorAll("canvas").length, 0);
  assert.equal(disposed, 2);
  assert.equal(disconnected, 1);
  assert.ok(cancelled > 0);
  assert.ok(geometriesDisposed > 0);
  dom.window.close();
});

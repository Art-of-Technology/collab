import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { agentReport, floorActorKey } from "@/lib/agent-floor-model";
import type { FloorTask } from "@/lib/agent-floor-model";
import type { SceneProps } from "./FloorScene";

type Joint = { top: THREE.Group; bottom: THREE.Group };
type Actor = {
  id: string;
  projectId: string;
  root: THREE.Group;
  hips: THREE.Group;
  legs: Joint[];
  arms: Joint[];
  desk: THREE.Vector3;
  card: THREE.Object3D;
  cardLabel: string;
};
/** A text label drawn as HTML over the canvas, so it stays sharp at any zoom. */
type Tag = { element: HTMLElement; anchor: THREE.Object3D; lift: number };
const palette = [0x6ea8dc, 0xa9b86a, 0xc487b8, 0xe0a063, 0x62b8ae, 0xa890e0];
const roomAccents = ["#4f9de8", "#f08c3a", "#8ac24a", "#b07cf2", "#ef6b6b", "#2fbfae"];
const stateColors: Record<string, string> = {
  open: "#c2740a",
  claimed: "#15803d",
  completed: "#64748b",
  superseded: "#94a3b8",
};
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
/** Texture pixels per world unit: text is drawn at the size of the surface it sits on. */
const PX_PER_UNIT = 256;
const overlayCss = `
.floor-overlay{position:absolute;inset:0;overflow:hidden;pointer-events:none;font:500 12px/1.2 ${FONT}}
.floor-overlay>*{position:absolute;left:0;top:0;white-space:nowrap;will-change:transform}
.floor-room{pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(9,14,23,.86);color:#f8fafc;font-size:13px;font-weight:600}
.floor-room i{width:9px;height:9px;border-radius:3px;background:var(--accent)}
.floor-room span{font-weight:500;font-size:12px;color:#cbd5e1}
.floor-room em{font-style:normal;font-weight:600}
.floor-agent{pointer-events:auto;cursor:pointer;display:grid;grid-template-columns:auto auto;align-items:center;column-gap:5px;padding:3px 8px 3px 6px;border-radius:9px;background:rgba(248,250,252,.96);color:#0f172a;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.floor-agent i{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.floor-agent b{grid-column:2;font-weight:700;font-size:10.5px;color:#166534}
.floor-agent[data-selected]{outline:2px solid #38bdf8}
.floor-agent:hover{z-index:2}
.floor-overlay[data-zoom="far"] .floor-agent:not([data-selected]):not(:hover){display:block;padding:3px;border-radius:50%;line-height:0}
.floor-overlay[data-zoom="far"] .floor-agent:not([data-selected]):not(:hover) i{display:block}
.floor-overlay[data-zoom="far"] .floor-agent:not([data-selected]):not(:hover)>:not(i){display:none}
`;
/** The part of a name that tells the agents of one room apart: what follows the prefix they all share. */
export function shortAgentNames(names: string[]) {
  let shared = 0;
  if (names.length > 1) {
    const parts = names.map((name) => name.split("-"));
    while (
      shared < Math.min(...parts.map((p) => p.length)) - 1 &&
      parts.every((p) => p[shared] === parts[0][shared])
    )
      shared++;
  }
  return names.map((name) => {
    const rest = name.split("-").slice(shared).join("-");
    return rest.length > 16 ? `${rest.slice(0, 15)}…` : rest;
  });
}
function identityColor(id: string) {
  return palette[
    Array.from(id).reduce((sum, c) => sum + c.charCodeAt(0), 0) % palette.length
  ];
}
/** Explicit disposal is required because the snapshot can rebuild rooms and WebGL owns GPU memory. */
function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material)
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
  });
  textures.forEach((x) => x.dispose());
  materials.forEach((x) => x.dispose());
  geometries.forEach((x) => x.dispose());
  root.clear();
}
export function createFloorRenderer(
  host: HTMLElement,
  callbacks: {
    onAgent: (id: string) => void;
    onProject: (id: string) => void;
    onFailure: () => void;
  },
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  host.prepend(renderer.domElement);
  const overlay = document.createElement("div");
  overlay.className = "floor-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const overlayStyle = document.createElement("style");
  overlayStyle.textContent = overlayCss;
  renderer.domElement.after(overlayStyle, overlay);
  renderer.domElement.setAttribute(
    "aria-label",
    "Organisation floor illustration. Use the project and agent buttons for keyboard navigation.",
  );
  renderer.domElement.setAttribute("role", "img");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1622);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 260);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 6;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.47;
  scene.add(new THREE.HemisphereLight(0xe6efff, 0x2a3340, 1.7));
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
  sun.position.set(-16, 34, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  scene.add(sun);
  const content = new THREE.Group();
  scene.add(content);
  let actors: Actor[] = [],
    state: SceneProps | undefined,
    layout = "",
    disposed = false,
    frameId = 0,
    last = 0,
    tags: Tag[] = [],
    framed = false;
  camera.position.set(4, 30, 34);
  const boardCards = new Map<string, THREE.Object3D>();
  const material = (color: number) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const box = (
    parent: THREE.Object3D,
    size: number[],
    position: number[],
    color: number,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...(size as [number, number, number])),
      material(color),
    );
    mesh.position.set(...(position as [number, number, number]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const sphere = (
    parent: THREE.Object3D,
    r: number,
    position: number[],
    color: number,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 10),
      material(color),
    );
    mesh.position.set(...(position as [number, number, number]));
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  /** A texture drawn at the size of the surface that carries it, so text is neither stretched nor blurred. */
  function drawnTexture(widthUnits: number, heightUnits: number, draw: Draw) {
    const scale = Math.min(PX_PER_UNIT, 2048 / Math.max(widthUnits, heightUnits));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(widthUnits * scale));
    canvas.height = Math.max(2, Math.round(heightUnits * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.textBaseline = "middle";
    draw(ctx, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  }
  const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  };
  /** The text cut to a width, ending in an ellipsis when it does not fit. */
  function fitted(ctx: CanvasRenderingContext2D, text: string, width: number) {
    if (ctx.measureText(text).width <= width) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  }
  /** Sets the largest font up to `size` at which the text fits, and returns the text; it is cut only below 40% of that size. */
  function shrunk(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, width: number) {
    const px = Math.floor(size);
    ctx.font = `${weight} ${px}px ${FONT}`;
    const measured = ctx.measureText(text).width;
    if (measured > width)
      ctx.font = `${weight} ${Math.floor(Math.max(px * 0.4, (px * width) / measured))}px ${FONT}`;
    return fitted(ctx, text, width);
  }
  /** Up to `lines` lines of whole words; the last line is cut when the text is longer. */
  function wrapped(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number) {
    const out: string[] = [];
    let line = "";
    const words = text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(next).width <= width || !line) line = next;
      else if (out.length === lines - 1) {
        line = `${line} ${words.slice(i).join(" ")}`;
        break;
      } else {
        out.push(fitted(ctx, line, width));
        line = words[i];
      }
    }
    out.push(fitted(ctx, line, width));
    return out;
  }
  function panel(
    parent: THREE.Object3D,
    width: number,
    height: number,
    position: number[],
    draw: Draw,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: drawnTexture(width, height, draw),
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(...(position as [number, number, number]));
    parent.add(mesh);
    return mesh;
  }
  const BOARD = "#f4f5f1";
  /** A task as it hangs on the board: its key, its handoff state, and two lines of the title. */
  const taskCard = (task: FloorTask): Draw => (ctx, w, h) => {
    const state = stateColors[task.handoffState] || stateColors.completed;
    ctx.fillStyle = BOARD;
    ctx.fillRect(0, 0, w, h);
    rounded(ctx, 3, 3, w - 6, h - 6, h * 0.1);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#c9d1d9";
    ctx.stroke();
    ctx.fillStyle = state;
    ctx.fillRect(3, h * 0.12, h * 0.07, h * 0.76);
    const left = h * 0.16, room = w - h * 0.1 - left;
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    // A key is what people look for, so in a narrow column its font shrinks before it is cut.
    ctx.fillText(shrunk(ctx, task.issueKey, 700, h * 0.26, room), left, h * 0.2);
    ctx.fillStyle = state;
    ctx.font = `700 ${Math.round(h * 0.16)}px ${FONT}`;
    ctx.fillText(fitted(ctx, task.handoffState, room), left, h * 0.43);
    ctx.fillStyle = "#1e293b";
    ctx.font = `500 ${Math.round(h * 0.2)}px ${FONT}`;
    wrapped(ctx, task.title, room, 2).forEach((line, index) =>
      ctx.fillText(line, left, h * (0.64 + index * 0.22)),
    );
  };
  /** A column heading: the status and how many handoffs it holds. */
  const columnHead = (status: string, count: number): Draw => (ctx, w, h) => {
    ctx.fillStyle = BOARD;
    ctx.fillRect(0, 0, w, h);
    rounded(ctx, 3, h * 0.1, w - 6, h * 0.8, h * 0.18);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = `700 ${Math.round(h * 0.46)}px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(String(count), w - h * 0.3, h * 0.52);
    const countWidth = ctx.measureText(String(count)).width;
    ctx.textAlign = "left";
    ctx.fillText(shrunk(ctx, status, 600, h * 0.38, w - h * 0.75 - countWidth), h * 0.3, h * 0.52);
  };
  const note = (text: string): Draw => (ctx, w, h) => {
    ctx.fillStyle = BOARD;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    ctx.fillText(shrunk(ctx, text, 500, h * 0.5, w * 0.94), w / 2, h / 2);
  };
  /** The card an agent carries to the board: the issue key and the status it moves to. */
  const carriedCard = (issueKey: string, status: string): Draw => (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(shrunk(ctx, issueKey, 700, h * 0.34, w * 0.92), w / 2, h * 0.33);
    ctx.fillStyle = "#475569";
    ctx.font = `500 ${Math.round(h * 0.24)}px ${FONT}`;
    ctx.fillText(fitted(ctx, status, w * 0.92), w / 2, h * 0.7);
  };
  /** Adds an HTML label that follows a point of the scene. */
  function tag(element: HTMLElement, anchor: THREE.Object3D, lift: number) {
    overlay.append(element);
    tags.push({ element, anchor, lift });
    return element;
  }
  function desk(room: THREE.Group, x: number, z: number, working: boolean) {
    box(room, [1.8, 0.12, 1], [x, 1.04, z], 0xc9a273);
    for (const dx of [-0.75, 0.75])
      for (const dz of [-0.38, 0.38])
        box(room, [0.07, 1, 0.07], [x + dx, 0.5, z + dz], 0x2b3644);
    box(room, [0.8, 0.04, 0.52], [x, 1.12, z], 0x9aa7b4);
    box(room, [0.68, 0.012, 0.3], [x, 1.146, z + 0.06], 0x2b3644);
    box(room, [0.8, 0.52, 0.04], [x, 1.39, z - 0.23], 0x2b3644);
    // The screen is lit while this agent holds claimed work, so activity shows from across the floor.
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.43),
      new THREE.MeshBasicMaterial({ color: working ? 0x7df0d2 : 0x3d4d5f }),
    );
    screen.position.set(x, 1.4, z - 0.205);
    room.add(screen);
    box(room, [0.65, 0.12, 0.6], [x, 0.66, z + 0.83], 0x3f5068);
    box(room, [0.65, 0.52, 0.1], [x, 0.97, z + 1.12], 0x3f5068);
    box(room, [0.1, 0.6, 0.1], [x, 0.3, z + 0.84], 0x2b3644);
  }
  function person(
    room: THREE.Group,
    id: string,
    name: string,
    label: string,
    held: string,
    projectId: string,
    x: number,
    z: number,
    lift: number,
  ): Actor {
    const color = identityColor(id),
      root = new THREE.Group();
    room.add(root);
    root.userData.agent = id;
    const hips = new THREE.Group();
    root.add(hips);
    box(hips, [0.54, 0.63, 0.32], [0, 0.3, 0], color);
    sphere(hips, 0.22, [0, 0.88, 0], 0xcfa783);
    sphere(hips, 0.224, [0, 0.97, -0.03], 0x383940).scale.y = 0.65;
    box(hips, [0.13, 0.16, 0.13], [0, 0.66, 0], 0xcfa783);
    for (const x of [-0.075, 0.075])
      sphere(hips, 0.025, [x, 0.9, 0.199], 0x25323e);
    const legs: Joint[] = [],
      arms: Joint[] = [];
    for (const sign of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sign * 0.15, -0.12, 0);
      hips.add(hip);
      box(hip, [0.17, 0.43, 0.18], [0, -0.2, 0], 0x46546a);
      const knee = new THREE.Group();
      knee.position.y = -0.41;
      hip.add(knee);
      box(knee, [0.15, 0.4, 0.16], [0, -0.2, 0], 0x46546a);
      box(knee, [0.18, 0.12, 0.3], [0, -0.43, 0.06], 0x26323f);
      legs.push({ top: hip, bottom: knee });
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * 0.34, 0.5, 0);
      hips.add(shoulder);
      box(shoulder, [0.16, 0.33, 0.17], [0, -0.15, 0], color);
      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);
      box(elbow, [0.13, 0.29, 0.13], [0, -0.14, 0], 0xcfa783);
      sphere(elbow, 0.08, [0, -0.31, 0], 0xcfa783);
      arms.push({ top: shoulder, bottom: elbow });
    }
    const nameTag = document.createElement("div");
    nameTag.className = "floor-agent";
    nameTag.title = name;
    nameTag.dataset.agent = id;
    nameTag.style.setProperty("--accent", held ? stateColors.claimed : "#94a3b8");
    const shown = document.createElement("span");
    shown.textContent = label;
    nameTag.append(document.createElement("i"), shown);
    if (held) {
      const key = document.createElement("b");
      key.textContent = held;
      nameTag.append(key);
    }
    nameTag.addEventListener("click", () => callbacks.onAgent(id));
    tag(nameTag, root, lift);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.48, 24),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    root.add(ring);
    const card = panel(root, 0.7, 0.42, [0, 1.25, 0.42], note("Task"));
    card.visible = false;
    root.position.set(x, 0, z + 0.83);
    root.rotation.y = Math.PI;
    return {
      id,
      projectId,
      root,
      hips,
      legs,
      arms,
      desk: root.position.clone(),
      card,
      cardLabel: "",
    };
  }
  /** The middle of a task's column on the board, where an agent walks to. */
  function column(task: FloorTask, projectId: string) {
    const found = boardColumns(projectId).find((c) => c.status === task.status);
    return found ? found.x + (found.span * found.width) / 2 : 0;
  }
  /**
   * The board's columns, left to right: the statuses that hold a handoff, in the project's order.
   * An empty status would only narrow the others. Cards are at most a third of the board wide,
   * so with fewer than three statuses the fullest one spans the spare width with more cards.
   */
  function boardColumns(projectId: string) {
    const tasks = state?.snapshot.tasks.filter((t) => t.projectId === projectId) || [];
    const order = state?.projects.find((p) => p.id === projectId)?.statuses.map((s) => s.name) || [];
    const used = new Set(tasks.map((t) => t.status));
    const statuses = Array.from(new Set([...order.filter((name) => used.has(name)), ...used]));
    const count = (status: string) => tasks.filter((t) => t.status === status).length;
    const fullest = statuses.reduce((a, b) => (count(b) > count(a) ? b : a), statuses[0]);
    const width = 9.6 / Math.max(3, statuses.length);
    let x = -4.8;
    return statuses.map((status) => {
      const span = status === fullest ? 1 + Math.max(0, 3 - statuses.length) : 1;
      x += span * width;
      return { status, x: x - span * width, span, width };
    });
  }
  function rebuild() {
    disposeTree(content);
    tags.forEach((item) => item.element.remove());
    tags = [];
    actors = [];
    boardCards.clear();
    if (!state) return;
    const { projects, snapshot } = state;
    projects.forEach((project, index) => {
      const accent = /^#[0-9a-f]{6}$/i.test(project.color || "")
        ? project.color!
        : roomAccents[index % roomAccents.length];
      const room = new THREE.Group();
      room.position.set(
        ((index % 3) - Math.min(2, projects.length - 1) / 2) * 14,
        0,
        Math.floor(index / 3) * 17 - (projects.length > 3 ? 8.5 : 0),
      );
      content.add(room);
      const floor = box(room, [12, 0.17, 11], [0, -0.08, 0.5], 0x2c3746);
      floor.userData.project = project.id;
      floor.castShadow = false;
      box(room, [12, 0.05, 0.22], [0, 0.02, 5.89], Number(`0x${accent.slice(1)}`)).castShadow = false;
      const wall = box(room, [12, 5.1, 0.16], [0, 2.47, -4.9], 0x4a5a6e);
      wall.userData.project = project.id;
      box(room, [12, 0.22, 0.2], [0, 5.13, -4.9], Number(`0x${accent.slice(1)}`));
      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(10.5, 4.1, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xf4f5f1 }),
      );
      backing.position.set(0, 2.65, -4.76);
      room.add(backing);
      const tasks = snapshot.tasks.filter((t) => t.projectId === project.id);
      const columns = boardColumns(project.id);
      for (const { status, x, span, width } of columns) {
        const column = tasks.filter((t) => t.status === status);
        const middle = x + (span * width) / 2;
        panel(room, span * width - 0.1, 0.5, [middle, 4.32, -4.7], columnHead(status, column.length));
        // Three cards down, then the next card column of the span.
        column.slice(0, 3 * span).forEach((task, i) => {
          const card = panel(
            room,
            width - 0.14,
            0.9,
            [x + (Math.floor(i / 3) + 0.5) * width, 3.5 - (i % 3) * 0.98, -4.69],
            taskCard(task),
          );
          card.userData.task = task.id;
          boardCards.set(task.id, card);
        });
        if (column.length > 3 * span)
          panel(
            room,
            span * width - 0.14,
            0.38,
            [middle, 0.84, -4.69],
            note(`+${column.length - 3 * span} more in the task list`),
          );
      }
      if (!columns.length)
        panel(room, 8, 1, [0, 2.7, -4.69], note("No agent handoffs in this snapshot"));
      const ids = new Set(
        tasks
          .flatMap((t) => [t.claimedById, t.senderId, ...t.recipientIds])
          .filter(Boolean),
      );
      const held = (agentId: string) =>
        tasks.find((t) => t.claimedById === agentId && t.handoffState === "claimed");
      const roster = snapshot.agents
        .filter((a) => ids.has(a.id))
        .sort((a, b) => Number(Boolean(held(b.id))) - Number(Boolean(held(a.id))));
      const seated = roster.slice(0, 8);
      const labels = shortAgentNames(seated.map((agent) => agent.name));
      seated.forEach((agent, seat) => {
        const x = -4.05 + (seat % 4) * 2.7,
          z = 1 + Math.floor(seat / 4) * 2.7;
        const work = held(agent.id);
        desk(room, x, z, Boolean(work));
        actors.push(
          person(room, agent.id, agent.name, labels[seat], work?.issueKey || "", project.id, x, z, 2.2 + (seat % 2) * 0.5),
        );
      });
      const leaf = sphere(room, 0.55, [5, 0.85, -3.5], 0x6fa873);
      leaf.scale.y = 1.5;
      box(room, [0.55, 0.5, 0.55], [5, 0.25, -3.5], 0xb9b4a4);
      // The room's name and what is on its board, as HTML so it reads from the overview.
      const sign = document.createElement("div");
      sign.className = "floor-room";
      sign.dataset.project = project.id;
      sign.style.setProperty("--accent", accent);
      const claimed = tasks.filter((t) => t.handoffState === "claimed").length,
        open = tasks.filter((t) => t.handoffState === "open").length;
      const summary = document.createElement("span");
      if (!tasks.length) summary.textContent = "no handoffs";
      else if (!claimed && !open) summary.textContent = "nothing open";
      else
        for (const [count, word, color] of (
          [
            [claimed, "claimed", "#4ade80"],
            [open, "open", "#fbbf24"],
          ] as const
        ).filter(([count]) => count)) {
          const number = document.createElement("em");
          number.textContent = `${count} `;
          number.style.color = color;
          summary.append(number, `${word} `);
        }
      sign.append(document.createElement("i"), project.name, summary);
      sign.addEventListener("click", () => callbacks.onProject(project.id));
      const signAnchor = new THREE.Object3D();
      signAnchor.position.set(0, 5.3, -4.9);
      room.add(signAnchor);
      tag(sign, signAnchor, 0);
    });
  }
  /** Places the camera so the rooms fill the view, looking at their boards from the front. */
  function frameRooms() {
    const bounds = new THREE.Box3().setFromObject(content);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const oneRow = (state?.projects.length || 0) <= 3;
    const direction = new THREE.Vector3(0.14, oneRow ? 0.62 : 1.2, 1).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).sub(center);
          const depth = corner.dot(direction);
          distance = Math.max(
            distance,
            depth + Math.abs(corner.dot(up)) / tan,
            depth + Math.abs(corner.dot(right)) / (tan * camera.aspect),
          );
        }
    distance *= oneRow ? 1.02 : 1.06;
    controls.maxDistance = Math.max(120, distance);
    camera.far = Math.max(260, distance + bounds.getSize(new THREE.Vector3()).length());
    camera.updateProjectionMatrix();
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    controls.update();
  }
  function update(next: SceneProps) {
    if (disposed) return;
    const prior = state;
    const oldPositions = new Map(
      (prior?.snapshot.tasks || []).map((task) => [
        task.id,
        column(task, task.projectId),
      ]),
    );
    for (const queue of next.playback.queues.values())
      for (const animation of queue)
        animation.origin ??= oldPositions.get(animation.event.taskId);
    state = next;
    const nextLayout = next.projects.map((p) => p.id).join("|");
    // Rebuild only when data/rooms change; camera and input controls survive refreshes.
    if (prior?.snapshot !== next.snapshot || layout !== nextLayout) rebuild();
    if (layout !== nextLayout) {
      layout = nextLayout;
      frameRooms();
    }
    for (const item of tags)
      if (item.element.dataset.agent)
        item.element.toggleAttribute("data-selected", item.element.dataset.agent === next.selected);
    if (!next.animate) {
      next.playback.queues.clear();
      boardCards.forEach((card) => {
        card.visible = true;
      });
    }
    for (const actor of actors) {
      if (!next.animate) {
        actor.card.visible = false;
        actor.root.position.copy(actor.desk);
        actor.root.rotation.y = Math.PI;
        pose(actor, 0, false, true, false, false);
      }
      actor.root.scale.setScalar(next.selected === actor.id ? 1.08 : 1);
    }
  }
  function pose(
    actor: Actor,
    time: number,
    moving: boolean,
    seated: boolean,
    typing: boolean,
    carrying: boolean,
  ) {
    actor.hips.position.y = seated
      ? 0.68
      : 0.98 + (moving ? Math.abs(Math.sin(time * 9)) * 0.035 : 0);
    actor.legs.forEach((leg, i) => {
      const swing = Math.sin(time * 9 + i * Math.PI) * 0.55;
      leg.top.rotation.x = seated ? -Math.PI / 2 : moving ? swing : 0;
      leg.bottom.rotation.x = seated
        ? Math.PI / 2
        : moving
          ? Math.max(0, -swing) * 0.65
          : 0;
    });
    actor.arms.forEach((arm, i) => {
      arm.top.rotation.x = carrying
        ? -1.35
        : typing
          ? -0.98
          : moving
            ? -Math.sin(time * 9 + i * Math.PI) * 0.38
            : 0;
      arm.bottom.rotation.x = carrying
        ? -0.25
        : typing
          ? -0.55 + Math.sin(time * 19 + i * 2) * 0.12
          : seated
            ? -0.45
            : 0;
    });
  }
  function animateActor(actor: Actor, dt: number, time: number) {
    if (!state) return;
    const key = floorActorKey(actor.projectId, actor.id);
    const queue = state.playback.queues.get(key);
    const animation = queue?.[0];
    const event = animation?.event;
    const task =
      event && state.snapshot.tasks.find((t) => t.id === event.taskId);
    let moving = false,
      carrying = false;
    if (task && animation && state.animate) {
      const label = JSON.stringify([task.issueKey, task.status]);
      if (actor.cardLabel !== label) {
        const card = actor.card as THREE.Mesh<
          THREE.PlaneGeometry, THREE.MeshBasicMaterial
        >;
        card.material.map?.dispose();
        card.material.map = drawnTexture(0.7, 0.42, carriedCard(task.issueKey, task.status));
        card.material.needsUpdate = true;
        actor.cardLabel = label;
      }
      animation.elapsed += dt;
      const board = new THREE.Vector3(column(task, actor.projectId), 0, -3.05);
      const aisle = new THREE.Vector3(actor.desk.x, 0, -0.1);
      const origin = new THREE.Vector3(
        animation.origin ?? board.x,
        0,
        board.z,
      );
      const points = [actor.desk, aisle, origin, board, aisle, actor.desk];
      const stage = Math.min(4, Math.floor(animation.elapsed / 2));
      const fraction = Math.min(1, (animation.elapsed - stage * 2) / 2);
      actor.root.position.lerpVectors(
        points[stage],
        points[stage + 1],
        fraction,
      );
      const delta = points[stage + 1].clone().sub(points[stage]);
      moving = delta.lengthSq() > 0.01;
      actor.root.rotation.y = moving ? Math.atan2(delta.x, delta.z) : Math.PI;
      carrying = stage === 2;
      actor.card.visible = carrying;
      const boardCard = boardCards.get(task.id);
      if (boardCard && carrying) boardCard.visible = false;
      if (animation.elapsed >= 10) {
        queue!.shift();
        if (!queue!.length) state.playback.queues.delete(key);
        actor.card.visible = false;
        actor.root.position.copy(actor.desk);
      }
    } else {
      actor.root.position.copy(actor.desk);
      actor.root.rotation.y = Math.PI;
      actor.card.visible = false;
    }
    const seated = !task || !queue?.length || !state.animate;
    const typing =
      seated &&
      state.animate &&
      agentReport(state.snapshot, actor.id, Date.now(), actor.projectId).typing;
    pose(actor, time, moving, seated, typing, carrying);
  }
  function frame(time: number) {
    if (disposed) return;
    const dt = Math.max(0, Math.min((time - last) / 1000, 0.1));
    last = time;
    boardCards.forEach((card) => {
      card.visible = true;
    });
    actors.forEach((actor) => animateActor(actor, dt, time / 1000));
    controls.update();
    renderer.render(scene, camera);
    placeTags();
    frameId = requestAnimationFrame(frame);
  }
  const point = new THREE.Vector3();
  /** Moves each HTML label to where its anchor appears on screen. Names collapse to a dot when the floor is small. */
  function placeTags() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    const pixelsPerUnit =
      height /
      (2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    overlay.dataset.zoom = pixelsPerUnit < 32 ? "far" : "near";
    for (const item of tags) {
      item.anchor.getWorldPosition(point);
      point.y += item.lift;
      point.project(camera);
      const visible = point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
      item.element.style.display = visible ? "" : "none";
      if (visible)
        item.element.style.transform = `translate(-50%,-100%) translate(${((point.x + 1) / 2) * width}px,${((1 - point.y) / 2) * height}px)`;
    }
  }
  const visibility = () => {
    cancelAnimationFrame(frameId);
    if (!document.hidden && !disposed) {
      last = performance.now();
      frameId = requestAnimationFrame(frame);
    }
  };
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // The first size, and any later one before the person has moved the camera, re-frames the rooms.
    if (!framed) frameRooms();
  });
  controls.addEventListener("start", () => {
    framed = true;
  });
  resize.observe(host);
  let start: [number, number] | undefined;
  const down = (event: PointerEvent) => {
    start = [event.clientX, event.clientY];
  };
  const up = (event: PointerEvent) => {
    if (
      !start ||
      Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5
    )
      return;
    const rect = renderer.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    for (const hit of ray.intersectObjects(content.children, true))
      for (
        let object: THREE.Object3D | null = hit.object;
        object;
        object = object.parent
      ) {
        if (object.userData.agent) {
          callbacks.onAgent(object.userData.agent);
          return;
        }
        if (object.userData.project) {
          callbacks.onProject(object.userData.project);
          return;
        }
      }
  };
  const lost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frameId);
    callbacks.onFailure();
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", visibility);
  visibility();
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      resize.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      controls.dispose();
      disposeTree(content);
      overlay.remove();
      overlayStyle.remove();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

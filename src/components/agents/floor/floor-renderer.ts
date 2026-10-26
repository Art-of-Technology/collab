import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { agentReport } from "@/lib/agent-floor-model";
import type { FloorTask, FloorEvent } from "@/lib/agent-floor-model";
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
  queue: FloorEvent[];
  elapsed: number;
};
const palette = [0x8eb9dc, 0xb2bb8d, 0xc49aba, 0xd1a67c, 0x8bbeb8, 0xb2a2d3];
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
  renderer.toneMappingExposure = 1.4;
  host.prepend(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Organisation floor illustration. Use the project and agent buttons for keyboard navigation.",
  );
  renderer.domElement.setAttribute("role", "img");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17212e);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 7;
  controls.maxDistance = 95;
  controls.maxPolarAngle = Math.PI * 0.47;
  scene.add(new THREE.HemisphereLight(0xdceaff, 0x5c6e68, 2.8));
  const sun = new THREE.DirectionalLight(0xffefdc, 4);
  sun.position.set(-12, 32, 18);
  scene.add(sun);
  const content = new THREE.Group();
  scene.add(content);
  let actors: Actor[] = [],
    state: SceneProps | undefined,
    layout = "",
    disposed = false,
    frameId = 0,
    last = 0;
  camera.position.set(29, 34, 39);
  const seen = new Set<string>();
  const origins = new Map<string, number>();
  const boardCards = new Map<string, THREE.Object3D>();
  const material = (color: number) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
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
      new THREE.SphereGeometry(r, 12, 8),
      material(color),
    );
    mesh.position.set(...(position as [number, number, number]));
    parent.add(mesh);
    return mesh;
  };
  function textTexture(
    lines: string[],
    background = "#e5e9e5",
    width = 1024,
    height = 256,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#293c50";
    ctx.font = "500 32px system-ui";
    lines.forEach((line, index) =>
      ctx.fillText(line.slice(0, 70), 24, 48 + index * 42, width - 48),
    );
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function panel(
    parent: THREE.Object3D,
    width: number,
    height: number,
    position: number[],
    lines: string[],
    background?: string,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: textTexture(lines, background),
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(...(position as [number, number, number]));
    parent.add(mesh);
    return mesh;
  }
  function desk(room: THREE.Group, x: number, z: number) {
    box(room, [1.8, 0.12, 1], [x, 1.04, z], 0xbca98d);
    for (const dx of [-0.75, 0.75])
      for (const dz of [-0.38, 0.38])
        box(room, [0.07, 1, 0.07], [x + dx, 0.5, z + dz], 0x344656);
    box(room, [0.8, 0.04, 0.52], [x, 1.12, z], 0x8796a5);
    for (let row = 0; row < 3; row++)
      for (let key = 0; key < 8; key++)
        box(
          room,
          [0.065, 0.007, 0.065],
          [x - 0.3 + key * 0.085, 1.147, z + row * 0.09],
          0x344656,
        );
    box(room, [0.8, 0.52, 0.04], [x, 1.39, z - 0.23], 0x344656);
    panel(
      room,
      0.72,
      0.43,
      [x, 1.4, z - 0.205],
      ["> collab", "  work / reports", "  _"],
      "#9cc9c1",
    );
    box(room, [0.65, 0.12, 0.6], [x, 0.66, z + 0.83], 0x495c70);
    box(room, [0.65, 0.52, 0.1], [x, 0.97, z + 1.12], 0x495c70);
    box(room, [0.1, 0.6, 0.1], [x, 0.3, z + 0.84], 0x344656);
  }
  function person(
    room: THREE.Group,
    id: string,
    name: string,
    projectId: string,
    x: number,
    z: number,
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
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textTexture([name], "#d7e5ee", 768, 90),
        depthTest: false,
      }),
    );
    label.scale.set(2.1, 0.25, 1);
    label.position.y = 2;
    root.add(label);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.48, 24),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    root.add(ring);
    const card = panel(root, 0.6, 0.4, [0, 1.25, 0.42], ["Task"], "#c6dcee");
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
      queue: [],
      elapsed: 0,
    };
  }
  function column(task: FloorTask, projectId: string) {
    const statuses = boardStatuses(projectId);
    return (
      -4.8 +
      (Math.max(0, statuses.indexOf(task.status)) + 0.5) *
        (9.6 / Math.max(1, statuses.length))
    );
  }
  function boardStatuses(projectId: string) {
    const project = state?.projects.find((p) => p.id === projectId);
    return Array.from(
      new Set([
        ...(project?.statuses.map((s) => s.name) || []),
        ...(state?.snapshot.tasks
          .filter((t) => t.projectId === projectId)
          .map((t) => t.status) || []),
      ]),
    );
  }
  function rebuild() {
    disposeTree(content);
    actors = [];
    boardCards.clear();
    if (!state) return;
    const { projects, snapshot } = state;
    projects.forEach((project, index) => {
      const room = new THREE.Group();
      room.position.set(
        ((index % 3) - Math.min(2, projects.length - 1) / 2) * 14,
        0,
        Math.floor(index / 3) * 14 - (projects.length > 3 ? 7 : 0),
      );
      content.add(room);
      const floor = box(room, [12, 0.17, 11], [0, -0.08, 0.5], 0x586974);
      floor.userData.project = project.id;
      box(room, [12, 3.6, 0.16], [0, 1.72, -4.9], 0x657783);
      const title = panel(
        room,
        5,
        0.6,
        [0, 3.8, -4.65],
        [project.name],
        "#bed0d8",
      );
      title.userData.project = project.id;
      box(room, [10.5, 2.8, 0.12], [0, 2, -4.73], 0xe7e8df);
      const statuses = boardStatuses(project.id);
      statuses.forEach((status, i) => {
        const width = 9.6 / statuses.length,
          x = -4.8 + (i + 0.5) * width;
        panel(room, width - 0.06, 0.36, [x, 3, -4.64], [status], "#c8d9e4");
        const tasks = snapshot.tasks.filter(
          (t) => t.projectId === project.id && t.status === status,
        );
        tasks.slice(0, 3).forEach((task, row) => {
          const card = panel(
            room,
            width - 0.12,
            0.49,
            [x, 2.46 - row * 0.57, -4.63],
            [task.issueKey, task.title, task.handoffState],
            "#d9e5ec",
          );
          card.userData.task = task.id;
          boardCards.set(task.id, card);
        });
        if (tasks.length > 3)
          panel(
            room,
            width - 0.06,
            0.28,
            [x, 0.65, -4.62],
            [`+${tasks.length - 3} in task list`],
          );
      });
      if (!statuses.length)
        panel(
          room,
          8,
          1,
          [0, 2.2, -4.62],
          ["No agent handoffs in this snapshot"],
        );
      const tasks = snapshot.tasks.filter((t) => t.projectId === project.id);
      const ids = new Set(
        tasks
          .flatMap((t) => [t.claimedById, t.senderId, ...t.recipientIds])
          .filter(Boolean),
      );
      const roster = snapshot.agents
        .filter((a) => ids.has(a.id))
        .sort(
          (a, b) =>
            Number(
              tasks.some(
                (t) => t.claimedById === b.id && t.handoffState === "claimed",
              ),
            ) -
            Number(
              tasks.some(
                (t) => t.claimedById === a.id && t.handoffState === "claimed",
              ),
            ),
        );
      roster.slice(0, 8).forEach((agent, seat) => {
        const x = -4.05 + (seat % 4) * 2.7,
          z = 1 + Math.floor(seat / 4) * 2.7;
        desk(room, x, z);
        actors.push(person(room, agent.id, agent.name, project.id, x, z));
      });
      const leaf = sphere(room, 0.55, [5, 0.85, -3.5], 0x85a783);
      leaf.scale.y = 1.5;
      box(room, [0.55, 0.5, 0.55], [5, 0.25, -3.5], 0xb5b7a8);
    });
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
    state = next;
    const nextLayout = next.projects.map((p) => p.id).join("|");
    // Rebuild only when data/rooms change; camera and input controls survive refreshes.
    if (prior?.snapshot !== next.snapshot || layout !== nextLayout) rebuild();
    if (layout !== nextLayout) {
      layout = nextLayout;
      camera.position.set(
        next.projects.length > 1 ? 29 : 11,
        next.projects.length > 1 ? 34 : 13,
        next.projects.length > 1 ? 39 : 16,
      );
      controls.target.set(0, 0, 0);
      controls.update();
    }
    const incoming = next.events.filter((event) => !seen.has(event.id));
    next.events.forEach((event) => seen.add(event.id));
    incoming.forEach((event) => {
      const old = oldPositions.get(event.taskId);
      if (old !== undefined) origins.set(event.id, old);
    });
    if (seen.size > 1500) {
      seen.clear();
      next.snapshot.events.forEach((event) => seen.add(event.id));
    }
    for (const actor of actors) {
      if (!next.animate) {
        actor.queue = [];
        actor.elapsed = 0;
        actor.card.visible = false;
        actor.root.position.copy(actor.desk);
      } else
        actor.queue.push(
          ...incoming
            .filter(
              (event) =>
                event.agentId === actor.id &&
                event.projectId === actor.projectId &&
                [
                  "AGENT_CLAIM",
                  "AGENT_PASSED",
                  "AGENT_COMPLETE",
                  "AGENT_RELEASE",
                ].includes(event.action),
            )
            .slice(-4),
        );
      const queuedTask = next.snapshot.tasks.find(
        (task) => task.id === actor.queue[0]?.taskId,
      );
      if (queuedTask) {
        const card = actor.card as THREE.Mesh<
          THREE.PlaneGeometry,
          THREE.MeshBasicMaterial
        >;
        card.material.map?.dispose();
        card.material.map = textTexture(
          [queuedTask.issueKey, queuedTask.status],
          "#c6dcee",
        );
        card.material.needsUpdate = true;
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
    const event = actor.queue[0];
    const task =
      event && state.snapshot.tasks.find((t) => t.id === event.taskId);
    let moving = false,
      carrying = false;
    if (task && state.animate) {
      actor.elapsed += dt;
      const board = new THREE.Vector3(column(task, actor.projectId), 0, -3.05);
      const aisle = new THREE.Vector3(actor.desk.x, 0, -0.1);
      const origin = new THREE.Vector3(
        origins.get(event.id) ?? board.x,
        0,
        board.z,
      );
      const points = [actor.desk, aisle, origin, board, aisle, actor.desk];
      const stage = Math.min(4, Math.floor(actor.elapsed / 2));
      const fraction = Math.min(1, (actor.elapsed - stage * 2) / 2);
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
      if (boardCard) boardCard.visible = !carrying;
      if (actor.elapsed >= 10) {
        if (boardCard) boardCard.visible = true;
        origins.delete(event.id);
        actor.queue.shift();
        actor.elapsed = 0;
        actor.card.visible = false;
        actor.root.position.copy(actor.desk);
      }
    } else {
      actor.queue = [];
      actor.root.position.copy(actor.desk);
      actor.root.rotation.y = Math.PI;
      actor.card.visible = false;
    }
    const seated = !task || actor.queue.length === 0 || !state.animate;
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
    actors.forEach((actor) => animateActor(actor, dt, time / 1000));
    controls.update();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
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
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

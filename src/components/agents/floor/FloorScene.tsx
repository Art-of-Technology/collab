"use client";
import { useEffect, useRef, useState } from "react";
import type {
  FloorSnapshot,
  FloorProject,
  FloorEvent,
} from "@/lib/agent-floor-model";
import { createFloorRenderer } from "./floor-renderer";

export interface SceneProps {
  snapshot: FloorSnapshot;
  projects: FloorProject[];
  selected: string;
  animate: boolean;
  events: FloorEvent[];
  onAgent: (id: string) => void;
  onProject: (id: string) => void;
}
export default function FloorScene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createFloorRenderer> | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(props);
  useEffect(() => {
    if (!host.current) return;
    try {
      renderer.current = createFloorRenderer(host.current, {
        onAgent: (id) => latest.current.onAgent(id),
        onProject: (id) => latest.current.onProject(id),
        onFailure: () => setFailed(true),
      });
      renderer.current.update(latest.current);
    } catch {
      // WebGL initialisation is an external capability check, not derived React state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    latest.current = props;
    renderer.current?.update(props);
  }, [props]);
  useEffect(() => {
    if (failed) {
      renderer.current?.dispose();
      renderer.current = null;
    }
  }, [failed]);
  return (
    <div className="relative h-[440px] md:h-[550px]" ref={host}>
      {failed && (
        <p
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-[#17212e] p-8 text-sm text-slate-200"
        >
          3D is unavailable in this browser. All projects, agents, tasks and
          events remain available in the lists below.
        </p>
      )}
      <span className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-950/80 px-3 py-2 text-xs text-slate-200">
        Up to 8 avatars per room · full roster beside the floor
      </span>
    </div>
  );
}

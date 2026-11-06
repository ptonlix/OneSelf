import { createElement, useEffect, useRef, useState, type ReactElement } from "react";

import {
  canUseWebGL,
  cancelFrame,
  frame,
  holdSkyZoom,
  now,
  readCanvas,
  readLabels,
  readReducedMotion,
} from "./dom";
import type { AdminClient } from "./http";
import {
  AUTO_TURN,
  gestureDown,
  gestureMove,
  releaseSkyGesture,
  distanceToSlider,
  shouldAutoTurn,
  sliderToDistance,
  wheelTurn,
  ZOOM_START,
  type Gesture,
} from "./nebula-model";
import { mountNebula } from "./nebula-scene";
import { NebulaHome, type NebulaSelection } from "./nebula-view";
import type { AdminGraph } from "./types";

export function NebulaScreen(props: {
  client: AdminClient;
  onFailure: (reason: unknown) => string;
}): ReactElement {
  const [graph, setGraph] = useState<AdminGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<NebulaSelection>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pageMarkdown, setPageMarkdown] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageEpoch, setPageEpoch] = useState(0);
  const [connectOrigin, setConnectOrigin] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [webgl] = useState(() => canUseWebGL());
  const reduced = readReducedMotion();
  const gesture = useRef<Gesture>(null);
  const dragged = useRef(false);
  const pinching = useRef(false);
  const [zoom, setZoom] = useState(() => distanceToSlider(ZOOM_START));
  const reportZoom = useRef<(distance: number) => void>(() => undefined);
  reportZoom.current = (distance) => {
    setZoom(distanceToSlider(distance));
  };
  const idleAt = useRef(0);
  const scene = useRef<ReturnType<typeof mountNebula> | null>(null);
  const focused = useRef(false);
  focused.current = selection !== null;

  const reload = async (): Promise<void> => {
    const next = await props.client.readGraph();
    setGraph(next);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const [next, keys, grants, origin] = await Promise.all([
          props.client.readGraph(),
          props.client.listApiKeys(),
          props.client.listOauthGrants(),
          props.client.readConnectOrigin(),
        ]);
        if (cancelled) return;
        setGraph(next);
        setConnectOrigin(origin);
        const activeKey = keys.some((key) => key.revoked_at === null);
        const approved = grants.some((grant) => grant.revoked_at === null);
        setShowConnect(!activeKey && !approved);
      } catch (reason: unknown) {
        if (!cancelled) setError(props.onFailure(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.client, props.onFailure]);

  useEffect(() => {
    if (selection === null || selection.kind !== "page") {
      setPageMarkdown(null);
      setPageLoading(false);
      return;
    }
    const slash = selection.key.indexOf("/");
    if (slash <= 0) return;
    const source = selection.key.slice(0, slash);
    const slug = selection.key.slice(slash + 1);
    let cancelled = false;
    setPageLoading(true);
    const loadPage = async (): Promise<void> => {
      try {
        const page = await props.client.readPage(source, slug);
        if (!cancelled) setPageMarkdown(page.markdown);
      } catch (reason: unknown) {
        if (!cancelled) {
          setPageMarkdown(null);
          setError(props.onFailure(reason));
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };
    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [selection, pageEpoch, props.client, props.onFailure]);

  useEffect(() => {
    if (!webgl || graph === null) return;
    const canvas = readCanvas();
    const labels = readLabels();
    if (canvas === null || labels === null) return;
    const mounted = mountNebula(canvas, labels, graph, reduced, (distance) => {
      reportZoom.current(distance);
    });
    scene.current = mounted;
    let handle = 0;
    let last = now();
    const tick = (): void => {
      // Pointer handlers stamp idle with Date.now(). The animation-frame clock is not that clock.
      const stamp = now();
      const dt = Math.min(0.05, Math.max(0, (stamp - last) / 1000));
      last = stamp;
      if (
        shouldAutoTurn({
          reduced,
          dragging: gesture.current !== null,
          idleMs: stamp - idleAt.current,
          flying: false,
        })
      ) {
        mounted.auto(AUTO_TURN * dt, focused.current);
      }
      handle = frame(tick);
    };
    if (!reduced) handle = frame(tick);
    return () => {
      cancelFrame(handle);
      mounted.dispose();
      scene.current = null;
    };
  }, [webgl, graph, reduced]);

  useEffect(
    () =>
      holdSkyZoom(
        (delta) => {
          idleAt.current = now();
          scene.current?.zoom(delta);
        },
        (active) => {
          pinching.current = active;
        },
      ),
    [],
  );

  return createElement(NebulaHome, {
    graph,
    loading,
    error,
    selection,
    onSelect: (next) => {
      if (dragged.current) return;
      setSelection(next);
    },
    onSkyDown: (x, y, target) => {
      if (isControl(target)) return;
      dragged.current = false;
      gesture.current = gestureDown(x, y);
      idleAt.current = now();
    },
    onSkyMove: (x, y) => {
      const current = gesture.current;
      if (current === null) return;
      const next = gestureMove(current, x, y);
      gesture.current = next.gesture;
      idleAt.current = now();
      if (!next.dragging) return;
      dragged.current = true;
      scene.current?.turn(next.dx, next.dy);
    },
    onSkyUp: (x, y, target, outside) => {
      const released = releaseSkyGesture({
        type: "pointerup",
        outside,
        gesture: gesture.current,
        dragged: dragged.current,
      });
      gesture.current = released.gesture;
      idleAt.current = now();
      if (!released.select || isControl(target)) return;
      const picked = scene.current?.pick(x, y) ?? null;
      if (picked !== null) setSelection(picked);
    },
    onSkyCancel: () => {
      gesture.current = releaseSkyGesture({
        type: "pointercancel",
        outside: true,
        gesture: gesture.current,
        dragged: dragged.current,
      }).gesture;
      idleAt.current = now();
    },
    onWheel: (input) => {
      if (pinching.current) return;
      idleAt.current = now();
      const action = wheelTurn(input);
      if (action.kind === "zoom") scene.current?.zoom(action.delta);
      else scene.current?.turn(action.dx, action.dy);
    },
    zoom,
    onZoom: (slider) => {
      idleAt.current = now();
      scene.current?.zoomTo(sliderToDistance(slider));
    },
    armed,
    pending,
    onArm: setArmed,
    pageMarkdown,
    pageLoading,
    onVisibility: (source, slug, visibility) => {
      setPending(true);
      void (async () => {
        try {
          await props.client.setPageVisibility(source, slug, visibility);
          setArmed(null);
          await reload();
          setPageEpoch((epoch) => epoch + 1);
        } catch (reason: unknown) {
          setError(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
    onDelete: (id) => {
      setPending(true);
      void (async () => {
        try {
          if (id.startsWith("page:")) {
            const [source, slug] = id.slice(5).split("/");
            if (source !== undefined && slug !== undefined)
              await props.client.deletePage(source, slug);
          } else {
            await props.client.deleteSource(id.slice(7));
          }
          setSelection(null);
          setArmed(null);
          await reload();
        } catch (reason: unknown) {
          setError(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
    connectOrigin,
    showConnect,
    webgl,
    reducedMotion: reduced,
  });
}

function isControl(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object" || !("closest" in target)) return false;
  const closest = target.closest;
  if (typeof closest !== "function") return false;
  return (
    closest.call(target, "input, .nebula-dock, .nebula-zoom, .nebula-mark, .nebula-menu") !== null
  );
}

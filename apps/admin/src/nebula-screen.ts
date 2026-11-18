import { createElement, useEffect, useRef, useState, type ReactElement } from "react";

import {
  applyPreviewDialog,
  bindKeyDown,
  canUseWebGL,
  cancelFrame,
  frame,
  holdSkyZoom,
  now,
  readCanvas,
  readLabels,
  readPreviewDialogNodes,
  readReducedMotion,
  releasePreviewInert,
} from "./dom";
import type { AdminClient, PageFile } from "./http";
import {
  AUTO_TURN,
  gestureDown,
  gestureMove,
  releaseSkyGesture,
  skyDragMode,
  distanceToSlider,
  shouldAutoTurn,
  wheelTurn,
  ZOOM_FAR,
  ZOOM_NEAR,
  ZOOM_START,
  type Gesture,
  type NebulaAttention,
} from "./nebula-model";
import { mountNebula } from "./nebula-scene";
import {
  homeOnEmptyDoubleClick,
  NebulaHome,
  previewDialogPlan,
  visibilityConfirmOpen,
  type NebulaSelection,
  type PageOriginals,
} from "./nebula-view";
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
  const [pageFiles, setPageFiles] = useState<PageFile[] | null>(null);
  const [pageFilesLoading, setPageFilesLoading] = useState(false);
  const [pageFilesError, setPageFilesError] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [pageEpoch, setPageEpoch] = useState(0);
  const [connectOrigin, setConnectOrigin] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [webgl] = useState(() => canUseWebGL());
  const reduced = readReducedMotion();
  const gesture = useRef<Gesture>(null);
  const dragged = useRef(false);
  const pinching = useRef(false);
  const [zoom, setZoom] = useState(() => distanceToSlider(ZOOM_START));
  const reportZoom = useRef<(distance: number, far?: number) => void>(() => undefined);
  reportZoom.current = (distance, far = ZOOM_FAR) => {
    const span = ZOOM_NEAR - far;
    setZoom(span === 0 ? 1 : Math.min(1, Math.max(0, (distance - far) / span)));
  };
  const idleAt = useRef(0);
  const scene = useRef<ReturnType<typeof mountNebula> | null>(null);
  const focused = useRef(false);
  const hoveredRef = useRef<string | null>(null);
  const selectionRef = useRef(selection);
  const [hovered, setHovered] = useState<string | null>(null);
  focused.current = selection !== null;
  selectionRef.current = selection;

  const rememberHover = (next: string | null): void => {
    if (hoveredRef.current === next) return;
    hoveredRef.current = next;
    setHovered(next);
    scene.current?.focus(attentionOf(next, selectionRef.current));
  };
  const pointAt = (x: number, y: number): void => {
    const picked = scene.current?.pick(x, y) ?? null;
    rememberHover(picked?.kind === "page" ? picked.key : null);
  };

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
      setPageFiles(null);
      setPageFilesLoading(false);
      setPageFilesError(false);
      setSelectedFileId(null);
      setOriginalOpen(false);
      return;
    }
    const slash = selection.key.indexOf("/");
    if (slash <= 0) return;
    const source = selection.key.slice(0, slash);
    const slug = selection.key.slice(slash + 1);
    let cancelled = false;
    setPageLoading(true);
    setPageFilesLoading(true);
    setPageFiles(null);
    setPageFilesError(false);
    setSelectedFileId(null);
    setOriginalOpen(false);
    const loadPage = async (): Promise<void> => {
      const [pageResult, filesResult] = await Promise.allSettled([
        props.client.readPage(source, slug),
        props.client.listPageFiles(source, slug),
      ]);
      if (cancelled) return;
      if (pageResult.status === "fulfilled") {
        setPageMarkdown(pageResult.value.markdown);
      } else {
        setPageMarkdown(null);
        setError(props.onFailure(pageResult.reason));
      }
      if (filesResult.status === "fulfilled") {
        setPageFiles(filesResult.value);
        setPageFilesError(false);
      } else {
        setPageFiles(null);
        setPageFilesError(true);
      }
      setPageLoading(false);
      setPageFilesLoading(false);
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
    const mounted = mountNebula(canvas, labels, graph, reduced, (distance, far) => {
      reportZoom.current(distance, far);
    });
    scene.current = mounted;
    mounted.focus(attentionOf(hoveredRef.current, selectionRef.current));
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

  useEffect(() => {
    scene.current?.focus(attentionOf(hovered, selection));
  }, [hovered, selection]);

  useEffect(() => {
    if (selection === null) return;
    scene.current?.inspect(selection);
  }, [selection]);

  useEffect(
    () =>
      holdSkyZoom(
        (delta, x, y) => {
          idleAt.current = now();
          scene.current?.zoom(delta, x, y);
        },
        (active) => {
          pinching.current = active;
        },
      ),
    [],
  );

  const previewOpen = selection !== null;
  const confirmOpen = visibilityConfirmOpen(armed, graph?.pages ?? null);
  useEffect(() => {
    const plan = previewDialogPlan({ previewOpen, confirmOpen });
    const nodes = readPreviewDialogNodes();
    applyPreviewDialog({ ...nodes, plan });
    const stop = bindKeyDown((event) => {
      if (typeof event.key !== "string" || event.key !== "Escape" || plan.escape === "ignore") {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      if (plan.escape === "disarm") setArmed(null);
      else setSelection(null);
    });
    return () => {
      stop();
      // The sidebar outlives this screen. Leaving inert set would block the rest of admin.
      releasePreviewInert(nodes.sky, nodes.side);
    };
  }, [previewOpen, confirmOpen]);

  return createElement(NebulaHome, {
    graph,
    loading,
    error,
    selection,
    onSelect: (next) => {
      if (dragged.current) return;
      setSelection(next);
    },
    onSkyDown: (x, y, target, input) => {
      const mode = skyDragMode(input);
      if (mode === null || isControl(target)) return;
      dragged.current = false;
      gesture.current = gestureDown(x, y, mode, input.button);
      idleAt.current = now();
    },
    onSkyMove: (x, y) => {
      const current = gesture.current;
      if (current === null) {
        pointAt(x, y);
        return;
      }
      const next = gestureMove(current, x, y);
      gesture.current = next.gesture;
      idleAt.current = now();
      if (!next.dragging) {
        pointAt(x, y);
        return;
      }
      dragged.current = true;
      if (hoveredRef.current !== null) rememberHover(null);
      if (next.gesture.mode === "pan") scene.current?.pan(next.dx, next.dy);
      else scene.current?.turn(next.dx, next.dy);
    },
    onSkyUp: (x, y, target, outside) => {
      const button = gesture.current?.button ?? 0;
      const released = releaseSkyGesture({
        type: "pointerup",
        outside,
        gesture: gesture.current,
        dragged: dragged.current,
      });
      gesture.current = released.gesture;
      idleAt.current = now();
      if (!released.select || button === 2 || isControl(target)) return;
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
    onSkyLeave: () => {
      rememberHover(null);
    },
    onSkyDouble: (x, y, target) => {
      homeOnEmptyDoubleClick({
        target,
        picked: scene.current?.pick(x, y) ?? null,
        home: () => {
          scene.current?.home();
        },
      });
    },
    hovered,
    onWheel: (input) => {
      if (pinching.current) return;
      idleAt.current = now();
      const action = wheelTurn(input);
      if (action.kind === "zoom") scene.current?.zoom(action.delta, input.clientX, input.clientY);
      else scene.current?.turn(action.dx, action.dy);
    },
    zoom,
    onZoom: (slider) => {
      idleAt.current = now();
      scene.current?.zoomToSlider(slider);
    },
    armed,
    pending,
    onArm: setArmed,
    pageMarkdown,
    pageLoading,
    originals: pageOriginals(pageFilesLoading, pageFilesError, pageFiles),
    selectedFileId,
    onSelectFile: setSelectedFileId,
    originalOpen,
    onOriginalOpen: setOriginalOpen,
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

function attentionOf(hovered: string | null, selection: NebulaSelection): NebulaAttention {
  return {
    hovered,
    selected: selection?.kind === "page" ? selection.key : null,
    source: selection?.kind === "source" ? selection.id : null,
  };
}

function pageOriginals(
  loading: boolean,
  failed: boolean,
  files: readonly PageFile[] | null,
): PageOriginals {
  if (failed) return { status: "error", files: [] };
  if (loading || files === null) return { status: "loading", files: [] };
  return { status: "ready", files };
}

function isControl(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object" || !("closest" in target)) return false;
  const closest = target.closest;
  if (typeof closest !== "function") return false;
  return (
    closest.call(
      target,
      "input, .nebula-modal, .nebula-dock, .nebula-zoom, .nebula-help, .nebula-mark, .nebula-menu, .nebula-skill",
    ) !== null
  );
}

import { createElement, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { browserTransport, createAdminClient, failureMessage, type AdminClient } from "./http";
import {
  createApiKeyBody,
  deviceApprovalBody,
  draftsFromDirectories,
  isReleaseId,
  toggleDraft,
} from "./forms";
import { hrefFor, parseAdminRoute, type AdminRoute } from "./routes";
import { isPasswordGate, isUnauthorized, sessionFromProbeFailure, type Session } from "./session";
import type { ApiKeyRequest, SiteActivation, SourceDraft } from "./types";
import { pushBrowserPath, readBrowserLocation, subscribeToLocation } from "./browser";
import {
  ApiKeyApprovalView,
  ApiKeyCreateView,
  DeviceApprovalView,
  HomeView,
  LoginView,
  PasswordView,
  Shell,
  SiteApprovalView,
  SiteCreateView,
  StatusView,
} from "./views";

export function AdminApp(): ReactElement {
  const client = useMemo(() => createAdminClient(browserTransport()), []);
  const { route, go } = useRoute();
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const probe = async (): Promise<void> => {
      try {
        const identity = await client.whoami();
        if (cancelled) return;
        setSession(
          identity.admin
            ? { status: "ready" }
            : { status: "anonymous", message: "只有所属人可以打开管理端" },
        );
      } catch (reason: unknown) {
        if (!cancelled) setSession(sessionFromProbeFailure(reason));
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const onPasswordGate = useCallback(() => {
    setSession({ status: "password-change" });
  }, []);

  const onUnauthorized = useCallback(() => {
    setSession({ status: "anonymous", message: null });
  }, []);

  const onFailure = useCallback(
    (reason: unknown): string => {
      if (isPasswordGate(reason)) onPasswordGate();
      if (isUnauthorized(reason)) onUnauthorized();
      return failureMessage(reason);
    },
    [onPasswordGate, onUnauthorized],
  );

  const logout = useCallback(() => {
    void (async () => {
      try {
        await client.logout();
      } catch (reason: unknown) {
        if (!isUnauthorized(reason)) {
          setSession({ status: "anonymous", message: failureMessage(reason) });
          go({ name: "login" });
          return;
        }
      }
      setSession({ status: "anonymous", message: null });
      go({ name: "login" });
    })();
  }, [client, go]);

  if (session.status === "loading") {
    return shell(
      false,
      go,
      logout,
      createElement(StatusView, { title: "管理", message: "正在确认会话" }),
    );
  }

  if (session.status === "anonymous") {
    return shell(
      false,
      go,
      logout,
      createElement(LoginScreen, {
        client,
        message: session.message,
        onLoggedIn: (mustChangePassword) => {
          if (mustChangePassword) {
            setSession({ status: "password-change" });
            return;
          }
          setSession({ status: "ready" });
          if (route.name === "login" || route.name === "unknown") go({ name: "home" });
        },
        onLogout: session.message === null ? null : logout,
      }),
    );
  }

  if (session.status === "password-change") {
    return shell(
      false,
      go,
      logout,
      createElement(PasswordScreen, {
        client,
        locked: true,
        onFailure,
        onChanged: () => {
          setSession({ status: "ready" });
          if (route.name === "login" || route.name === "password" || route.name === "unknown") {
            go({ name: "home" });
          }
        },
        onLogout: logout,
      }),
    );
  }

  return shell(true, go, logout, screenForRoute(route, client, go, onFailure, logout));
}

function shell(
  showNav: boolean,
  go: (route: AdminRoute) => void,
  logout: () => void,
  child: ReactElement,
): ReactElement {
  return createElement(Shell, { showNav, onNavigate: go, onLogout: logout, children: child });
}

function screenForRoute(
  route: AdminRoute,
  client: AdminClient,
  go: (route: AdminRoute) => void,
  onFailure: (reason: unknown) => string,
  logout: () => void,
): ReactElement {
  switch (route.name) {
    case "home":
    case "login":
    case "unknown":
      return createElement(HomeView, { onNavigate: go });
    case "password":
      return createElement(PasswordScreen, {
        client,
        locked: false,
        onFailure,
        onChanged: () => {
          go({ name: "home" });
        },
        onLogout: logout,
      });
    case "device":
      return createElement(DeviceScreen, { client, userCode: route.userCode, onFailure });
    case "api-key-new":
      return createElement(ApiKeyCreateScreen, {
        client,
        onFailure,
        onCreated: (id) => {
          go({ name: "api-key", id });
        },
      });
    case "api-key":
      return createElement(ApiKeyApprovalScreen, { client, id: route.id, onFailure });
    case "site-new":
      return createElement(SiteCreateScreen, {
        client,
        onFailure,
        onCreated: (id) => {
          go({ name: "site", id });
        },
      });
    case "site":
      return createElement(SiteApprovalScreen, { client, id: route.id, onFailure });
  }
}

function useRoute(): { route: AdminRoute; go: (route: AdminRoute) => void } {
  const [route, setRoute] = useState<AdminRoute>(() => {
    const location = readBrowserLocation();
    return parseAdminRoute(location.pathname, location.search);
  });
  useEffect(
    () =>
      subscribeToLocation(() => {
        const location = readBrowserLocation();
        setRoute(parseAdminRoute(location.pathname, location.search));
      }),
    [],
  );
  const go = useCallback((next: AdminRoute) => {
    pushBrowserPath(hrefFor(next));
    setRoute(next);
  }, []);
  return { route, go };
}

function LoginScreen(props: {
  client: AdminClient;
  message: string | null;
  onLoggedIn: (mustChangePassword: boolean) => void;
  onLogout: (() => void) | null;
}): ReactElement {
  const [message, setMessage] = useState<string | null>(props.message);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setMessage(props.message);
  }, [props.message]);

  return createElement(LoginView, {
    message,
    pending,
    onLogout: props.onLogout,
    onSubmit: (login, password) => {
      if (login.trim() === "" || password === "") {
        setMessage("请填写登录名和密码");
        return;
      }
      setPending(true);
      setMessage(null);
      void (async () => {
        try {
          const result = await props.client.login(login.trim(), password);
          props.onLoggedIn(result.must_change_password);
        } catch (reason: unknown) {
          setMessage(failureMessage(reason));
        } finally {
          setPending(false);
        }
      })();
    },
  });
}

function PasswordScreen(props: {
  client: AdminClient;
  locked: boolean;
  onFailure: (reason: unknown) => string;
  onChanged: () => void;
  onLogout: () => void;
}): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return createElement(PasswordView, {
    message,
    pending,
    locked: props.locked,
    onLogout: props.onLogout,
    onSubmit: (password) => {
      if (password === "") {
        setMessage("请填写新密码");
        return;
      }
      setPending(true);
      setMessage(null);
      void (async () => {
        try {
          await props.client.changePassword(password);
          props.onChanged();
        } catch (reason: unknown) {
          setMessage(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
  });
}

function DeviceScreen(props: {
  client: AdminClient;
  userCode: string;
  onFailure: (reason: unknown) => string;
}): ReactElement {
  const [userCode, setUserCode] = useState(props.userCode);
  const [siteWrite, setSiteWrite] = useState(false);
  const [drafts, setDrafts] = useState<SourceDraft[]>([]);
  const [directoriesReady, setDirectoriesReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setUserCode(props.userCode);
  }, [props.userCode]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const sources = await props.client.listSources();
        if (cancelled) return;
        setDrafts(draftsFromDirectories(sources.map((source) => source.id)));
        setDirectoriesReady(true);
      } catch (reason: unknown) {
        if (!cancelled) setMessage(props.onFailure(reason));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.client, props.onFailure]);

  return createElement(DeviceApprovalView, {
    userCode,
    siteWrite,
    drafts,
    message,
    pending,
    done,
    directoriesReady,
    onUserCode: setUserCode,
    onSiteWrite: setSiteWrite,
    onToggle: (id, flag, value) => {
      setDrafts((current) => toggleDraft(current, id, flag, value));
    },
    onSubmit: () => {
      const body = deviceApprovalBody({ userCode, siteWrite, drafts });
      if (!directoriesReady) {
        setMessage("目录还没有载入");
        return;
      }
      if (body.user_code === "") {
        setMessage("请填写用户码");
        return;
      }
      setPending(true);
      setMessage(null);
      void (async () => {
        try {
          await props.client.approveDevice(body);
          setDone(true);
        } catch (reason: unknown) {
          setMessage(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
  });
}

function ApiKeyCreateScreen(props: {
  client: AdminClient;
  onFailure: (reason: unknown) => string;
  onCreated: (id: string) => void;
}): ReactElement {
  const [label, setLabel] = useState("");
  const [unrestrictedData, setUnrestrictedData] = useState(false);
  const [siteWrite, setSiteWrite] = useState(false);
  const [drafts, setDrafts] = useState<SourceDraft[]>([]);
  const [directoriesReady, setDirectoriesReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const sources = await props.client.listSources();
        if (cancelled) return;
        setDrafts(draftsFromDirectories(sources.map((source) => source.id)));
        setDirectoriesReady(true);
      } catch (reason: unknown) {
        if (!cancelled) setMessage(props.onFailure(reason));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.client, props.onFailure]);

  return createElement(ApiKeyCreateView, {
    label,
    unrestrictedData,
    siteWrite,
    drafts,
    message,
    pending,
    directoriesReady,
    onLabel: setLabel,
    onUnrestricted: setUnrestrictedData,
    onSiteWrite: setSiteWrite,
    onToggle: (id, flag, value) => {
      setDrafts((current) => toggleDraft(current, id, flag, value));
    },
    onSubmit: () => {
      const body = createApiKeyBody({ label, unrestrictedData, siteWrite, drafts });
      if (!directoriesReady) {
        setMessage("目录还没有载入");
        return;
      }
      if (body.label === "") {
        setMessage("请填写标签");
        return;
      }
      setPending(true);
      setMessage(null);
      void (async () => {
        try {
          const created = await props.client.createApiKey(body);
          if (created.status !== "pending") {
            setMessage("申请没有处于待批准");
            return;
          }
          props.onCreated(created.id);
        } catch (reason: unknown) {
          setMessage(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
  });
}

function ApiKeyApprovalScreen(props: {
  client: AdminClient;
  id: string;
  onFailure: (reason: unknown) => string;
}): ReactElement {
  const [request, setRequest] = useState<ApiKeyRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setRequest(null);
      setRevealedKey(null);
      setMessage(null);
      try {
        const next = await props.client.getApiKeyRequest(props.id);
        if (!cancelled) setRequest(next);
      } catch (reason: unknown) {
        if (!cancelled) setMessage(props.onFailure(reason));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.client, props.id, props.onFailure]);

  if (request === null) {
    return createElement(StatusView, {
      title: "批准 API Key",
      message: message ?? "正在读取申请",
    });
  }

  return createElement(ApiKeyApprovalView, {
    request,
    message,
    pending,
    revealedKey,
    onConfirm: () => {
      setPending(true);
      setMessage(null);
      void (async () => {
        try {
          const revealed = await props.client.approveApiKey(props.id);
          setRevealedKey(revealed.key);
        } catch (reason: unknown) {
          setMessage(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
  });
}

function SiteCreateScreen(props: {
  client: AdminClient;
  onFailure: (reason: unknown) => string;
  onCreated: (id: string) => void;
}): ReactElement {
  const [releaseId, setReleaseId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return createElement(SiteCreateView, {
    releaseId,
    message,
    pending,
    onReleaseId: setReleaseId,
    onSubmit: () => {
      const trimmed = releaseId.trim();
      if (!isReleaseId(trimmed)) {
        setMessage("发布编号无法识别");
        return;
      }
      setPending(true);
      setMessage(null);
      void (async () => {
        try {
          const created = await props.client.activateSite(trimmed);
          if (created.status !== "pending") {
            setMessage("申请没有处于待批准");
            return;
          }
          props.onCreated(created.id);
        } catch (reason: unknown) {
          setMessage(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
  });
}

function SiteApprovalScreen(props: {
  client: AdminClient;
  id: string;
  onFailure: (reason: unknown) => string;
}): ReactElement {
  const [activation, setActivation] = useState<SiteActivation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setActivation(null);
      setOutcome(null);
      setMessage(null);
      try {
        const next = await props.client.getSiteActivation(props.id);
        if (!cancelled) setActivation(next);
      } catch (reason: unknown) {
        if (!cancelled) setMessage(props.onFailure(reason));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.client, props.id, props.onFailure]);

  if (activation === null) {
    return createElement(StatusView, {
      title: "批准站点上线",
      message: message ?? "正在读取申请",
    });
  }

  return createElement(SiteApprovalView, {
    activation,
    message,
    pending,
    outcome,
    onDecide: (decision) => {
      setPending(true);
      setMessage(null);
      void (async () => {
        try {
          await props.client.decideSite(props.id, decision);
          setOutcome(decision);
        } catch (reason: unknown) {
          setMessage(props.onFailure(reason));
        } finally {
          setPending(false);
        }
      })();
    },
  });
}

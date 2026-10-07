import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { clearStaticOverrides, getStaticSession } from "@/lib/staticAuth";
import { useCallback, useEffect, useMemo } from "react";

const staticDemoRoles = ["admin", "staff", "responder", "citizen"] as const;
type StaticDemoRole = (typeof staticDemoRoles)[number];

function getStaticDemoUser() {
  const role = sessionStorage.getItem("likas-static-demo-role");
  if (!staticDemoRoles.includes(role as StaticDemoRole)) return null;
  const validRole = role as StaticDemoRole;
  return {
    id: 0,
    openId: `static-demo:${validRole}`,
    name: `${validRole[0].toUpperCase()}${validRole.slice(1)} Demo`,
    email: `demo.${validRole}@static.local`,
    loginMethod: "static-demo",
    role: validRole,
    phone: null,
    isDemo: true,
    demoExpiresAt: null,
    twoFactorEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  // Login is started via startLogin() in the effect below, only when we actually
  // navigate — never during render. startLogin() mints a one-time nonce + writes
  // the state cookie, so calling it per render would overwrite the cookie and
  // desync it from an in-flight login's `state`.
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // Clear the Preview auto-login token mirrored into sessionStorage, so
      // header-based sessions (Safari ITP / WebView) are logged out too. The
      // backend cookie is cleared by the logout mutation.
      try {
        sessionStorage.removeItem("manus-cookie");
        clearStaticOverrides();
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  // A confirmed backend session is authoritative. Drop any leftover preview or
  // static role keys the moment auth.me resolves, so a refresh can never
  // resurrect an old role from sessionStorage (which survives F5 in the tab).
  useEffect(() => {
    if (meQuery.data) clearStaticOverrides();
  }, [meQuery.data]);

  const state = useMemo(() => {
    const staticDemoUser = getStaticDemoUser();
    const staticUser = getStaticSession();
    // While the real session is still fetching, don't let a stale preview or
    // static role render in its place (the wrong-role flash on refresh). Only
    // fall back to static/demo once auth.me has settled with no session.
    const meQuerySettled = !meQuery.isLoading;
    const effectiveUser =
      meQuery.data ?? (meQuerySettled ? staticDemoUser ?? staticUser : null);
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(effectiveUser)
    );
    return {
      user: effectiveUser,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data ?? staticDemoUser),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    // Navigate at this moment only. startLogin() mints the nonce + cookie itself.
    if (redirectPath) {
      window.location.href = redirectPath;
    } else {
      startLogin();
    }
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}

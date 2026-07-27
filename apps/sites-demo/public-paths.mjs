function normalizeRoot(rawRoot) {
  const value = rawRoot?.trim();
  if (!value || value === "/") return "/";
  if (value === "." || value === "./") return "./";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolvePublicDemoBuildOptions(env = process.env) {
  const root = normalizeRoot(env.PUBLIC_DEMO_ROOT);
  const routerMode = env.PUBLIC_DEMO_ROUTER_MODE === "hash" ? "hash" : "browser";
  const adminBase = root;
  const portalBase = root === "./" ? "./" : `${root}portal/`.replaceAll("//", "/");

  const adminBasename = routerMode === "hash" || root === "/"
    ? ""
    : root.slice(0, -1);
  const portalBasename = routerMode === "hash"
    ? ""
    : root === "/"
      ? "/portal"
      : `${root.slice(0, -1)}/portal`;

  return {
    root,
    routerMode,
    adminBase,
    portalBase,
    adminBasename,
    portalBasename
  };
}

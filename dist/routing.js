const reservedNames = new Set([
  "login",
  "register",
  "edit",
  "collection",
  "api",
  "assets",
  "vendor",
]);
let ownProfile = null;
let viewedUserId = null;
let routeVersion = 0;
function usernameSlug(name) {
  const slug = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return !slug || reservedNames.has(slug)
    ? "user-" + (currentAccount?.id?.slice(0, 8) || "profile")
    : slug;
}
function profilePath(profile = ownProfile || state) {
  return (
    "/" + encodeURIComponent(profile.username || usernameSlug(profile.name))
  );
}
function editorPath(id) {
  return (
    profilePath(ownProfile || state) + "/collection/" + encodeURIComponent(id)
  );
}
function navigate(path, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", path);
  closeDescription();
  render();
}
async function resolveRoute() {
  const version = ++routeVersion;
  if (location.hash.startsWith("#/")) {
    const old = location.hash.slice(1);
    const path =
      old === "/edit"
        ? profilePath() + "/edit"
        : old.startsWith("/collection/")
          ? profilePath() + old
          : old;
    history.replaceState({}, "", path);
  }
  let path = decodeURIComponent(location.pathname).replace(/\/$/, "") || "/";
  if (path === "/login" || path === "/register")
    return { auth: path === "/register" };
  if (path === "/" && currentAccount) {
    path = profilePath();
    history.replaceState({}, "", path);
  }
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) {
    state = structuredClone(initial);
    viewedUserId = null;
    return { editing: false };
  }
  const handle = parts[0].toLowerCase();
  const editing = parts[1] === "edit";
  const collectionId = parts[1] === "collection" ? parts[2] : null;
  if ((editing || collectionId) && !currentAccount) {
    history.replaceState({}, "", "/login");
    return { auth: false };
  }
  if (parts.length > (collectionId ? 3 : editing ? 2 : 1))
    throw Error("Page not found.");
  if (currentAccount && handle === ownProfile?.username) {
    state = structuredClone(ownProfile);
    viewedUserId = currentAccount.id;
  } else {
    if (editing || collectionId)
      throw Error("Only the profile owner can edit this page.");
    const { data, error } = await cloud
      .from("three_by_three_profiles")
      .select("user_id,profile")
      .eq("profile->>username", handle)
      .maybeSingle();
    if (version !== routeVersion) return { stale: true };
    if (error) throw error;
    if (!data) throw Error("Profile not found.");
    state = data.profile;
    viewedUserId = data.user_id;
  }
  return { editing, collectionId };
}
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="/"]');
  if (
    !link ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    link.target ||
    link.hasAttribute("download")
  )
    return;
  event.preventDefault();
  if (dirty && !confirm("Discard unsaved changes?")) return;
  dirty = false;
  navigate(link.getAttribute("href"));
});
window.addEventListener("popstate", () => {
  closeDescription();
  render();
});

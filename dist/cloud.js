// Supabase uses only the public API key; database credentials never reach this file.
let cloud = null,
  cloudReady = false,
  authBusy = false;
let cloudSaving = false;
async function loadCloudAccount(user) {
  currentAccount = null;
  if (!user) {
    state = structuredClone(initial);
    ownProfile = null;
    return;
  }
  const { data, error } = await cloud
    .from("three_by_three_profiles")
    .select("profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw Error("Could not load your profile. " + error.message);
  const profile = data?.profile || {
    ...structuredClone(initial),
    name: user.user_metadata?.username || "Your name",
    username: usernameSlug(
      user.user_metadata?.username || "user-" + user.id.slice(0, 8),
    ),
    bio: "",
    collections: [],
  };
  if (!data) {
    let result = await cloud
      .from("three_by_three_profiles")
      .insert({ user_id: user.id, profile });
    if (result.error?.code === "23505") {
      profile.username =
        profile.username.slice(0, 30) + "-" + user.id.slice(0, 8);
      result = await cloud
        .from("three_by_three_profiles")
        .insert({ user_id: user.id, profile });
    }
    if (result.error) throw result.error;
  }
  if (!profile.username) {
    profile.username = usernameSlug(profile.name);
    let result = await cloud
      .from("three_by_three_profiles")
      .upsert({ user_id: user.id, profile });
    if (result.error?.code === "23505") {
      profile.username =
        profile.username.slice(0, 30) + "-" + user.id.slice(0, 8);
      result = await cloud
        .from("three_by_three_profiles")
        .upsert({ user_id: user.id, profile });
    }
    if (result.error) throw result.error;
  }
  ownProfile = structuredClone(profile);
  currentAccount = { id: user.id, username: profile.username };
  state = profile;
}
initializeAccounts = async function () {
  const response = await fetch("/api/config");
  const config = await response.json();
  if (!response.ok)
    throw Error(config.error || "Supabase configuration unavailable.");
  cloud = supabase.createClient(config.url, config.key, {
    auth: { flowType: "pkce" },
  });
  const { data, error } = await cloud.auth.getSession();
  if (error) throw error;
  await loadCloudAccount(data.session?.user);
  cloudReady = true;
  if (new URLSearchParams(location.search).has("code"))
    history.replaceState({}, "", "/login");
  cloud.auth.onAuthStateChange((event, session) => {
    if (authBusy || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
      return;
    if (
      event === "SIGNED_OUT" ||
      (event === "SIGNED_IN" && session?.user.id !== currentAccount?.id)
    ) {
      setTimeout(async () => {
        try {
          await loadCloudAccount(session?.user);
          dirty = false;
          render();
        } catch (e) {
          notify(e.message);
        }
      }, 0);
    }
  });
  document.querySelector("#storage-note").textContent =
    "Profiles saved to Supabase";
};
renderAccountNav = function () {
  let nav = document.querySelector("#account-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "account-nav";
    nav.className = "account-nav";
    document.querySelector("header").append(nav);
  }
  nav.innerHTML = currentAccount
    ? `<span>${esc(currentAccount.username)}</span><button type="button" id="cloud-logout">log out</button>`
    : '<a href="/login">log in</a><a href="/register">register</a>';
  const logout = document.querySelector("#cloud-logout");
  if (logout)
    logout.onclick = async () => {
      if (dirty && !confirm("Discard unsaved changes?")) return;
      logout.disabled = true;
      authBusy = true;
      try {
        const { error } = await cloud.auth.signOut();
        if (error) throw error;
        currentAccount = null;
        state = structuredClone(initial);
        dirty = false;
        ownProfile = null;
        navigate("/login");
      } catch (e) {
        notify(e.message);
        logout.disabled = false;
      } finally {
        authBusy = false;
      }
    };
};
renderAccountForm = function (register) {
  draft = null;
  dirty = false;
  document.title = (register ? "Register" : "Log in") + " — 3x3site";
  app.innerHTML = `
    <section class="account-form">
      <h1>${register ? "Register" : "Log in"}</h1>
      <form id="cloud-account-form">
        ${register ? '<label>Username<input name="username" autocomplete="username" required minlength="1" maxlength="40" pattern="[a-z0-9_-]+"><small>Lowercase letters, numbers, underscores, and hyphens. This becomes your page URL.</small></label>' : ""}
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="8" required></label>
        <button class="primary" type="submit">${register ? "Send email code" : "Log in"}</button>
      </form>
      ${
        register
          ? `
        <form id="verify-email-form">
          <label>Email code<input name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required></label>
          <button class="primary" type="submit">Verify and create account</button>
          <button type="button" id="resend-code">Resend code</button>
        </form>`
          : ""
      }
      <p id="account-error" role="status" aria-live="polite"></p>
      <p><a href="/${register ? "login" : "register"}">${register ? "Already have an account? Log in" : "Register a new account"}</a></p>
      <p class="hint">Your profile and grids are public. Only you can edit them.</p>
    </section>`;
  const form = document.querySelector("#cloud-account-form");
  const status = document.querySelector("#account-error");
  let sentEmail = sessionStorage.getItem("3x3site-pending-email") || "";
  if (register && sentEmail) form.elements.email.value = sentEmail;
  async function complete(session) {
    if (!session) throw Error("No session returned. Try logging in.");
    await loadCloudAccount(session.user);
    cloudReady = true;
    sessionStorage.removeItem("3x3site-pending-email");
    history.replaceState({}, "", profilePath());
    render();
  }
  async function action(button, callback) {
    if (authBusy) return;
    button.disabled = true;
    authBusy = true;
    status.textContent = "";
    try {
      if (!cloud) throw Error("Connection unavailable. Reload the page.");
      await callback();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      authBusy = false;
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    action(form.querySelector("button"), async () => {
      const email = form.elements.email.value.trim(),
        password = form.elements.password.value;
      if (register) {
        const username = form.elements.username.value.trim();
        if (reservedNames.has(username))
          throw Error("Choose another username; this name is reserved.");
        const available = await cloud
          .from("three_by_three_profiles")
          .select("user_id")
          .eq("profile->>username", username)
          .maybeSingle();
        if (available.error) throw available.error;
        if (available.data) throw Error("That username is already taken.");
        const { data, error } = await cloud.auth.signUp({
          email,
          password,
          options: {
            data: { username },
            emailRedirectTo: location.origin + "/login",
          },
        });
        if (error) throw error;
        if (data.session) return complete(data.session);
        sentEmail = email;
        sessionStorage.setItem("3x3site-pending-email", email);
        status.textContent =
          "Email sent. Enter the code below to confirm your account.";
        document.querySelector('[name="token"]').focus();
      } else {
        const { data, error } = await cloud.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await complete(data.session);
      }
    });
  };
  if (register) {
    document.querySelector("#verify-email-form").onsubmit = (event) => {
      event.preventDefault();
      action(event.target.querySelector("button"), async () => {
        const email = form.elements.email.value.trim();
        if (!email || (sentEmail && sentEmail !== email))
          throw Error("Use the email address that received the code.");
        const { data, error } = await cloud.auth.verifyOtp({
          email,
          token: event.target.elements.token.value.trim(),
          type: "email",
        });
        if (error) throw error;
        await complete(data.session);
      });
    };
    document.querySelector("#resend-code").onclick = (event) =>
      action(event.target, async () => {
        const email = form.elements.email.value.trim();
        if (!email) throw Error("Enter your email first.");
        const { error } = await cloud.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: location.origin + "/login" },
        });
        if (error) throw error;
        sentEmail = email;
        sessionStorage.setItem("3x3site-pending-email", email);
        status.textContent = "A new confirmation code has been sent.";
      });
  }
};
async function saveCloudProfile(next) {
  if (cloudSaving) throw Error("A save is already in progress.");
  cloudSaving = true;
  try {
    return await writeCloudProfile(next);
  } finally {
    cloudSaving = false;
  }
}
async function writeCloudProfile(next) {
  const owner = currentAccount?.id;
  if (!owner) throw Error("Sign in to save");
  if (
    !/^[a-z0-9_-]{1,40}$/.test(next.username || "") ||
    reservedNames.has(next.username)
  )
    throw Error(
      "Choose a username with 1–40 lowercase letters, numbers, underscores, or hyphens.",
    );
  const profile = structuredClone(next),
    uploaded = [];
  async function upload(source) {
    if (!source?.startsWith("data:")) return source;
    const blob = await (await fetch(source)).blob();
    const ext = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    }[blob.type];
    if (!ext) throw Error("Upload PNG, JPEG, WebP, or GIF images.");
    const path = owner + "/" + crypto.randomUUID() + "." + ext;
    const { error } = await cloud.storage
      .from("three-by-three")
      .upload(path, blob, { contentType: blob.type });
    if (error) throw error;
    uploaded.push(path);
    return cloud.storage.from("three-by-three").getPublicUrl(path).data
      .publicUrl;
  }
  try {
    profile.avatar = await upload(profile.avatar);
    for (const collection of profile.collections)
      for (const slot of collection.slots) {
        if (slot) {
          slot.source = await upload(slot.source);
          if (slot.preview) slot.preview = await upload(slot.preview);
        }
      }
    if (currentAccount?.id !== owner)
      throw Error("Account changed. Please sign in again before saving.");
    const { error } = await cloud.from("three_by_three_profiles").upsert({
      user_id: owner,
      profile,
      updated_at: new Date().toISOString(),
    });
    if (error?.code === "23505") throw Error("That username is already taken.");
    if (error) throw error;
    if (currentAccount?.id === owner) {
      state = profile;
      currentAccount.username = profile.username;
      ownProfile = structuredClone(profile);
    }
  } catch (error) {
    if (uploaded.length)
      await cloud.storage.from("three-by-three").remove(uploaded);
    throw error;
  }
}

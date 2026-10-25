// Mock accounts are a local UI prototype, not authentication or an access-control boundary.
let currentAccount = null,
  mockAccounts = [];
const mockSessionKey = "3x3-mock-account";
function accountProfileKey(id) {
  return id === "local" ? "main" : "mock-profile:" + id;
}
function readLocalRecord(key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction("profile").objectStore("profile").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function writeLocalRecords(records) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("profile", "readwrite"),
      store = tx.objectStore("profile");
    for (const [key, value] of records) store.put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function demoArtwork(label, index, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${color}"/><rect x="22" y="22" width="356" height="356" fill="none" stroke="#fff" opacity=".5"/><text x="40" y="92" font-family="Arial" font-weight="bold" font-size="38" fill="#fff">${label}</text><text x="40" y="330" font-family="Arial" font-weight="bold" font-size="170" fill="#fff">${index}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function demoProfile(name, titles, color) {
  return {
    name,
    bio: "A sample profile for trying separate accounts.",
    avatar: demoArtwork(name, "3×3", color),
    columns: 2,
    collections: titles.map((title, i) => ({
      id: crypto.randomUUID(),
      title,
      shape: i ? "portrait" : "square",
      borders: true,
      slots: Array.from({ length: 9 }, (_, n) => ({
        source: demoArtwork(title, n + 1, color),
        width: 400,
        height: 400,
        zoom: 1,
        x: 0,
        y: 0,
        alt: title + " sample " + (n + 1),
        info: "Sample image " + (n + 1) + " from " + name + "'s collection.",
        link: "",
      })),
    })),
  };
}
async function initializeAccounts() {
  mockAccounts = await readLocalRecord("mock-accounts");
  if (!mockAccounts) {
    mockAccounts = [
      { id: "local", username: "local" },
      { id: "demo-alex", username: "alex" },
      { id: "demo-sam", username: "sam" },
    ];
    await writeLocalRecords([
      ["mock-accounts", mockAccounts],
      ["main", state],
      [
        accountProfileKey("demo-alex"),
        demoProfile("Alex", ["Albums", "Games"], "#385a62"),
      ],
      [
        accountProfileKey("demo-sam"),
        demoProfile("Sam", ["Books", "Films"], "#765340"),
      ],
    ]);
  }
  const session = sessionStorage.getItem(mockSessionKey);
  currentAccount =
    mockAccounts.find((a) => a.id === (session === null ? "local" : session)) ||
    null;
  if (currentAccount)
    state =
      (await readLocalRecord(accountProfileKey(currentAccount.id))) ||
      structuredClone(initial);
}
function renderAccountNav() {
  let nav = document.querySelector("#account-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "account-nav";
    nav.className = "account-nav";
    document.querySelector("header").append(nav);
  }
  nav.innerHTML = currentAccount
    ? `<span>${esc(currentAccount.username)}</span><a href="#/login">switch account</a><button type="button" id="mock-logout">log out</button>`
    : '<a href="#/login">log in</a><a href="#/register">register</a>';
  const logout = document.querySelector("#mock-logout");
  if (logout)
    logout.onclick = async () => {
      if (dirty && !confirm("Discard unsaved changes?")) return;
      dirty = false;
      currentAccount = null;
      sessionStorage.setItem(mockSessionKey, "signed-out");
      state = (await readLocalRecord("main")) || structuredClone(initial);
      location.hash = "/login";
      render();
    };
}
async function signInMock(account) {
  const profile = await readLocalRecord(accountProfileKey(account.id));
  if (!profile) throw Error("Profile could not be found.");
  currentAccount = account;
  sessionStorage.setItem(mockSessionKey, account.id);
  state = profile;
  dirty = false;
  location.hash = "/";
  render();
}
function renderAccountForm(register) {
  draft = null;
  dirty = false;
  document.title = register ? "Register — 3×3" : "Log in — 3×3";
  app.innerHTML = `<section class="account-form"><h1>${register ? "Register" : "Log in"}</h1><p class="hint">Local mock accounts — no password or email required. These profiles stay in this browser and are not protected accounts.</p><form id="mock-account-form"><label>Username<input name="username" autocomplete="off" required maxlength="32" pattern="[a-zA-Z0-9_-]{1,32}" placeholder="${register ? "Choose a username" : "local, alex, or sam"}"></label><p class="hint">Letters, numbers, underscores, and hyphens.</p><button class="primary" type="submit">${register ? "Create account" : "Log in"}</button><p id="account-error" role="alert"></p></form><p><a href="#/${register ? "login" : "register"}">${register ? "Already have an account? Log in" : "Register a new account"}</a></p>${register ? "" : `<div class="mock-account-list"><h2>Available accounts</h2>${mockAccounts.map((a) => `<button type="button" data-mock-account="${esc(a.id)}">${esc(a.username)}</button>`).join("")}</div>`}</section>`;
  const form = document.querySelector("#mock-account-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button"),
      username = form.elements.username.value.trim().toLowerCase();
    button.disabled = true;
    try {
      if (!/^[a-z0-9_-]{1,32}$/.test(username))
        throw Error("Use 1–32 letters, numbers, underscores, or hyphens.");
      mockAccounts = (await readLocalRecord("mock-accounts")) || [];
      let account = mockAccounts.find((a) => a.username === username);
      if (register) {
        if (account) throw Error("That username already exists.");
        account = { id: crypto.randomUUID(), username };
        const profile = {
          ...structuredClone(initial),
          name: username,
          bio: "",
          collections: [],
        };
        await writeLocalRecords([
          ["mock-accounts", [...mockAccounts, account]],
          [accountProfileKey(account.id), profile],
        ]);
        mockAccounts.push(account);
      } else if (!account) throw Error("Account not found. Register it first.");
      await signInMock(account);
    } catch (error) {
      document.querySelector("#account-error").textContent = error.message;
      button.disabled = false;
    }
  };
  document.querySelectorAll("[data-mock-account]").forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await signInMock(
            mockAccounts.find((a) => a.id === button.dataset.mockAccount),
          );
        } catch (error) {
          document.querySelector("#account-error").textContent = error.message;
          button.disabled = false;
        }
      }),
  );
}

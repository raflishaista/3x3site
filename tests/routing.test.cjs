const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
function router(path) {
  const location = { pathname: path, hash: "" };
  const context = vm.createContext({
    structuredClone,
    Set,
    encodeURIComponent,
    decodeURIComponent,
    location,
    currentAccount: { id: "alice" },
    initial: { name: "Your name", collections: [] },
    state: {},
    history: {
      replaceState(_a, _b, path) {
        location.pathname = path;
        location.hash = "";
      },
    },
    document: { addEventListener() {} },
    window: { addEventListener() {} },
  });
  vm.runInContext(fs.readFileSync("dist/routing.js", "utf8"), context);
  const run = (s) => vm.runInContext(s, context);
  run("ownProfile={name:'Alice',username:'alice',collections:[]}");
  return { run, location };
}
test("a public username page loads the selected profile without replacing the owner profile", async () => {
  const { run } = router("/bob");
  run(
    "var requested;cloud={from:()=>({select:()=>({eq:(_key,value)=>{requested=value;return {maybeSingle:async()=>({data:{user_id:'bob',profile:{name:'Bob',username:'bob',collections:[]}}})}}})})}",
  );
  await run("resolveRoute()");
  assert.equal(run("requested"), "bob");
  assert.equal(run("state.name"), "Bob");
  assert.equal(run("ownProfile.name"), "Alice");
});
test("a different user cannot open another profile editor", async () => {
  const { run } = router("/bob/edit");
  await assert.rejects(run("resolveRoute()"), /Only the profile owner/);
});
test("own editor restores the owner profile after viewing another page", async () => {
  const { run } = router("/alice/edit");
  run("state={name:'Bob'}");
  assert.equal((await run("resolveRoute()")).editing, true);
  assert.equal(run("state.name"), "Alice");
});
test("legacy hash URLs become clean username URLs", async () => {
  const { run, location } = router("/");
  location.hash = "#/collection/books";
  assert.equal((await run("resolveRoute()")).collectionId, "books");
  assert.equal(location.pathname, "/alice/collection/books");
  assert.equal(location.hash, "");
});

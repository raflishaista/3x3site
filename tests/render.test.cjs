const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({
  URL,
  structuredClone,
  console,
  setTimeout,
  clearTimeout,
  document: {
    querySelector: () => ({ addEventListener: () => {} }),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {} },
  editorPath: (id) => "/collection/" + id,
});
const source = fs
  .readFileSync("dist/app.js", "utf8")
  .replace(/^init\(\);$/m, "");
vm.runInContext(fs.readFileSync("dist/grids.js", "utf8"), context);
vm.runInContext(source, context);
const run = (code) => vm.runInContext(code, context);
test("only http and https image destinations are accepted", () => {
  assert.equal(run("safeLink('javascript:alert(1)')"), "");
  assert.equal(run("safeLink('data:text/html,hello')"), "");
  assert.equal(
    run("safeLink('https://example.com/book')"),
    "https://example.com/book",
  );
});
test("GIF uses original source with a live CSS crop", () => {
  const html = run(
    "imageMarkup({source:'data:image/gif;base64,animated',width:800,height:400,zoom:1.5,x:0.1,y:0},1)",
  );
  assert.match(html, /data:image\/gif/);
  assert.match(html, /width:300%/);
  assert.match(html, /left:60%/);
});
test("legacy images retain their previously saved crop", () => {
  assert.match(
    run("imageMarkup({source:'original.png',preview:'cropped.png'})"),
    /src="cropped.png"/,
  );
});
test("home images link safely and descriptions are escaped", () => {
  const html = run(
    "tiles({id:'test',slots:[{source:'x.gif',info:'<script>alert(1)</script>',link:'https://example.com'}]},'home')",
  );
  assert.match(html, /href="https:\/\/example.com\/"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /tip-left/);
  assert.doesNotMatch(html, /<script>/);
});
test("left column speechboxes open left; other columns open right", () => {
  const html = run("tiles({id:'test',slots:Array(9).fill({source:'x.gif'})})");
  assert.equal((html.match(/tip-left/g) || []).length, 3);
  assert.equal((html.match(/tip-right/g) || []).length, 6);
});
test("portrait, landscape and borderless settings reach rendered grid", () => {
  assert.equal(run("ratio({shape:'portrait'})"), 788 / 1196);
  assert.equal(run("ratio({shape:'landscape'})"), 1090 / 570);
  assert.match(
    run(
      "gridMarkup({borders:false,shape:'landscape',slots:Array(9).fill(null)},'home')",
    ),
    /class="grid borderless"/,
  );
});
test("editor offers separate image and description controls for all nine slots", () => {
  const html = run("tiles({slots:Array(9).fill(null)},'editor')");
  assert.equal((html.match(/data-image=/g) || []).length, 9);
  assert.equal((html.match(/data-description=/g) || []).length, 9);
});

test("moving an image preserves all metadata and shifts intervening slots", () => {
  assert.equal(
    run(
      `JSON.stringify((()=>{const a=[{source:'a.gif',info:'A',link:'https://a.test',zoom:2},null,{source:'c.png'}];moveEntry(a,0,2);return a})())`,
    ),
    JSON.stringify([
      null,
      { source: "c.png" },
      { source: "a.gif", info: "A", link: "https://a.test", zoom: 2 },
    ]),
  );
});
test("collection order can move forward and back without losing entries", () => {
  assert.equal(
    run(
      `JSON.stringify((()=>{const a=['books','films','food'];moveEntry(a,2,0);moveEntry(a,0,2);return a})())`,
    ),
    '["books","films","food"]',
  );
});
test("invalid or unchanged drops do not mutate the order", () => {
  assert.equal(
    run(
      `JSON.stringify((()=>{const a=[1,2,3];moveEntry(a,-1,2);moveEntry(a,0,9);moveEntry(a,1,1);return a})())`,
    ),
    "[1,2,3]",
  );
});
vm.runInContext(fs.readFileSync("dist/export.js", "utf8"), context);
test("export fits portrait and landscape grids inside uniform cards", () => {
  assert.equal(
    run("JSON.stringify(fitExportGrid(2,400,400))"),
    '{"width":400,"height":200}',
  );
  assert.equal(
    run("JSON.stringify(fitExportGrid(0.5,400,400))"),
    '{"width":200,"height":400}',
  );
});
test("export crop retains zoom and normalized image position", () => {
  const result = run(
    `JSON.stringify((()=>{let args;const ctx={save(){},beginPath(){},rect(){},clip(){},restore(){},drawImage(...a){args=a.slice(1)}};paintExportImage(ctx,{naturalWidth:200,naturalHeight:100},0,0,100,100,{width:200,height:100,zoom:2,x:.1,y:-.1});return args})())`,
  );
  assert.equal(result, "[-140,-60,400,200]");
});
test("export filenames remove invalid path characters", () => {
  assert.equal(
    run(`exportFilename('Name / title: one')`),
    "Name - title- one.png",
  );
});
vm.runInContext(fs.readFileSync("dist/accounts.js", "utf8"), context);
test("mock account storage preserves the original profile and separates new accounts", () => {
  assert.equal(run("accountProfileKey('local')"), "main");
  assert.notEqual(
    run("accountProfileKey('demo-alex')"),
    run("accountProfileKey('demo-sam')"),
  );
});
test("saving uses the signed-in account key", async () => {
  const key = await run(
    `(async()=>{let writtenKey;currentAccount={id:'demo-sam'};db={transaction(){const tx={objectStore(){return {put(value,key){writtenKey=key;Promise.resolve().then(()=>tx.oncomplete())}}}};return tx}};await persist({name:'Sam',collections:[]});return writtenKey})()`,
  );
  assert.equal(key, "mock-profile:demo-sam");
});
test("signed-out saves are rejected", async () => {
  await assert.rejects(
    run("currentAccount=null;persist({name:'No account'})"),
    /Sign in to save/,
  );
});

test("rectangular grids preserve row-major order and expand with blank cells", () => {
  const result = run(
    `JSON.stringify((()=>{const c={slots:['a','b','c','d']};const small=resizeGrid(c,1,1);const large=resizeGrid(small,4,3);return {small:gridSlots(small),large:gridSlots(large),ratio:gridRatio(large)}})())`,
  );
  assert.deepEqual(JSON.parse(result), {
    small: ["a"],
    large: ["a", "b", "c", "d", null, null, null, null, null, null, null, null],
    ratio: 4 / 3,
  });
});
test("5 by 5 renders 25 editable tiles and dynamic geometry", () => {
  const html = run("gridMarkup({gridColumns:5,gridRows:5,slots:[]},'editor')");
  assert.equal((html.match(/data-image=/g) || []).length, 25);
  assert.match(html, /--grid-columns:5/);
});
test("legacy and multiple titled descriptions render safely", () => {
  assert.match(run("infoMarkup({info:'Legacy'})"), /Legacy/);
  const html = run(
    "infoMarkup({sections:[{title:'Director',text:'A'},{title:'<script>',text:'B'}]})",
  );
  assert.match(html, /Director/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
test("default avatar is blank but custom images remain", () => {
  assert.equal(run("avatarSource({avatar:'assets/avatar.png'})"), "");
  assert.equal(
    run("avatarSource({avatar:'https://example.com/p.png'})"),
    "https://example.com/p.png",
  );
});
test("gaps insert into the later slot in row-major order", () => {
  run(
    "var rects=Array.from({length:9},(_,i)=>({left:(i%3)*110,right:(i%3)*110+100,top:Math.floor(i/3)*110,bottom:Math.floor(i/3)*110+100}))",
  );
  assert.equal(run("insertionIndex(rects,105,50)"), 1);
  assert.equal(run("insertionIndex(rects,215,50)"), 2);
  assert.equal(run("insertionIndex(rects,5,105)"), 3);
  assert.equal(run("insertionIndex(rects,500,50)"), null);
});

test("collection card in editing mode renders delete button with data-delete-grid", () => {
  const html = run(
    "collectionCard({id:'c1',title:'My Movies',slots:[]},0,true)",
  );
  assert.match(html, /class="delete-grid-btn"/);
  assert.match(html, /data-delete-grid="c1"/);
  assert.match(html, /aria-label="Delete My Movies"/);
});

test("collection card in public mode does not render delete button", () => {
  const html = run(
    "collectionCard({id:'c1',title:'My Movies',slots:[]},0,false)",
  );
  assert.doesNotMatch(html, /class="delete-grid-btn"/);
});

test("renderCollectionsView renders group divider with white lines and title in public mode", () => {
  run(`state = {
    collections: [
      { id: 'c1', title: 'Top Movie', groupId: 'g1', slots: [] },
      { id: 'c2', title: 'Top Book', groupId: 'g2', slots: [] }
    ],
    groups: [
      { id: 'g1', title: 'Cinema' },
      { id: 'g2', title: 'Literature' }
    ]
  }`);
  const html = run("renderCollectionsView(false)");
  assert.match(html, /class="group-divider "/);
  assert.match(html, /class="group-divider-line"/);
  assert.match(html, /<span class="group-divider-title">Cinema<\/span>/);
  assert.match(html, /<span class="group-divider-title">Literature<\/span>/);
});

test("renderCollectionsView in editing mode renders group title input and delete group button", () => {
  run(`profileDraft = {
    collections: [{ id: 'c1', title: 'Top Movie', groupId: 'g1', slots: [] }],
    groups: [{ id: 'g1', title: 'Cinema' }]
  }`);
  const html = run("renderCollectionsView(true)");
  assert.match(html, /class="group-title-input"/);
  assert.match(html, /data-group-title="g1"/);
  assert.match(html, /class="delete-group-btn"/);
  assert.match(html, /data-delete-group="g1"/);
});

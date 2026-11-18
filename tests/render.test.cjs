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
    querySelector: () => ({ addEventListener: () => {}, style: {} }),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {} },
  innerWidth: 1024,
  innerHeight: 768,
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

test("renderLanding renders minimal landing page with title, vertical subtitles, and REGISTER button", () => {
  run("app.innerHTML = ''; document.title = '';");
  run("renderLanding()");
  const html = run("app.innerHTML");
  assert.match(html, /class="landing-page"/);
  assert.match(html, /class="landing-title">3<span>×<\/span>3site<\/h1>/);
  assert.match(
    html,
    /Make your own page full of 3x3s of various things you like/,
  );
  assert.match(html, /Upload your own images and edit your own page/);
  assert.match(
    html,
    /Your own sharable page by URL and downloadable pages\/grids/,
  );
  assert.match(
    html,
    /<a href="\/eeyow" class="landing-example-link">Example profile<\/a>/,
  );
  assert.match(
    html,
    /<a href="\/register" class="landing-register-btn">REGISTER<\/a>/,
  );
});

test("an empty group renders its divider line and title in public mode", () => {
  run(`state = {
    collections: [],
    groups: [{ id: 'g_empty', title: 'Upcoming Grids' }]
  }`);
  const html = run("renderCollectionsView(false)");
  assert.match(
    html,
    /<span class="group-divider-title">Upcoming Grids<\/span>/,
  );
});

test("group divider in editing mode has data-reorder group, drag handle, and data-group-id", () => {
  run(`profileDraft = {
    collections: [],
    groups: [{ id: 'g1', title: 'Anime' }]
  }`);
  const html = run("renderCollectionsView(true)");
  assert.match(html, /data-reorder="group"/);
  assert.match(html, /data-group-id="g1"/);
  assert.match(html, /class="group-drag-handle"/);
});

test("groups can be rendered on the first line of the page before ungrouped", () => {
  run(`state = {
    collections: [
      { id: 'c1', title: 'Top Movie', groupId: 'g1', slots: [] },
      { id: 'c2', title: 'Random Stuff', slots: [] }
    ],
    groups: [{ id: 'g1', title: 'Cinema' }],
    sectionOrder: ['g1', 'ungrouped']
  }`);
  const html = run("renderCollectionsView(false)");
  const cinemaIndex = html.indexOf("Cinema");
  const randomStuffIndex = html.indexOf("Random Stuff");
  assert.ok(cinemaIndex >= 0 && randomStuffIndex >= 0);
  assert.ok(
    cinemaIndex < randomStuffIndex,
    "Group should appear before ungrouped",
  );
});

test("collection card in a group renders ungroup button in editing mode", () => {
  run(`profileDraft = {
    collections: [{ id: 'c1', title: 'Top Movie', groupId: 'g1', slots: [] }],
    groups: [{ id: 'g1', title: 'Cinema' }]
  }`);
  const html = run("renderCollectionsView(true)");
  assert.match(html, /class="ungroup-grid-btn"/);
  assert.match(html, /data-ungroup-grid="c1"/);
});

test("reorderItems with group reorders sectionOrder", () => {
  run(`profileDraft = {
    collections: [],
    groups: [
      { id: 'g1', title: 'First' },
      { id: 'g2', title: 'Second' }
    ],
    sectionOrder: ['g1', 'g2', 'ungrouped']
  }`);
  run(`
    mockPeer1 = { dataset: { groupId: 'g1' }, focus: () => {} };
    mockPeer2 = { dataset: { groupId: 'g2' }, focus: () => {} };
    savedReorderPeers = reorderPeers;
    reorderPeers = (k) => k === 'group' ? [mockPeer1, mockPeer2] : savedReorderPeers(k);
    reorderItems('group', 0, 1);
    reorderPeers = savedReorderPeers;
  `);
  const order = run("profileDraft.sectionOrder");
  assert.equal(order[0], "g2");
  assert.equal(order[1], "g1");
});

test("dropIntoEmptyGroup moves grid into empty group or out of group", () => {
  run(`profileDraft = {
    collections: [{ id: 'c1', title: 'Solo Grid', groupId: 'g1', slots: [] }],
    groups: [{ id: 'g1', title: 'Cinema' }, { id: 'g2', title: 'Books' }]
  }`);
  run(`
    mockCard = { dataset: { collectionId: 'c1' } };
    savedReorderPeers = reorderPeers;
    reorderPeers = (k) => k === 'collection' ? [mockCard] : savedReorderPeers(k);
    dropIntoEmptyGroup(0, 'g2');
    reorderPeers = savedReorderPeers;
  `);
  assert.strictEqual(run("profileDraft.collections[0].groupId"), "g2");

  run(`
    mockCard = { dataset: { collectionId: 'c1' } };
    savedReorderPeers = reorderPeers;
    reorderPeers = (k) => k === 'collection' ? [mockCard] : savedReorderPeers(k);
    dropIntoEmptyGroup(0, '');
    reorderPeers = savedReorderPeers;
  `);
  assert.strictEqual(run("profileDraft.collections[0].groupId"), undefined);
});

test("dragging a collection does not translate target peers to origin coordinates", () => {
  run(`
    cardA = { style: {}, classList: { add: () => {}, remove: () => {}, toggle: (cls, on) => { cardA[cls] = on; } } };
    cardB = { style: {}, classList: { add: () => {}, remove: () => {}, toggle: (cls, on) => { cardB[cls] = on; } } };
    reorderDrag = {
      kind: 'collection',
      item: cardA,
      peers: [cardA, cardB],
      rects: [{ top: 100, bottom: 200, left: 0, right: 100 }, { top: 500, bottom: 600, left: 0, right: 100 }],
      from: 0,
      to: null,
      x: 50,
      y: 150,
      pointerId: 1,
      active: true,
      scrollY: 0
    };
    document.querySelectorAll = () => [];
    document.elementFromPoint = () => ({ closest: (sel) => sel.includes('.collection') ? cardB : null });
  `);
  run(`
    if (reorderDrag && reorderDrag.kind === 'collection') {
      reorderDrag.item.style.transform = 'translate(0px, 400px)';
      const el = document.elementFromPoint(50, 550);
      const targetCard = el?.closest('.collection:not(.drag-source)');
      if (targetCard) {
        reorderDrag.to = reorderDrag.peers.indexOf(targetCard);
      }
      reorderDrag.peers.forEach((p, idx) => {
        p.classList.toggle('drop-target', idx === reorderDrag.to && idx !== reorderDrag.from);
      });
    }
  `);
  assert.equal(run("cardB.style.transform"), undefined);
  assert.equal(run("cardB['drop-target']"), true);
});

test("renderProfile in editing mode displays Page Name label and placeholder", () => {
  run(
    `state = { name: 'My Profile', bio: 'Hello', username: 'testuser', collections: [], groups: [] };`,
  );
  run("profileDraft = structuredClone(state);");
  run("renderProfile(true);");
  const html = run("app.innerHTML");
  assert.match(html, /<label class="name-label">Page Name/);
  assert.match(html, /placeholder="Page Name"/);
  assert.match(html, /class="name-input"/);
});

test("infoMarkup with empty title does not display h3 and only displays description", () => {
  const html = run(
    "infoMarkup({sections:[{title:'',text:'Only description here'}]})",
  );
  assert.doesNotMatch(html, /<h3>/);
  assert.match(html, /<div>Only description here<\/div>/);
  const titled = run(
    "infoMarkup({sections:[{title:'Director',text:'Christopher Nolan'}]})",
  );
  assert.match(titled, /<h3>Director<\/h3>/);
  assert.match(titled, /<div>Christopher Nolan<\/div>/);
});

test("tiles renders image overlay name when slot name is set", () => {
  const homeHtml = run(
    "tiles({id:'test',slots:[{source:'x.gif',name:'Fight Club'}]},'home')",
  );
  assert.match(homeHtml, /<div class="image-overlay-name">Fight Club<\/div>/);
  const editorHtml = run(
    "tiles({id:'test',slots:[{source:'x.gif',name:'The Matrix'}]},'editor')",
  );
  assert.match(editorHtml, /<div class="image-overlay-name">The Matrix<\/div>/);
  const profileHtml = run(
    "tiles({id:'test',slots:[{source:'x.gif',name:'Inception'}]},'profile')",
  );
  assert.match(profileHtml, /<div class="image-overlay-name">Inception<\/div>/);
});

test("openDescription renders Name input at top and optional title placeholder and hint", () => {
  run(`
    let createdForm = null;
    const mockTile = {
      getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 100 }),
      classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
      style: {},
      append: (child) => {}
    };
    document.querySelector = (sel) => ({
      addEventListener: () => {},
      style: {},
      remove: () => {},
      focus: () => {}
    });
    document.createElement = (tag) => {
      const el = {
        tag,
        className: '',
        innerHTML: '',
        children: [],
        style: {},
        offsetWidth: 200,
        offsetHeight: 100,
        classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
        getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 100 }),
        setAttribute: () => {},
        querySelector: (sel) => {
          if (sel === '.info-fields') return { append: (child) => el.children.push(child) };
          if (sel === '.close-description' || sel === '.remove-info' || sel === '.add-info') return { onclick: null };
          return { focus: () => {} };
        },
        querySelectorAll: () => [],
        append: (child) => el.children.push(child),
        closest: (sel) => (sel.includes('.tile') ? mockTile : null)
      };
      if (tag === 'form') createdForm = el;
      return el;
    };
    draft = { id: 'grid1', gridColumns: 3, gridRows: 3, slots: [{ source: 'x.gif', name: 'Movie One' }] };
    const btn = { dataset: { description: '0' }, closest: (sel) => mockTile, focus: () => {} };
    openDescription(0, btn);
  `);
  const formHtml = run("createdForm.innerHTML");
  assert.match(formHtml, /class="slot-name-label">Name/);
  assert.match(formHtml, /name="name"/);
  assert.match(formHtml, /value="Movie One"/);
  const fieldHtml = run("createdForm.children[0]?.innerHTML || ''");
  assert.match(fieldHtml, /placeholder="Title"/);
  assert.match(fieldHtml, /<label>Title/);
});

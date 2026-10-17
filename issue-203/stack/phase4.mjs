// #200 review/edit/save/collection/list, #201 link-sharing defaults, Discover, share dialog.
import fs from "fs";
import { chromium, newContext, USERS, SPA, EV, record, saveResults, http, psql, scalar, shot, htmlShot, sleep } from "./lib.mjs";

const state = JSON.parse(fs.readFileSync(`${EV}/logs/state.json`, "utf8"));
// The SPA decides ownership by comparing the token's sub with collection.createdBy, which the API sets to Users.Id.
// With this test issuer the two differ, so for the UI/HTTP owner checks alice's token carries sub = her Users.Id
// (the API re-links the same email to the new Subject). Evidence label: test identity provider, not Cognito.
const aliceOwner = { sub: state.aliceUserId, email: USERS.alice.email };
const browser = await chromium.launch();
const discoverIds = async () => (await http("GET", "/collections/discover?pageSize=50")).body;
const hasId = (body, id) => JSON.stringify(body).includes(id);
try {
  const aliceCtx = (await newContext(browser, aliceOwner)).context;
  const alice = await aliceCtx.newPage();
  await alice.goto(`${SPA}/study-guides/documents/${state.pdfDocId}`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(1500);

  // ---- #200: edit question 1 ----
  const EDITED = "EDITED BY ALICE: which fact about photosynthesis does the guide state first?";
  await alice.getByRole("button", { name: "Edit question 1", exact: true }).click();
  const qField = alice.getByLabel("Question 1", { exact: true }).first();
  await qField.fill(EDITED);
  await shot(alice, "21-review-edit-question-1");
  await alice.getByRole("button", { name: "Save changes" }).click();
  await alice.waitForTimeout(500);
  // exclude question 12, save the rest
  const labelBefore = (await alice.getByRole("button", { name: /Save \d+ selected/ }).first().innerText()).trim();
  await alice.getByRole("checkbox", { name: "Include question 12", exact: true }).uncheck();
  const saveBtn = alice.getByRole("button", { name: /Save \d+ selected/ });
  const saveLabel = (await saveBtn.first().innerText()).trim();
  await saveBtn.first().click();
  await alice.getByText(/Saved \d+ questions? to your collection/).waitFor({ timeout: 20000 });
  await alice.waitForTimeout(1000);
  await alice.getByText(/Saved \d+ questions? to your collection/).scrollIntoViewIfNeeded();
  await shot(alice, "22-saved-to-collection");
  const savedText = (await alice.locator("body").innerText()).match(/Saved \d+ questions? to your collection[^\n]*/)?.[0];
  const doc = (await http("GET", `/study-guides/documents/${state.pdfDocId}`, { who: aliceOwner })).body;
  state.collectionId = doc.collectionId;
  const items = psql(`select left(i."Question",70) as question, i."IsPrivate", left(replace(i."Explanation", E'\\n', ' | '),120) as explanation from "Items" i join "CollectionItems" ci on ci."ItemId"=i."Id" where ci."CollectionId"='${doc.collectionId}' order by i."CreatedAt" limit 12`);
  const itemCount = scalar(`select count(*) from "CollectionItems" where "CollectionId"='${doc.collectionId}'`);
  const edited = scalar(`select count(*) from "Items" i join "CollectionItems" ci on ci."ItemId"=i."Id" where ci."CollectionId"='${doc.collectionId}' and i."Question"='${EDITED}'`);
  const suffix = scalar(`select count(*) from "Items" i join "CollectionItems" ci on ci."ItemId"=i."Id" where ci."CollectionId"='${doc.collectionId}' and i."Explanation" like '%From "science-guide-14p", pp. %'`);
  const colRow = psql(`select "Id","Name","Description","IsPublic","IsDiscoverable","CreatedBy" from "Collections" where "Id"='${doc.collectionId}'`);
  fs.writeFileSync(`${EV}/logs/200-db-collection-items.txt`, `${colRow}\ncollection items: ${itemCount}\n${items}\nedited question stored: ${edited}\nitems with 'From "<title>", <section>' explanation suffix: ${suffix}\n`);
  record("#200", "edit one question inline, uncheck one, 'Save 11 selected' creates the collection and saves 11 items", /Saved 11 questions/.test(savedText ?? "") && itemCount === "11" && labelBefore === "Save 12 selected" && saveLabel === "Save 11 selected", { buttonLabelBeforeUncheck: labelBefore, buttonLabelAfterUncheck: saveLabel, message: savedText, collectionItems: itemCount, collectionId: doc.collectionId });
  record("#200", "edited text is what was stored; explanations get the 'From \"<title>\", <section>' suffix", edited === "1" && suffix === "11", { editedQuestionRows: edited, explanationsWithSuffix: suffix });

  // ---- #200: open collection (flashcards / explore view) ----
  const openLink = alice.getByRole("link", { name: /Open collection/ }).first();
  const href = await openLink.getAttribute("href");
  await openLink.click();
  await alice.waitForLoadState("networkidle");
  await alice.waitForTimeout(2000);
  await shot(alice, "23-open-collection-flashcards");
  const colText = await alice.locator("body").innerText();
  record("#200", "'Open collection' opens the collection's flashcard (explore) view with the saved questions", /explore\/collections\//.test(href ?? "") && /science-guide-14p|EDITED BY ALICE|photosynthesis/i.test(colText), { href, url: alice.url().replace(SPA, ""), mentionsEdited: /EDITED BY ALICE/.test(colText) });

  // ---- #200: My study guides list ----
  await alice.goto(`${SPA}/study-guides/documents`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(1500);
  await shot(alice, "24-my-study-guides");
  const listText = await alice.locator("body").innerText();
  fs.writeFileSync(`${EV}/logs/200-my-study-guides.txt`, listText);
  record("#200", "My study guides lists both documents with progress ('3 of 7 sections generated · 11 questions saved'), Collection link and Continue", /3 of 7 sections generated · 11 questions saved/.test(listText) && /Collection/.test(listText) && /Continue/.test(listText), { progressLine: listText.match(/\d+ of \d+ sections generated[^\n]*/g) });

  // ---- #201: defaults ----
  const cid = state.collectionId;
  const flags = psql(`select "Id","Name","IsPublic","IsDiscoverable" from "Collections" where "Id"='${cid}'`);
  const isPublic = scalar(`select "IsPublic" from "Collections" where "Id"='${cid}'`);
  const isDisc = scalar(`select "IsDiscoverable" from "Collections" where "Id"='${cid}'`);
  record("#201", "DB: the auto-created study guide collection has IsPublic=true and IsDiscoverable=false", isPublic === "t" && isDisc === "f", { IsPublic: isPublic, IsDiscoverable: isDisc });
  await alice.goto(`${SPA}/collections/${cid}`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(2000);
  const sw = alice.getByRole("switch");
  const swStates = await sw.evaluateAll((els) => els.map((e) => ({ name: e.getAttribute("aria-labelledby") ? document.getElementById(e.getAttribute("aria-labelledby")).innerText : "", checked: e.getAttribute("aria-checked") })));
  await shot(alice, "25-collection-toggles-defaults");
  record("#201", "UI: 'Anyone with the link can view' is on and 'List in Discover' is off on the new collection", swStates.length === 2 && swStates[0].checked === "true" && swStates[1].checked === "false", { switches: swStates });
  const anon1 = await http("GET", `/collections/${cid}`);
  const d1 = await discoverIds();
  record("#201", "anonymous GET /collections/{id} -> 200 while link access is on", anon1.status === 200 && anon1.body.id === cid, { status: anon1.status, name: anon1.body.name, isPublic: anon1.body.isPublic, isDiscoverable: anon1.body.isDiscoverable });
  record("#201", "GET /collections/discover does NOT list the collection (IsDiscoverable=false)", !hasId(d1, cid), { discoverTotalReturned: d1.collections?.length ?? d1.items?.length ?? null });

  // Share dialog while link access is on
  await alice.getByRole("button", { name: "Share", exact: true }).click();
  await alice.waitForTimeout(500);
  await alice.getByRole("button", { name: /Show QR code/ }).click();
  await alice.waitForTimeout(1500);
  await shot(alice, "26-share-dialog-copy-link-qr");
  const dlg = await alice.getByRole("dialog").innerText().catch(() => "");
  record("#201", "Share dialog shows the link, Copy link and a rendered QR code", /Copy link/.test(dlg) && (await alice.getByRole("dialog").locator("img, canvas, svg").count()) > 0, { dialogText: dlg.slice(0, 200).replace(/\n+/g, " | "), qrImages: await alice.getByRole("dialog").locator("img").count() });
  await alice.keyboard.press("Escape");
  await alice.waitForTimeout(500);

  // ---- #201: List in Discover on -> appears ----
  await alice.goto(`${SPA}/collections/${cid}`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(1500);
  await alice.getByRole("switch", { name: /List in Discover/ }).click();
  await alice.waitForTimeout(2000);
  const d2 = await discoverIds();
  const flags2 = scalar(`select "IsPublic"||','||"IsDiscoverable" from "Collections" where "Id"='${cid}'`);
  await shot(alice, "27-collection-list-in-discover-on");
  record("#201", "turning on 'List in Discover' (UI) makes it appear in GET /collections/discover", hasId(d2, cid) && flags2 === "true,true", { flags: flags2 });
  const dctx = (await newContext(browser, null)).context;
  const anonPage = await dctx.newPage();
  await anonPage.goto(`${SPA}/collections?tab=discover`, { waitUntil: "networkidle" });
  await anonPage.waitForTimeout(2500);
  await shot(anonPage, "28-discover-lists-it-anonymous");
  const discText = await anonPage.locator("body").innerText();
  record("#201", "UI: anonymous visitor's Discover tab lists the collection", /science-guide-14p/.test(discText), { found: /science-guide-14p/.test(discText) });

  // ---- #201: link access off -> anon 404, Discover hides ----
  await alice.getByRole("switch", { name: /Anyone with the link/ }).click();
  await alice.waitForTimeout(2000);
  const anon3 = await http("GET", `/collections/${cid}`);
  const d3 = await discoverIds();
  const flags3 = scalar(`select "IsPublic"||','||"IsDiscoverable" from "Collections" where "Id"='${cid}'`);
  await shot(alice, "29-collection-link-access-off");
  record("#201", "turning link access off (UI) also turns Discover off; anonymous GET -> 404 and Discover hides it", anon3.status === 404 && !hasId(d3, cid) && flags3 === "false,false", { anonymousStatus: anon3.status, flags: flags3 });
  const ownerGet = await http("GET", `/collections/${cid}`, { who: aliceOwner });
  const bobGet = await http("GET", `/collections/${cid}`, { who: USERS.bob });
  record("#201", "with link access off the owner still gets 200 and another member gets 404", ownerGet.status === 200 && bobGet.status === 404, { owner: ownerGet.status, otherMember: bobGet.status });
  // restore link access (default state) so the final screenshot shows the normal toggles
  await alice.getByRole("switch", { name: /Anyone with the link/ }).click();
  await alice.waitForTimeout(1500);
  const anon4 = await http("GET", `/collections/${cid}`);
  record("#201", "link access back on -> anonymous 200 again, still not in Discover", anon4.status === 200 && !hasId(await discoverIds(), cid), { status: anon4.status });
  fs.writeFileSync(`${EV}/logs/201-http-checks.json`, JSON.stringify({ collectionId: cid, anonDefault: { status: anon1.status, isPublic: anon1.body.isPublic, isDiscoverable: anon1.body.isDiscoverable }, discoverBeforeToggle: { listsIt: hasId(d1, cid) }, discoverAfterDiscoverOn: { listsIt: hasId(d2, cid) }, afterLinkOff: { anonStatus: anon3.status, discoverListsIt: hasId(d3, cid), ownerStatus: ownerGet.status, otherMemberStatus: bobGet.status } }, null, 2));
  fs.writeFileSync(`${EV}/logs/state.json`, JSON.stringify(state, null, 2));
} catch (e) {
  record("phase4", "script error", false, String(e).slice(0, 600));
} finally {
  saveResults("phase4");
  await browser.close();
}

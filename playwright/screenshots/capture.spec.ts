import { expect, test, type Page, type TestInfo } from "@playwright/test";
import path from "path";
import fs from "fs";

const HOME_SAMPLE_COLLECTION_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";
const HOME_SAMPLE_COLLECTION_SLUG = "sample+collection";
const HOME_SAMPLE_COLLECTION_DETAIL_PATH = `/collections/${HOME_SAMPLE_COLLECTION_ID}/${HOME_SAMPLE_COLLECTION_SLUG}`;
const USER_GUIDE_COMMENT_TEXT = "Great mnemonic: Bern sounds like bear for Switzerland.";

const STUDY_GUIDE_TEXT = `Here are 50 random countries with their capitals and approximate current populations.

Country\tCapital\tCurrency\tContinent\tPopulation
Canada\tOttawa\tCanadian dollar\tNorth America\t40,467,728
Morocco\tRabat\tMoroccan dirham\tAfrica\t38,762,441
Japan\tTokyo\tJapanese yen\tAsia\t122,427,731
Peru\tLima\tPeruvian sol\tSouth America\t34,922,148
Kenya\tNairobi\tKenyan shilling\tAfrica\t58,636,412
Argentina\tBuenos Aires\tArgentine peso\tSouth America\t46,003,734
Thailand\tBangkok\tThai baht\tAsia\t71,559,614
Poland\tWarsaw\tPolish zloty\tEurope\t37,843,188
Ghana\tAccra\tGhanaian cedi\tAfrica\t35,697,557
Vietnam\tHanoi\tVietnamese dong\tAsia\t102,177,431
Australia\tCanberra\tAustralian dollar\tOceania\t27,227,096
Colombia\tBogota\tColombian peso\tSouth America\t53,936,226
Germany\tBerlin\tEuro\tEurope\t83,644,258
Nepal\tKathmandu\tNepalese rupee\tAsia\t29,629,410
Uganda\tKampala\tUgandan shilling\tAfrica\t52,761,469
Mexico\tMexico City\tMexican peso\tNorth America\t132,997,658
Spain\tMadrid\tEuro\tEurope\t47,850,793
Malaysia\tKuala Lumpur\tMalaysian ringgit\tAsia\t36,385,115
Ethiopia\tAddis Ababa\tEthiopian birr\tAfrica\t138,902,185
Chile\tSantiago\tChilean peso\tSouth America\t19,945,850
Saudi Arabia\tRiyadh\tSaudi riyal\tAsia\t35,165,787
France\tParis\tEuro\tEurope\t66,746,401
Uzbekistan\tTashkent\tUzbek sum\tAsia\t37,724,223
Nigeria\tAbuja\tNigerian naira\tAfrica\t242,431,832
Romania\tBucharest\tRomanian leu\tEurope\t18,800,605
South Korea\tSeoul\tSouth Korean won\tAsia\t51,600,388
Bangladesh\tDhaka\tBangladeshi taka\tAsia\t177,818,044
Cambodia\tPhnom Penh\tCambodian riel\tAsia\t18,051,219
Italy\tRome\tEuro\tEurope\t58,926,166
Algeria\tAlgiers\tAlgerian dinar\tAfrica\t48,028,334
Brazil\tBrasilia\tBrazilian real\tSouth America\t213,562,666
Zimbabwe\tHarare\tZimbabwe Gold\tAfrica\t17,273,580
Turkey\tAnkara\tTurkish lira\tAsia\t87,926,082
Ecuador\tQuito\tUS dollar\tSouth America\t18,444,506
Pakistan\tIslamabad\tPakistani rupee\tAsia\t259,299,791
Angola\tLuanda\tAngolan kwanza\tAfrica\t40,215,179
United Kingdom\tLondon\tPound sterling\tEurope\t69,931,528
Tunisia\tTunis\tTunisian dinar\tAfrica\t12,415,138
Indonesia\tJakarta\tIndonesian rupiah\tAsia\t287,886,782
Senegal\tDakar\tCFA franc BCEAO\tAfrica\t19,366,548
Egypt\tCairo\tEgyptian pound\tAfrica\t120,101,175
Bolivia\tSucre\tBoliviano\tSouth America\t12,749,291
Philippines\tManila\tPhilippine peso\tAsia\t117,724,471
Mozambique\tMaputo\tMozambican metical\tAfrica\t36,639,851
India\tNew Delhi\tIndian rupee\tAsia\t1,476,625,576
Kazakhstan\tAstana\tKazakhstani tenge\tAsia\t21,083,626
Iraq\tBaghdad\tIraqi dinar\tAsia\t48,007,437
Guatemala\tGuatemala City\tGuatemalan quetzal\tNorth America\t18,967,978
Afghanistan\tKabul\tAfghan afghani\tAsia\t45,047,069
Cameroon\tYaounde\tCentral African CFA franc\tAfrica\t30,640,817`;

const BULK_AI_RESPONSE = JSON.stringify(
  [
    {
      category: "geography",
      navigationKeyword1: "capitals",
      navigationKeyword2: "world",
      question:
        "The city-state of Singapore uses which city as its national capital?",
      correctAnswer: "Singapore",
      incorrectAnswers: ["Putrajaya", "Bangkok", "Manila"],
      explanation:
        "Britannica describes Singapore as an independent city-state where the urban area itself forms the country.",
      keywords: ["world", "southeast-asia", "singapore"],
      source: "https://www.britannica.com/place/Singapore",
      seedId: "45353aec-8599-42cd-af38-793a023d33cd",
    },
    {
      category: "geography",
      navigationKeyword1: "capitals",
      navigationKeyword2: "world",
      question: "What is the national capital of the Netherlands?",
      correctAnswer: "Amsterdam",
      incorrectAnswers: ["The Hague", "Rotterdam", "Utrecht"],
      explanation:
        "Britannica calls Amsterdam the Netherlands' capital and principal commercial center, while noting government administration is mainly in The Hague.",
      keywords: ["world", "the-netherlands", "western-europe"],
      source: "https://www.britannica.com/place/Amsterdam",
      seedId: "e2bb0023-f4d5-4bbc-923e-852b320a0f4c",
    },
    {
      category: "geography",
      navigationKeyword1: "capitals",
      navigationKeyword2: "world",
      question: "What is the national capital of Belgium?",
      correctAnswer: "Brussels",
      incorrectAnswers: ["Antwerp", "Ghent", "Bruges"],
      explanation:
        "Britannica names Brussels as Belgium's capital and administrative heart.",
      keywords: ["world", "belgium", "western-europe"],
      source: "https://www.britannica.com/place/Brussels",
      seedId: "ddc70977-814d-498a-9e3b-082b56535f96",
    },
    {
      category: "geography",
      navigationKeyword1: "capitals",
      navigationKeyword2: "world",
      question: "What is the national capital of Switzerland?",
      correctAnswer: "Bern",
      incorrectAnswers: ["Zurich", "Geneva", "Basel"],
      explanation:
        "Britannica identifies Bern (Berne) as Switzerland's capital while larger cities handle finance and trade.",
      keywords: ["world", "switzerland", "western-europe"],
      source: "https://www.britannica.com/place/Bern",
      seedId: "944c28d9-cb37-4e30-b07f-e61a0bc38666",
    },
    {
      category: "geography",
      navigationKeyword1: "capitals",
      navigationKeyword2: "world",
      question: "What is the national capital of Portugal?",
      correctAnswer: "Lisbon",
      incorrectAnswers: ["Porto", "Coimbra", "Faro"],
      explanation:
        "Britannica places Portugal's government in Lisbon on the Tagus estuary.",
      keywords: ["world", "portugal", "iberia"],
      source: "https://www.britannica.com/place/Lisbon",
      seedId: "3eea07a9-9836-45ba-9c06-0fa1b070f76f",
    },
    {
      category: "geography",
      navigationKeyword1: "capitals",
      navigationKeyword2: "world",
      question: "What is the national capital of Austria?",
      correctAnswer: "Vienna",
      incorrectAnswers: ["Salzburg", "Graz", "Innsbruck"],
      explanation:
        "Britannica describes Vienna as Austria's capital and cultural center on the Danube.",
      keywords: ["world", "austria", "central-europe"],
      source: "https://www.britannica.com/place/Vienna",
      seedId: "05fc682a-0f63-47fa-a5f0-d4536c16f276",
    },
  ],
  null,
  2
);

async function safeGoto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "load", timeout: 20_000 });
  await waitForUiToSettle(page);
  await expect(page.locator("body")).toBeVisible();
}

async function signInWithEnvCredentials(page: Page) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    return false;
  }

  await page.goto("/login", { waitUntil: "load", timeout: 20_000 }).catch(() => {});
  await page.locator("#email").fill(email).catch(() => {});
  await page.locator("#password").fill(password).catch(() => {});
  await page.getByRole("button", { name: /sign in/i }).click().catch(() => {});
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 }).catch(() => {});
  await waitForUiToSettle(page);
  return true;
}

async function ensureSignedIn(page: Page) {
  const signOutButton = page.getByRole("button", { name: /sign out/i });
  if (await signOutButton.isVisible().catch(() => false)) {
    return;
  }

  await signInWithEnvCredentials(page);
}

async function waitForUiToSettle(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const hasVisibleSpinner = await page
      .locator("[role='status']")
      .evaluateAll((elements) =>
        elements.some((element) => {
          const htmlElement = element as HTMLElement;
          return htmlElement.offsetParent !== null;
        })
      )
      .catch(() => false);

    if (!hasVisibleSpinner) {
      break;
    }

    await page.waitForTimeout(200);
  }
}

function getScreenshotDir(testInfo: TestInfo) {
  const configuredRoot = process.env.USER_GUIDE_SCREENSHOT_ROOT;
  if (configuredRoot) {
    return path.resolve(
      configuredRoot,
      testInfo.project.name === "screenshots-mobile" ? "mobile" : "desktop"
    );
  }

  return path.resolve(
    process.cwd(),
    testInfo.project.name === "screenshots-mobile"
      ? "docs/user-guide/screenshots/mobile"
      : "docs/user-guide/screenshots/user"
  );
}

async function openMobileMenuIfNeeded(page: Page, testInfo: TestInfo, slug: string) {
  if (testInfo.project.name !== "screenshots-mobile") {
    return;
  }

  if (slug !== "home") {
    return;
  }

  const menuButton = page.getByRole("button", { name: /open main menu/i });
  if (!(await menuButton.isVisible().catch(() => false))) {
    return;
  }

  await menuButton.click().catch(() => {});
  await waitForUiToSettle(page);
}

async function waitForSelectValue(
  page: Page,
  selector: string,
  expectedValue: string,
  timeout = 15_000
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = await page.locator(selector).inputValue().catch(() => "");
    if (value.trim().toLowerCase() === expectedValue.trim().toLowerCase()) {
      return true;
    }

    await page.waitForTimeout(200);
  }

  return false;
}

async function waitForTextToDisappear(page: Page, textPattern: RegExp) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const matchingText = await page
      .getByText(textPattern)
      .evaluateAll((elements) =>
        elements.some((element) => {
          const htmlElement = element as HTMLElement;
          return htmlElement.offsetParent !== null;
        })
      )
      .catch(() => false);

    if (!matchingText) {
      return;
    }

    await page.waitForTimeout(200);
  }
}

async function waitForInputValue(
  page: Page,
  selector: string,
  expectedValue: string,
  timeout = 15_000
) {
  const startedAt = Date.now();
  const normalizedExpected = expectedValue.trim();

  while (Date.now() - startedAt < timeout) {
    const value = await page.locator(selector).inputValue().catch(() => "");
    if (value.trim() === normalizedExpected) {
      return true;
    }

    await page.waitForTimeout(200);
  }

  return false;
}

async function waitForAnyVisible(
  page: Page,
  selectors: string[],
  timeout = 15_000
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    for (const selector of selectors) {
      const isVisible = await page.locator(selector).first().isVisible().catch(() => false);
      if (isVisible) {
        return selector;
      }
    }

    await page.waitForTimeout(200);
  }

  throw new Error(
    `Timed out after ${timeout}ms waiting for one of: ${selectors.join(", ")}`
  );
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  slug: string,
  url: string,
  waitFor?: string | string[]
) {
  fs.mkdirSync(getScreenshotDir(testInfo), { recursive: true });

  await ensureSignedIn(page);
  await safeGoto(page, url);
  if (waitFor) {
    const selectors = Array.isArray(waitFor) ? waitFor : [waitFor];
    await waitForAnyVisible(page, selectors, 12_000);
  }

  await captureCurrentPage(page, testInfo, slug);
}

async function captureCurrentPage(page: Page, testInfo: TestInfo, slug: string) {
  const screenshotDir = getScreenshotDir(testInfo);
  fs.mkdirSync(screenshotDir, { recursive: true });
  await waitForUiToSettle(page);
  await expect(page.locator("#root")).toBeVisible();
  await openMobileMenuIfNeeded(page, testInfo, slug);
  await page.screenshot({
    path: path.join(screenshotDir, `${slug}.png`),
    fullPage: true,
    scale: "css",
  });
}

async function clickMode(page: Page, modeName: string) {
  await page
    .getByRole("tab", { name: new RegExp(modeName, "i") })
    .first()
    .click()
    .catch(() => {});
  await waitForUiToSettle(page);
}

function pickCollectionDetailHref(hrefs: string[]) {
  return (
    hrefs.find((href) =>
      /^\/collections\/[^/?#]+(?:\/[^/?#]+)?$/.test(href)
    ) ?? null
  );
}

async function getCurrentCollectionDetailHref(page: Page) {
  const hrefs = await page
    .locator("a[href^='/collections/']")
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("href"))
        .filter((href): href is string => Boolean(href))
    )
    .catch(() => []);

  return pickCollectionDetailHref(hrefs);
}

async function ensureOwnedCollectionDetailPath(page: Page) {
  await safeGoto(page, "/collections");

  let href = await getCurrentCollectionDetailHref(page);
  if (href) {
    return href;
  }

  await page
    .getByRole("button", { name: /new collection/i })
    .click()
    .catch(() => {});
  await page.locator("#collection-name").fill("User Guide Collection").catch(() => {});
  await page
    .getByRole("button", { name: /^create$/i })
    .click()
    .catch(() => {});
  await page.waitForTimeout(2_000);

  href = await getCurrentCollectionDetailHref(page);
  return href;
}

async function getAnyCollectionDetailPath(page: Page) {
  const ownedHref = await ensureOwnedCollectionDetailPath(page);
  if (ownedHref) {
    return ownedHref;
  }

  await safeGoto(page, "/collections?tab=discover");
  const discoverHref = await getCurrentCollectionDetailHref(page);
  return discoverHref ?? HOME_SAMPLE_COLLECTION_DETAIL_PATH;
}

async function openCollectionDetail(page: Page, preferOwned = false) {
  const href = preferOwned
    ? await ensureOwnedCollectionDetailPath(page)
    : await getAnyCollectionDetailPath(page);

  await safeGoto(page, href ?? HOME_SAMPLE_COLLECTION_DETAIL_PATH);
}

async function ensureListMode(page: Page) {
  await clickMode(page, "list");
}

async function waitForCategoryItemsLoaded(page: Page) {
  await waitForUiToSettle(page);
  await waitForAnyVisible(page, [
    "button[title='Manage collections']",
    "button[title*='Add to ']",
    "button[title*='Remove from ']",
    "h3.text-lg",
    "text=Answer:",
    "text=No items found.",
  ]);
}

async function waitForCollectionsPageLoaded(page: Page) {
  await waitForUiToSettle(page);
  await waitForTextToDisappear(page, /loading collections/i);
  await waitForAnyVisible(page, [
    "button:has-text('New collection')",
    "button[title='Edit collection']",
    "button[title='Active collection']",
    "button[title='Set as active collection']",
    "text=No collections yet. Create your first collection!",
  ]);
}

async function waitForManageCollectionsDialog(page: Page) {
  await waitForAnyVisible(page, ["text=Manage Collections"]);
  await waitForTextToDisappear(page, /loading collections/i);
  await waitForAnyVisible(page, [
    "input[type='checkbox']",
    "text=No collections available",
  ]);
}

async function clickConsentIfPresent(page: Page) {
  const consentButton = page.getByRole("button", { name: /i understand/i });
  if (await consentButton.isVisible().catch(() => false)) {
    await consentButton.click().catch(() => {});
    await consentButton.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    await waitForUiToSettle(page);
  }
}

function collectionRowXPath(name: string) {
  return `xpath=//div[contains(@class,'flex items-center gap-3')][.//span[normalize-space()="${name}"]]`;
}

function collectionCardXPath(name: string) {
  return `xpath=//div[contains(@class,'rounded-2xl')][.//h3[normalize-space()="${name}"]]`;
}

async function ensureCollectionExistsInManageDialog(page: Page, name: string) {
  const existing = page.locator(collectionRowXPath(name));
  if (await existing.first().isVisible().catch(() => false)) {
    return;
  }

  await page.locator("input[placeholder='Enter collection name']").fill(name).catch(() => {});
  await page.locator("button[title='Add new collection']").click().catch(() => {});
  await waitForAnyVisible(page, [collectionRowXPath(name)], 15_000);
}

async function setActiveCollectionInManageDialog(page: Page, name: string) {
  const row = page.locator(collectionRowXPath(name)).first();
  await row.locator("input[type='radio']").check().catch(() => {});
  await page.waitForTimeout(300);
}

async function openManageCollectionsForFirstItem(page: Page) {
  await waitForCategoryItemsLoaded(page);
  const manageCollectionsButton = page
    .locator("button[title='Manage collections']")
    .first();
  const fallbackCollectionButton = page
    .locator(
      "xpath=(//button[contains(@title,'Add to') or contains(@title,'Remove from')]/preceding-sibling::button[1])[1]"
    )
    .first();

  if (await manageCollectionsButton.isVisible().catch(() => false)) {
    await manageCollectionsButton.scrollIntoViewIfNeeded().catch(() => {});
    await manageCollectionsButton.click({ force: true }).catch(() => {});
  } else {
    await fallbackCollectionButton.scrollIntoViewIfNeeded().catch(() => {});
    await fallbackCollectionButton.click({ force: true }).catch(() => {});
  }

  await waitForManageCollectionsDialog(page);
}

async function ensureSecondCollectionIsActive(page: Page, name: string) {
  await openManageCollectionsForFirstItem(page);
  await ensureCollectionExistsInManageDialog(page, name);
  await setActiveCollectionInManageDialog(page, name);
}

async function closeManageCollectionsDialog(page: Page) {
  await page
    .locator("xpath=//h3[normalize-space()='Manage Collections']/following-sibling::button[1]")
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function addFirstItemsToActiveCollection(page: Page, count: number) {
  const addButtons = page.locator("button[title*='Add to ']");
  const total = await addButtons.count();
  let addedCount = 0;

  for (let index = 0; index < total && addedCount < count; index += 1) {
    const button = addButtons.nth(index);
    const enabled = await button.isEnabled().catch(() => false);
    if (!enabled) {
      continue;
    }

    await button.click().catch(() => {});
    await page.waitForTimeout(500);
    addedCount += 1;
  }

  await waitForUiToSettle(page);
}

async function getCollectionHrefByName(page: Page, name: string) {
  await safeGoto(page, "/collections");
  await waitForCollectionsPageLoaded(page);

  const card = page.locator(collectionCardXPath(name)).first();
  const link = card.locator("a[href^='/collections/']").first();
  return (await link.getAttribute("href").catch(() => null)) ?? HOME_SAMPLE_COLLECTION_DETAIL_PATH;
}

async function openCollectionByName(page: Page, name: string) {
  const href = await getCollectionHrefByName(page, name);
  await safeGoto(page, href);
  await waitForCollectionDetailLoaded(page);
}

async function waitForCollectionDetailLoaded(page: Page) {
  await waitForUiToSettle(page);
  await waitForAnyVisible(page, [
    "text=Collection",
    "button:has-text('Details')",
    "text=No items in this collection.",
  ]);
}

async function waitForCollectionQuizModeLoaded(page: Page) {
  await page.waitForURL(/\/quiz\/collections\//, { timeout: 15_000 }).catch(() => {});
  await waitForUiToSettle(page);
  await waitForTextToDisappear(page, /loading/i);
  await waitForAnyVisible(page, [
    "h3:has-text('Question')",
    "h3:has-text('Select an answer:')",
    "text=/Score:\\s*\\d+\\s*\\/\\s*\\d+\\s*correct/i",
    "button[title='View item details']",
  ]);
}

async function getFirstCategoryItemDetailHref(page: Page) {
  await ensureSignedIn(page);
  await safeGoto(page, "/categories/geography/capitals/world");
  await ensureListMode(page);
  await waitForCategoryItemsLoaded(page);

  return (
    (await page
      .locator("a[title='View item details'][href^='/items/']")
      .first()
      .getAttribute("href")
      .catch(() => null)) ??
    null
  );
}

async function openFirstCategoryItemDetail(page: Page) {
  await ensureSignedIn(page);
  await safeGoto(page, "/categories/geography/capitals/world");
  await ensureListMode(page);
  await waitForCategoryItemsLoaded(page);

  const detailButton = page
    .locator("a[title='View item details'][href^='/items/']")
    .first();
  if (await detailButton.isVisible().catch(() => false)) {
    await detailButton.click().catch(() => {});
    await page.waitForURL(/\/items\/[^/?#]+/, { timeout: 15_000 }).catch(() => {});
  } else {
    const href = await getFirstCategoryItemDetailHref(page);
    await safeGoto(page, href ?? "/categories/geography/capitals/world");
  }

  await waitForAnyVisible(page, [
    "text=Item details",
    "text=Question",
    "button:has-text('Comments')",
  ]);
}

async function rateCurrentItemFiveStars(page: Page) {
  const fiveStarButton = page.locator("button[title='Rate 5 stars']").first();
  if (await fiveStarButton.isVisible().catch(() => false)) {
    await fiveStarButton.click().catch(() => {});
    await waitForUiToSettle(page);
  }
}

async function openCommentsForCurrentItem(page: Page) {
  const commentsButton = page
    .getByRole("button", { name: /comments \(/i })
    .first();
  await commentsButton.scrollIntoViewIfNeeded().catch(() => {});
  await commentsButton.click({ force: true }).catch(() => {});
  await waitForAnyVisible(page, [
    "[role='dialog']",
    "textarea[placeholder='Write your comment...']",
    "text=No comments yet. Be the first to comment!",
  ]);
}

async function addCommentForCurrentItem(page: Page, text: string) {
  await openCommentsForCurrentItem(page);
  const commentBox = page.locator("textarea[placeholder='Write your comment...']").first();
  if (await commentBox.isVisible().catch(() => false)) {
    await commentBox.fill(text).catch(() => {});
    await page.getByRole("button", { name: /post comment/i }).click().catch(() => {});
    await waitForAnyVisible(page, [`text=${text}`], 15_000);
    await waitForUiToSettle(page);
  }
}

async function ensureStudyGuideSaved(page: Page) {
  await ensureSignedIn(page);
  await safeGoto(page, "/study-guide");
  await waitForAnyVisible(page, [
    "#sg-title",
    "text=Study Guide",
  ]);

  await page.locator("#sg-title").fill("Capitals Study Guide").catch(() => {});
  await page.locator("#sg-content").fill(STUDY_GUIDE_TEXT).catch(() => {});
  await page.getByRole("button", { name: /^save$/i }).click().catch(() => {});
  await waitForTextToDisappear(page, /saving/i);
  await waitForUiToSettle(page);
  await waitForAnyVisible(page, ["button:has-text('Continue to prompt sets')", "#sg-content"]);
}

async function ensureStudyGuideDeleted(page: Page) {
  await ensureSignedIn(page);
  await safeGoto(page, "/study-guide");
  await waitForAnyVisible(page, ["#sg-title", "button:has-text('Save')"]);

  const deleteButton = page.getByRole("button", { name: /^delete$/i });
  if (!(await deleteButton.isVisible().catch(() => false))) {
    return;
  }

  page.once("dialog", (dialog) => dialog.accept().catch(() => {}));
  await deleteButton.click().catch(() => {});
  await waitForUiToSettle(page);
  await waitForAnyVisible(page, ["button:has-text('Save')"]);
}

async function ensurePromptSetsExist(page: Page) {
  await ensureStudyGuideSaved(page);
  await safeGoto(
    page,
    "/study-guide/import?category=geography&keywords=capitals,world&sets=2"
  );
  await clickConsentIfPresent(page);
  await waitForAnyVisible(page, [
    "text=Using study guide:",
    "text=You do not have a study guide yet.",
  ]);

  const hasPromptCards = await page
    .getByText(/bytes of study guide content/i)
    .first()
    .isVisible()
    .catch(() => false);

  if (!hasPromptCards) {
    await page
      .getByRole("button", { name: /create prompt sets/i })
      .click()
      .catch(() => {});
    await waitForAnyVisible(page, ["text=bytes of study guide content", "text=AI prompt"], 20_000);
  }

  await waitForUiToSettle(page);
}

async function openScopedAddItemsPage(page: Page) {
  await ensureSignedIn(page);
  await safeGoto(page, "/categories/geography/capitals/world");
  await clickConsentIfPresent(page);
  await waitForAnyVisible(page, [
    "a[title='Add items for this category and navigation path']",
    "text=World",
  ]);
  await page
    .locator("a[title='Add items for this category and navigation path']")
    .first()
    .click()
    .catch(() => {});
  await page.waitForURL(/\/items\/add/, { timeout: 15_000 }).catch(() => {});
  await clickConsentIfPresent(page);
  await waitForAnyVisible(page, ["#add-hub-scope-category", "#add-hub-scope-rank1"]);
}

async function applyKeywordFilterWithResults(page: Page) {
  await safeGoto(page, "/categories/geography/capitals/world");
  await ensureListMode(page);
  await waitForCategoryItemsLoaded(page);

  const preferredKeywords = ["western-europe", "oceania", "belgium", "switzerland", "australia"];
  for (const keyword of preferredKeywords) {
    const button = page.locator(`button[title*='click to filter']:has-text('${keyword}')`).first();
    if (!(await button.isVisible().catch(() => false))) {
      continue;
    }

    await button.click().catch(() => {});
    await waitForUiToSettle(page);
    await waitForAnyVisible(page, [
      "h3.text-lg",
      `button.bg-indigo-600:has-text('${keyword}')`,
      `button.text-white:has-text('${keyword}')`,
    ]);

    const itemCards = await page.locator("h3.text-lg").count().catch(() => 0);
    const noItems = await page.getByText(/no items found/i).isVisible().catch(() => false);
    if (itemCards > 0 && !noItems) {
      return;
    }
  }
}

test.describe("User guide screenshots", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  const secondCollectionName = "Second collection";

  test("home", async ({ page }, testInfo) => {
    await capture(page, testInfo, "home", "/");
  });

  test("categories", async ({ page }, testInfo) => {
    await capture(page, testInfo, "categories", "/categories");
  });

  test("category-detail", async ({ page }, testInfo) => {
    await page.goto("/categories", { waitUntil: "load", timeout: 15_000 });
    await page.waitForTimeout(2_000);

    const links = await page.locator("a[href^='/categories/']").all();
    let href: string | null = null;
    for (const link of links) {
      const value = await link.getAttribute("href").catch(() => null);
      if (value && value.split("/").filter(Boolean).length === 2) {
        href = value;
        break;
      }
    }

    await capture(page, testInfo, "category-detail", href ?? "/categories");
  });

  test("category-keyword-group", async ({ page }, testInfo) => {
    await page.goto("/categories", { waitUntil: "load", timeout: 15_000 });
    await page.waitForTimeout(2_000);
    const links = page.locator("a[href^='/categories/']");
    const count = await links.count();
    const href =
      count >= 2
        ? await links.nth(1).getAttribute("href").catch(() => null)
        : null;
    await capture(page, testInfo, "category-keyword-group", href ?? "/categories");
  });

  test("add-items", async ({ page }, testInfo) => {
    await capture(page, testInfo, "add-items", "/items/add");
  });

  test("add-new-item", async ({ page }, testInfo) => {
    await capture(page, testInfo, "add-new-item", "/add-new-item");
  });

  test("bulk-create-items", async ({ page }, testInfo) => {
    await capture(page, testInfo, "bulk-create-items", "/items/bulk-create");
  });

  test("study-guide", async ({ page }, testInfo) => {
    await capture(page, testInfo, "study-guide", "/study-guide");
  });

  test("study-guide-import", async ({ page }, testInfo) => {
    await ensureStudyGuideSaved(page);
    await safeGoto(
      page,
      "/study-guide/import?category=geography&keywords=capitals,world&sets=2"
    );
    await clickConsentIfPresent(page);
    await waitForAnyVisible(page, [
      "#study-guide-import-scope-category",
      "button:has-text('Create prompt sets')",
      "text=Using study guide:",
    ]);
    await captureCurrentPage(page, testInfo, "study-guide-import");
  });

  test("collections-mine", async ({ page }, testInfo) => {
    await capture(page, testInfo, "collections-mine", "/collections", [
      "button:has-text('New collection')",
      "button[title='Edit collection']",
    ]);
  });

  test("collections-discover", async ({ page }, testInfo) => {
    await capture(page, testInfo, "collections-discover", "/collections?tab=discover");
  });

  test("collection-detail", async ({ page }, testInfo) => {
    await openCollectionByName(page, secondCollectionName);
    await captureCurrentPage(page, testInfo, "collection-detail");
  });

  test("about", async ({ page }, testInfo) => {
    await capture(page, testInfo, "about", "/about");
  });

  test("feedback", async ({ page }, testInfo) => {
    await capture(page, testInfo, "feedback", "/feedback");
  });

  test("nav-geography", async ({ page }, testInfo) => {
    await capture(page, testInfo, "nav-geography", "/categories/geography");
  });

  test("nav-geography-capitals", async ({ page }, testInfo) => {
    await capture(page, testInfo, "nav-geography-capitals", "/categories/geography/capitals");
  });

  test("nav-geography-capitals-world", async ({ page }, testInfo) => {
    await capture(
      page,
      testInfo,
      "nav-geography-capitals-world",
      "/categories/geography/capitals/world"
    );
  });

  test("mode-flashcards", async ({ page }, testInfo) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await clickMode(page, "flashcards");
    await captureCurrentPage(page, testInfo, "mode-flashcards");
  });

  test("mode-quiz", async ({ page }, testInfo) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await clickMode(page, "quiz");
    await captureCurrentPage(page, testInfo, "mode-quiz");
  });

  test("items-add-to-collection", async ({ page }, testInfo) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);
    await waitForCategoryItemsLoaded(page);
    await captureCurrentPage(page, testInfo, "items-add-to-collection");
  });

  test("items-collection-badges", async ({ page }, testInfo) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);
    await waitForCategoryItemsLoaded(page);
    await addFirstItemsToActiveCollection(page, 3);
    await captureCurrentPage(page, testInfo, "items-collection-badges");
  });

  test("items-collection-removed", async ({ page }, testInfo) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);
    await waitForCategoryItemsLoaded(page);

    let removeButtons = page.locator("button[title*='Remove from ']");
    if ((await removeButtons.count()) === 0) {
      await page.locator("button[title*='Add to ']").first().click().catch(() => {});
      await waitForUiToSettle(page);
      removeButtons = page.locator("button[title*='Remove from ']");
    }

    await removeButtons.first().click().catch(() => {});
    await waitForUiToSettle(page);
    await captureCurrentPage(page, testInfo, "items-collection-removed");
  });

  test("active-collection-selector", async ({ page }, testInfo) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);
    await waitForCategoryItemsLoaded(page);
    await ensureSecondCollectionIsActive(page, secondCollectionName);
    await captureCurrentPage(page, testInfo, "active-collection-selector");
    await closeManageCollectionsDialog(page);
    await addFirstItemsToActiveCollection(page, 2);
  });

  test("collection-new", async ({ page }, testInfo) => {
    await safeGoto(page, "/collections");
    await page
      .getByRole("button", { name: /new collection/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_000);
    await page.locator("#collection-name").fill("My Second Collection").catch(() => {});
    await captureCurrentPage(page, testInfo, "collection-new");
    await page
      .getByRole("button", { name: /^create$/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_500);
  });

  test("collections-mine-two", async ({ page }, testInfo) => {
    await capture(page, testInfo, "collections-mine-two", "/collections", [
      "button[title='Edit collection']",
      "button[title='Active collection']",
    ]);
  });

  test("keyword-filter", async ({ page }, testInfo) => {
    await applyKeywordFilterWithResults(page);
    await captureCurrentPage(page, testInfo, "keyword-filter");
  });

  test("item-detail", async ({ page }, testInfo) => {
    await openFirstCategoryItemDetail(page);
    await captureCurrentPage(page, testInfo, "item-detail");
  });

  test("item-rating-five-stars", async ({ page }, testInfo) => {
    await openFirstCategoryItemDetail(page);
    await rateCurrentItemFiveStars(page);
    await captureCurrentPage(page, testInfo, "item-rating-five-stars");
  });

  test("item-comment-added", async ({ page }, testInfo) => {
    await openFirstCategoryItemDetail(page);
    await addCommentForCurrentItem(page, USER_GUIDE_COMMENT_TEXT);
    await waitForAnyVisible(page, ["[role='dialog']", `text=${USER_GUIDE_COMMENT_TEXT}`]);
    await captureCurrentPage(page, testInfo, "item-comment-added");
  });

  test("collection-detail-flashcards", async ({ page }, testInfo) => {
    await openCollectionByName(page, secondCollectionName);
    await clickMode(page, "flashcards");
    await captureCurrentPage(page, testInfo, "collection-detail-flashcards");
  });

  test("collection-detail-quiz", async ({ page }, testInfo) => {
    await openCollectionByName(page, secondCollectionName);
    await clickMode(page, "quiz");
    await waitForCollectionQuizModeLoaded(page);
    await captureCurrentPage(page, testInfo, "collection-detail-quiz");
  });

  test("collection-settings-public", async ({ page }, testInfo) => {
    await safeGoto(page, "/collections");
    await waitForCollectionsPageLoaded(page);

    const card = page.locator(collectionCardXPath(secondCollectionName)).first();
    await card.locator("button[title='Edit collection']").click().catch(() => {});
    await waitForAnyVisible(page, ["text=Edit Collection", "#edit-collection-is-public"]);
    await waitForInputValue(page, "#edit-collection-name", secondCollectionName);

    const publicToggle = page.locator("#edit-collection-is-public");
    const isChecked = await publicToggle.isChecked().catch(() => false);
    if (!isChecked) {
      await publicToggle.check().catch(() => {});
    }

    await captureCurrentPage(page, testInfo, "collection-settings-public");

    await page.getByRole("button", { name: /^save$/i }).click().catch(() => {});
    await waitForTextToDisappear(page, /saving/i);
    await waitForCollectionsPageLoaded(page);
  });

  test("collections-discover-public", async ({ page }, testInfo) => {
    await capture(page, testInfo, "collections-discover-public", "/collections?tab=discover");
  });

  test("collection-bookmark", async ({ page }, testInfo) => {
    await safeGoto(page, "/collections?tab=discover");
    await page
      .locator("button[title*='Bookmark']")
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_000);
    await captureCurrentPage(page, testInfo, "collection-bookmark");
  });

  test("collections-bookmarked", async ({ page }, testInfo) => {
    await capture(page, testInfo, "collections-bookmarked", "/collections?tab=bookmarked");
  });

  test("add-items-prepopulated", async ({ page }, testInfo) => {
    await openScopedAddItemsPage(page);
    await waitForSelectValue(page, "#add-hub-scope-category", "geography");
    await waitForSelectValue(page, "#add-hub-scope-rank1", "capitals");
    await waitForSelectValue(page, "#add-hub-scope-rank2", "world");
    await captureCurrentPage(page, testInfo, "add-items-prepopulated");
  });

  test("bulk-create-prompt", async ({ page }, testInfo) => {
    await safeGoto(page, "/items/bulk-create?category=geography&keywords=capitals,world");
    await page
      .getByRole("button", { name: /generate ai prompt/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(2_500);
    await captureCurrentPage(page, testInfo, "bulk-create-prompt");
  });

  test("bulk-create-paste", async ({ page }, testInfo) => {
    await safeGoto(page, "/items/bulk-create?category=geography&keywords=capitals,world");
    await page
      .getByRole("button", { name: /generate ai prompt/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_500);
    await page
      .getByRole("button", { name: /i pasted the response/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_000);
    await page.locator("textarea").first().fill(BULK_AI_RESPONSE).catch(() => {});
    await captureCurrentPage(page, testInfo, "bulk-create-paste");
  });

  test("bulk-create-review", async ({ page }, testInfo) => {
    await safeGoto(page, "/items/bulk-create?category=geography&keywords=capitals,world");
    await page
      .getByRole("button", { name: /generate ai prompt/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_500);
    await page
      .getByRole("button", { name: /i pasted the response/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_000);
    await page.locator("textarea").first().fill(BULK_AI_RESPONSE).catch(() => {});
    await page
      .getByRole("button", { name: /import.*review/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(2_000);
    await captureCurrentPage(page, testInfo, "bulk-create-review");
  });

  test("study-guide-no-guide", async ({ page }, testInfo) => {
    await ensureStudyGuideDeleted(page);
    await capture(page, testInfo, "study-guide-no-guide", "/study-guide/import");
  });

  test("study-guide-content", async ({ page }, testInfo) => {
    await ensureSignedIn(page);
    await safeGoto(page, "/study-guide");
    await waitForAnyVisible(page, ["#sg-title", "#sg-content"]);
    await page.locator("#sg-title").fill("Capitals Study Guide").catch(() => {});
    await page.locator("#sg-content").fill(STUDY_GUIDE_TEXT).catch(() => {});
    await page.getByRole("button", { name: /save/i }).click().catch(() => {});
    await waitForTextToDisappear(page, /saving/i);
    await waitForUiToSettle(page);
    await waitForAnyVisible(page, ["button:has-text('Continue to prompt sets')", "#sg-content"]);
    await captureCurrentPage(page, testInfo, "study-guide-content");
  });

  test("study-guide-import-prompts", async ({ page }, testInfo) => {
    await ensurePromptSetsExist(page);
    await captureCurrentPage(page, testInfo, "study-guide-import-prompts");
  });

  test("study-guide-import-first-prompt", async ({ page }, testInfo) => {
    await ensurePromptSetsExist(page);
    await page
      .locator(".font-mono, pre, code")
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await waitForUiToSettle(page);
    await captureCurrentPage(page, testInfo, "study-guide-import-first-prompt");
  });
});

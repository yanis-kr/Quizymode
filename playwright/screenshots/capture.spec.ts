import { test, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const screenshotDir = path.resolve(
  process.cwd(),
  "docs/user-guide/screenshots/user"
);

const HOME_SAMPLE_COLLECTION_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";
const HOME_SAMPLE_COLLECTION_SLUG = "sample+collection";
const HOME_SAMPLE_COLLECTION_DETAIL_PATH = `/collections/${HOME_SAMPLE_COLLECTION_ID}/${HOME_SAMPLE_COLLECTION_SLUG}`;

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
  try {
    await page.goto(url, { waitUntil: "load", timeout: 20_000 });
    await page.waitForTimeout(2_000);
    return true;
  } catch {
    return false;
  }
}

async function capture(page: Page, slug: string, url: string, waitFor?: string) {
  fs.mkdirSync(screenshotDir, { recursive: true });

  await safeGoto(page, url);
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 8_000 }).catch(() => {});
  }

  await captureCurrentPage(page, slug);
}

async function captureCurrentPage(page: Page, slug: string) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page
    .screenshot({
      path: path.join(screenshotDir, `${slug}.png`),
      fullPage: true,
    })
    .catch(() => {});
}

async function clickMode(page: Page, modeName: string) {
  await page
    .getByRole("tab", { name: new RegExp(modeName, "i") })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(1_500);
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

test.describe("User guide screenshots", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(30_000);

  test("home", async ({ page }) => {
    await capture(page, "home", "/");
  });

  test("categories", async ({ page }) => {
    await capture(page, "categories", "/categories");
  });

  test("category-detail", async ({ page }) => {
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

    await capture(page, "category-detail", href ?? "/categories");
  });

  test("category-keyword-group", async ({ page }) => {
    await page.goto("/categories", { waitUntil: "load", timeout: 15_000 });
    await page.waitForTimeout(2_000);
    const links = page.locator("a[href^='/categories/']");
    const count = await links.count();
    const href =
      count >= 2
        ? await links.nth(1).getAttribute("href").catch(() => null)
        : null;
    await capture(page, "category-keyword-group", href ?? "/categories");
  });

  test("add-items", async ({ page }) => {
    await capture(page, "add-items", "/items/add");
  });

  test("add-new-item", async ({ page }) => {
    await capture(page, "add-new-item", "/add-new-item");
  });

  test("bulk-create-items", async ({ page }) => {
    await capture(page, "bulk-create-items", "/items/bulk-create");
  });

  test("study-guide", async ({ page }) => {
    await capture(page, "study-guide", "/study-guide");
  });

  test("study-guide-import", async ({ page }) => {
    await capture(page, "study-guide-import", "/study-guide/import");
  });

  test("collections-mine", async ({ page }) => {
    await capture(page, "collections-mine", "/collections");
  });

  test("collections-discover", async ({ page }) => {
    await capture(page, "collections-discover", "/collections?tab=discover");
  });

  test("collection-detail", async ({ page }) => {
    await capture(page, "collection-detail", HOME_SAMPLE_COLLECTION_DETAIL_PATH);
  });

  test("about", async ({ page }) => {
    await capture(page, "about", "/about");
  });

  test("feedback", async ({ page }) => {
    await capture(page, "feedback", "/feedback");
  });

  test("nav-geography", async ({ page }) => {
    await capture(page, "nav-geography", "/categories/geography");
  });

  test("nav-geography-capitals", async ({ page }) => {
    await capture(page, "nav-geography-capitals", "/categories/geography/capitals");
  });

  test("nav-geography-capitals-world", async ({ page }) => {
    await capture(
      page,
      "nav-geography-capitals-world",
      "/categories/geography/capitals/world"
    );
  });

  test("mode-flashcards", async ({ page }) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await clickMode(page, "flashcards");
    await captureCurrentPage(page, "mode-flashcards");
  });

  test("mode-quiz", async ({ page }) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await clickMode(page, "quiz");
    await captureCurrentPage(page, "mode-quiz");
  });

  test("items-add-to-collection", async ({ page }) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);
    await captureCurrentPage(page, "items-add-to-collection");
  });

  test("items-collection-badges", async ({ page }) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);

    const addButtons = page.locator("button[title*='Add to ']");
    const total = await addButtons.count();
    for (let index = 0; index < Math.min(3, total); index += 1) {
      await addButtons.nth(index).click().catch(() => {});
      await page.waitForTimeout(600);
    }

    await page.waitForTimeout(1_000);
    await captureCurrentPage(page, "items-collection-badges");
  });

  test("items-collection-removed", async ({ page }) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);

    let removeButtons = page.locator("button[title*='Remove from ']");
    if ((await removeButtons.count()) === 0) {
      await page.locator("button[title*='Add to ']").first().click().catch(() => {});
      await page.waitForTimeout(1_000);
      removeButtons = page.locator("button[title*='Remove from ']");
    }

    await removeButtons.first().click().catch(() => {});
    await page.waitForTimeout(1_000);
    await captureCurrentPage(page, "items-collection-removed");
  });

  test("active-collection-selector", async ({ page }) => {
    await capture(page, "active-collection-selector", "/collections");
  });

  test("collection-new", async ({ page }) => {
    await safeGoto(page, "/collections");
    await page
      .getByRole("button", { name: /new collection/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_000);
    await page.locator("#collection-name").fill("My Second Collection").catch(() => {});
    await captureCurrentPage(page, "collection-new");
    await page
      .getByRole("button", { name: /^create$/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_500);
  });

  test("collections-mine-two", async ({ page }) => {
    await capture(page, "collections-mine-two", "/collections");
  });

  test("keyword-filter", async ({ page }) => {
    await safeGoto(page, "/categories/geography/capitals/world");
    await ensureListMode(page);
    await page
      .locator("button[title*='click to filter']")
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_500);
    await captureCurrentPage(page, "keyword-filter");
  });

  test("collection-detail-flashcards", async ({ page }) => {
    await openCollectionDetail(page);
    await clickMode(page, "flashcards");
    await captureCurrentPage(page, "collection-detail-flashcards");
  });

  test("collection-detail-quiz", async ({ page }) => {
    await openCollectionDetail(page);
    await clickMode(page, "quiz");
    await captureCurrentPage(page, "collection-detail-quiz");
  });

  test("collection-settings-public", async ({ page }) => {
    await openCollectionDetail(page, true);

    const toggle = page.getByRole("switch").first();
    const isPublic = (await toggle.getAttribute("aria-checked").catch(() => "false")) === "true";
    if (!isPublic) {
      await toggle.click().catch(() => {});
      await page.waitForTimeout(1_000);
    }

    await captureCurrentPage(page, "collection-settings-public");
  });

  test("collections-discover-public", async ({ page }) => {
    await capture(page, "collections-discover-public", "/collections?tab=discover");
  });

  test("collection-bookmark", async ({ page }) => {
    await safeGoto(page, "/collections?tab=discover");
    await page
      .locator("button[title*='Bookmark']")
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1_000);
    await captureCurrentPage(page, "collection-bookmark");
  });

  test("collections-bookmarked", async ({ page }) => {
    await capture(page, "collections-bookmarked", "/collections?tab=bookmarked");
  });

  test("add-items-prepopulated", async ({ page }) => {
    await capture(
      page,
      "add-items-prepopulated",
      "/items/add?category=geography&keywords=capitals,world"
    );
  });

  test("bulk-create-prompt", async ({ page }) => {
    await safeGoto(page, "/items/bulk-create?category=geography&keywords=capitals,world");
    await page
      .getByRole("button", { name: /generate ai prompt/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(2_500);
    await captureCurrentPage(page, "bulk-create-prompt");
  });

  test("bulk-create-paste", async ({ page }) => {
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
    await captureCurrentPage(page, "bulk-create-paste");
  });

  test("bulk-create-review", async ({ page }) => {
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
    await captureCurrentPage(page, "bulk-create-review");
  });

  test("study-guide-no-guide", async ({ page }) => {
    await capture(page, "study-guide-no-guide", "/study-guide/import");
  });

  test("study-guide-content", async ({ page }) => {
    await safeGoto(page, "/study-guide");
    await page.locator("textarea").first().fill(STUDY_GUIDE_TEXT).catch(() => {});
    await page.waitForTimeout(600);
    await captureCurrentPage(page, "study-guide-content");
    await page.getByRole("button", { name: /save/i }).click().catch(() => {});
    await page.waitForTimeout(1_500);
  });

  test("study-guide-import-prompts", async ({ page }) => {
    await safeGoto(
      page,
      "/study-guide/import?category=geography&keywords=capitals,world&sets=2"
    );
    await page
      .getByRole("button", { name: /create prompt sets/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(8_000);
    await captureCurrentPage(page, "study-guide-import-prompts");
  });

  test("study-guide-import-first-prompt", async ({ page }) => {
    await safeGoto(
      page,
      "/study-guide/import?category=geography&keywords=capitals,world&sets=2"
    );
    await page
      .locator(".font-mono, pre, code")
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.waitForTimeout(500);
    await captureCurrentPage(page, "study-guide-import-first-prompt");
  });
});

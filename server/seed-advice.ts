/**
 * Placeholder safety advice for demos and QA (US-8 / US-9 / US-10).
 *
 * Run with:  pnpm exec tsx server/seed-advice.ts            -> creates DRAFT items
 *            pnpm exec tsx server/seed-advice.ts --publish  -> also marks them PUBLISHED
 *
 * Everything here is generic, widely published guidance written ONLY so the
 * feature can be demonstrated and tested before the Pateros DRRM Office supplies
 * its own wording. Each item is stamped as a placeholder, and nothing is
 * published unless --publish is passed explicitly.
 */

import { getDb, logActivity } from "./db";
import { adviceCategories, normalizeAdviceSteps, uniqueAdviceSlug, type AdviceStepRecord } from "../shared/advice";
import { adviceSteps, safetyAdvice } from "../drizzle/schema";

const PLACEHOLDER_BANNER =
  "PLACEHOLDER — this wording must be reviewed and replaced by the Pateros DRRM Office before it is treated as official guidance.";

type SeedStep = AdviceStepRecord;

type SeedAdvice = {
  slugBase: string;
  category: keyof typeof adviceCategories;
  title: string;
  titleFilipino: string;
  summary: string;
  summaryFilipino: string;
  body: string;
  bodyFilipino: string;
  steps: SeedStep[];
};

const seedAdvice: SeedAdvice[] = [
  {
    slugBase: "what-to-do-during-earthquake-shaking",
    category: "EARTHQUAKE",
    title: "What to do while the ground is shaking",
    titleFilipino: "Ano ang gagawin habang lumalakad ang lupa",
    summary:
      "Drop, cover, and hold on. Stay away from windows and heavy furniture until the shaking stops.",
    summaryFilipino:
      "Magtumba, takpan, at hawakan. Lumayo sa mga bintana at mabigat na kasbao hanggang tumigil ang paglalakad.",
    body: `${PLACEHOLDER_BANNER}\n\nIf you are indoors, drop to your hands and knees, cover your head and neck with your arms, and hold on to a sturdy table. Move away from windows, mirrors, and tall furniture.\n\nIf you are outdoors, stay in the open area away from buildings, walls, and power lines.\n\nIf you are in a vehicle, pull over clear of buildings and overpasses, and stay inside the vehicle.\n\nWhen the shaking stops, move out of the building using the stairs, not the elevator, and watch for hazards such as fallen wires, broken glass, and damaged walls.`,
    bodyFilipino: `${PLACEHOLDER_BANNER}\n\nKung nasa loob ng bahay, magpatumba sa mga kamay at tuhod, takpan ang ulo at leeg gamit ang mga braso, at hawakan ang matibay na mesa. Lumayo sa mga bintana, salamin, at matatayong kasbao.\n\nKung nasa labas, manatili sa bukas na lugar at lumayo sa mga gusali, pader, at kable.\n\nKung nasa sasakyan, ihinto sa ligtas na lugar at lumayo sa mga gusali at flyover.\n\nPagkatapos tumigil, lumabas gamit ang hagdan at hindi ang elevator, at mag-ingat sa mga bantas na mga wire, basang salamin, at nasirang dingding.`,
    steps: [
      {
        title: "Drop, cover and hold on",
        titleFilipino: "Magtumba, takpan, at hawakan",
        instruction:
          "Get down low on your hands and knees. Cover your head and neck with your arms or under a sturdy table. Hold on until the shaking stops.",
        instructionFilipino:
          "Magpatumba sa mababang lugar gamit ang mga kamay at tuhod. Takpan ang ulo at leeg gamit ang mga braso o sa ilalim ng matibay na mesa. Hawakan hangga't tumigil.",
      },
      {
        title: "Stay clear of glass and heavy furniture",
        titleFilipino: "Lumayo sa salamin at mabigat na kasbao",
        instruction:
          "Move away from windows, mirrors, shelves, and cabinets. Cover your head with a pillow or bag if one is within reach.",
        instructionFilipino:
          "Lumayo sa mga bintana, salamin, istante, at kabinet. Takpan ang ulo ng unan o bag kung nasa reach.",
      },
      {
        title: "When it stops, use the stairs",
        titleFilipino: "Pagkatapos tumigil, gamitin ang hagdan",
        instruction:
          "Leave the building calmly using stairs. Do not use the elevator. Watch for fallen power lines, broken glass, and damaged walls.",
        instructionFilipino:
          "Umexit nang kalmado gamit ang hagdan. Huwag gamitin ang elevator. Mag-ingat sa nakatugong kable, basang salamin, at nasirang dingding.",
      },
    ],
  },
  {
    slugBase: "what-to-do-during-a-storm-or-typhoon",
    category: "STORM",
    title: "What to do during a storm or typhoon",
    titleFilipino: "Ano ang gagawin sa panahon ng bagyo",
    summary:
      "Stay indoors, keep an emergency kit ready, and never cross a flooded street to reach safety.",
    summaryFilipino:
      "Manatili sa loob, ihanda ang emergency kit, at huwag kailanman lumipat sa naubos na kalye para makarating sa ligtas na lugar.",
    body: `${PLACEHOLDER_BANNER}\n\nStay indoors when strong winds begin. Keep away from windows and keep one hand on a sturdy structure.\n\nPrepare an emergency kit with drinking water, dry food, medicines, a flashlight, spare batteries, and charged power banks.\n\nIf heavy rain causes flooding, do not walk or drive through moving water. Turn around and find a higher route. Avoid downed power lines, which may still be live.\n\nAfter the storm, watch official announcements before returning, and check for fallen branches, broken glass, and structural damage before re-entering a building.`,
    bodyFilipino: `${PLACEHOLDER_BANNER}\n\nManatili sa loob kapag nagsimula ang malakas na hangin. Lumayo sa mga bintana at maghawak sa matibay na istruktura.\n\nIhanda ang emergency kit na may inuming tubig, tuyong pagkain, gamot, flashlight, spare na baterya, at naka-charge na power bank.\n\nKapag nagdulot ng malakas na ulan at baha, huwag maglakad o magmaneho sa umaagos na tubig. Lumiko at humanap ng mas mataas na ruta. Iwasan ang nakatugong kable, posibleng may kuryente pa.\n\nPagkatapos ng bagyo, sundin ang opisyal na abiso bago bumalik, at suriin ang mga nakatugong sanga, basang salamin, at sirang gusali bago pumasok.`,
    steps: [
      {
        title: "Prepare an emergency kit",
        titleFilipino: "Ihanda ang emergency kit",
        instruction:
          "Keep drinking water, dry food, medicines, a flashlight, spare batteries, and a charged power bank in one bag you can grab quickly.",
        instructionFilipino:
          "Ilagay sa isang bag ang inuming tubig, tuyong pagkain, gamot, flashlight, spare na baterya, at naka-charge na power bank.",
      },
      {
        title: "Stay away from windows",
        titleFilipino: "Lumayo sa mga bintana",
        instruction:
          "Move into an interior room. Flying debris is the most common cause of injury during strong winds.",
        instructionFilipino:
          "Lumipat sa silid sa loob. Ang mga lumilipad na labi ang pinakakaraming sanhi ng pinsala sa malakas na hangin.",
      },
      {
        title: "Never cross floodwater",
        titleFilipino: "Huwag kailanman lumipat sa baha",
        instruction:
          "Do not walk or drive through moving or rising water. Six inches of moving water can knock a person down; two feet can carry away a small vehicle.",
        instructionFilipino:
          "Huwag maglakad o magmaneho sa umaagos o tumataas na tubig. Anim na pulgada ng umaagos na tubig ang makakapagpatumble ng tao; dalawang paanan ay maaaring magdala ng maliit na sasakyan.",
      },
    ],
  },
  {
    slugBase: "what-to-do-when-a-fire-breaks-out",
    category: "FIRE",
    title: "What to do when a fire breaks out",
    titleFilipino: "Ano ang gagawin kapag nag-aapoy sa bahay",
    summary:
      "Get out first, close the door behind you, and call 911 from a safe distance. Never go back inside.",
    summaryFilipino:
      "Lumabas muna, isara ang pinto sa likod mo, at tumawag sa 911 mula sa ligtas na distansya. Huwag kailanman bumalik sa loob.",
    body: `${PLACEHOLDER_BANNER}\n\nIf you discover a fire, get everyone out and close the door behind you. Closing the door slows the spread of fire and smoke.\n\nCall 911 from outside the building, or send someone to call while you stay clear.\n\nNever use an elevator during a fire. Do not go back inside for belongings or pets.\n\nAfter leaving, check for burns or breathing problems. Cover burns with clean dry cloth. Anyone with breathing trouble, dizziness, or burns should be treated immediately, even if the injury looks small.`,
    bodyFilipino: `${PLACEHOLDER_BANNER}\n\nKung may nahanap kang sunog, ipaabot ang lahat sa labas at isara ang pinto sa likod mo. Ang pagtatakda ng pinto ay nagpapabagal ng pagkalat ng sunog at usok.\n\nTumawag sa 911 mula sa labas ng gusali, o magpadala sa ibang tao na tumawag habang ikaw ay nasa ligtas na lugar.\n\nHuwag kailanman gumamit ng elevator kapag may sunog. Huwag bumalik sa loob para sa mga bagay o alaga.\n\nPagkatapos umalis, tingnan ang may pason o problema sa paghinga. Takpan ang pason ng malinis at tuyong tela. Bigyan ng agarang paggamot ang sinumang may hirap sa paghinga, pag-iilo, o pason, kahit mukhang maliit ang pinsala.`,
    steps: [
      {
        title: "Get out and close the door",
        titleFilipino: "Lumabas at isara ang pinto",
        instruction:
          "Wake everyone and leave by the nearest safe exit. Close the door behind you to slow the fire and smoke.",
        instructionFilipino:
          "Gisingin ang lahat at lumabas sa pinakamalapit na ligtas na exit. Isara ang pinto sa likod mo para mapabilis ang sunog at usok.",
      },
      {
        title: "Call 911 from outside",
        titleFilipino: "Tumawag sa 911 mula sa labas",
        instruction:
          "Move well away from the building before you call. Give the exact address, the nearest landmark, and whether anyone may still be inside.",
        instructionFilipino:
          "Lumayo nang malayo sa gusali bago tumawag. Ibigay ang eksaktong address, pinakamalapit na tanaw, at kung may nasa loob pa.",
      },
      {
        title: "Do not go back inside",
        titleFilipino: "Huwag bumalik sa loob",
        instruction:
          "Stay out. Do not re-enter for belongings or pets. Smoke and toxic gases cause most fire deaths, often before flames arrive.",
        instructionFilipino:
          "Manatili sa labas. Huwag bumalik para sa mga bagay o alaga. Ang usok at lasonikad na gas ang sanhi ng karamihan sa mga pagkamatay sa sunog, kadalasan bago dumating ang apoy.",
      },
    ],
  },
];

async function main() {
  const publish = process.argv.includes("--publish");
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL is not set, so there is nothing to seed.");
    process.exitCode = 1;
    return;
  }

  const existing = await db.select({ slug: safetyAdvice.slug }).from(safetyAdvice);
  const knownSlugs = existing.map(row => row.slug);
  const existingSlugs = new Set(knownSlugs);

  let created = 0;
  let skipped = 0;
  for (const item of seedAdvice) {
    const slug = uniqueAdviceSlug(item.slugBase, knownSlugs);
    if (existingSlugs.has(slug)) {
      skipped += 1;
      continue;
    }
    const [row] = await db
      .insert(safetyAdvice)
      .values({
        slug,
        category: item.category,
        title: item.title,
        titleFilipino: item.titleFilipino,
        summary: item.summary,
        summaryFilipino: item.summaryFilipino,
        body: item.body,
        bodyFilipino: item.bodyFilipino,
        status: publish ? "PUBLISHED" : "DRAFT",
        isEmergency: false,
        sortOrder: seedAdvice.indexOf(item),
        publishedAt: publish ? new Date() : null,
      })
      .$returningId();
    const steps = normalizeAdviceSteps(item.steps);
    if (steps.length > 0) {
      await db.insert(adviceSteps).values(
        steps.map((step, index) => ({
          adviceId: row.id,
          stepNo: index + 1,
          title: step.title?.trim() || null,
          titleFilipino: step.titleFilipino?.trim() || null,
          instruction: step.instruction?.trim() || null,
          instructionFilipino: step.instructionFilipino?.trim() || null,
        })),
      );
    }
    knownSlugs.push(slug);
    existingSlugs.add(slug);
    created += 1;
    console.log(`${publish ? "published" : "drafted"}  ${slug}`);
  }

  await logActivity({
    action: "SEED",
    entityType: "safety_advice",
    metadata: `seeded ${created}, skipped ${skipped}, publish=${publish}`,
  });

  console.log(`\n${created} created, ${skipped} skipped.`);
  if (!publish)
    console.log(
      "Everything is a DRAFT placeholder. Review the wording, then press Publish in the app.",
    );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
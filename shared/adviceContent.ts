/**
 * Built-in safety advice shown on the citizen home page.
 *
 * Client change (backlog §13, 2026-10-06): the resident-facing advice must
 * always show guidance per disaster type with tips, with nothing for an admin
 * to upload or edit. Content therefore lives here - a static, typed list - and
 * the server feed / cached feed win over it only when officials have published
 * real guidance. Bilingual convention matches the rest of the advice domain:
 * English is the source text, Filipino is the full translation, and both are
 * required here so the tips never render half-translated.
 *
 * Wording was drafted from official PAGASA / NDRRMC / OCD guidance and
 * reviewed and approved by the user on 2026-10-06 before shipping.
 */

import type { AdviceCategory, AdviceRecord, AdviceStepRecord } from "./advice";

export type BuiltinAdviceItem = AdviceRecord & {
  category: AdviceCategory;
  titleFilipino: string;
  summaryFilipino: string;
  bodyFilipino: string;
  isEmergency: boolean;
  sortOrder: number;
  status: "PUBLISHED";
  steps: AdviceStepRecord[];
};

/**
 * Negative ids so built-in items can never collide with database rows, since
 * the same component keys its list off the record id.
 */
export const builtinAdvice: BuiltinAdviceItem[] = [
  {
    id: -1,
    slug: "earthquake-safety",
    category: "EARTHQUAKE",
    title: "Earthquake Safety",
    titleFilipino: "Kaligtasan sa Lindol",
    summary:
      "Drop, cover, and hold on during shaking. Stay away from windows and falling objects.",
    summaryFilipino:
      "Dapa, takpan, at kumapit habang may yugyog. Lumayo sa mga bintana at mga bagay na maaaring mahulog.",
    body:
      "During shaking: drop to your hands and knees, cover your head and neck under a sturdy table, and hold on until the shaking stops. If you are outdoors, move to an open area away from buildings, trees, and power lines. Do not run outside while the ground is shaking. After: check for injuries, expect aftershocks, stay clear of damaged buildings, and never use elevators.",
    bodyFilipino:
      "Habang lumilindol: dumapa at takpan ang ulo at leeg sa ilalim ng matibay na mesa, at kumapit hanggang huminto ang pagyanig. Kung nasa labas, lumipat sa bukas na lugar, malayo sa mga gusali, puno, at poste. Huwag lumabas habang nanginginig ang lupa. Pagkatapos: tingnan kung may nasugatan, maghanda para sa aftershock, lumayo sa mga sirang gusali, at huwag gumamit ng elevator.",
    isEmergency: true,
    sortOrder: 1,
    status: "PUBLISHED",
    steps: [
      { instruction: "Drop, cover, and hold on.", instructionFilipino: "Dapa, takpan, at kumapit." },
      { instruction: "Stay indoors until the shaking stops.", instructionFilipino: "Manatili sa loob hanggang huminto ang pagyanig." },
      { instruction: "If you are outside, move to open ground.", instructionFilipino: "Kung nasa labas, pumunta sa bukas na lugar." },
      { instruction: "Expect aftershocks and check for injuries.", instructionFilipino: "Mag-ingat sa aftershock at tingnan kung may nasugatan." },
    ],
  },
  {
    id: -2,
    slug: "storm-typhoon-safety",
    category: "STORM",
    title: "Storm and Typhoon Safety",
    titleFilipino: "Kaligtasan sa Bagyo",
    summary:
      "Listen to official warnings. Prepare food, water, and supplies before the storm arrives.",
    summaryFilipino:
      "Makinig sa opisyal na babala. Maghanda ng pagkain, tubig, at iba pang pangangailangan bago dumating ang bagyo.",
    body:
      "Before: monitor PAGASA bulletins, secure loose items, and store drinking water, food, a flashlight, a radio, and power banks. Know your nearest evacuation center. During: stay indoors and away from windows, and never walk or drive through floodwater. After: check for damage, watch for fallen power lines, and expect power interruptions.",
    bodyFilipino:
      "Bago ang bagyo: subaybayan ang mga babala ng PAGASA, ayusin ang mga bagay na maaaring tangayin, at mag-imbak ng inuming tubig, pagkain, flashlight, radyo, at power bank. Alamin ang pinakamalapit na evacuation center. Habang may bagyo: manatili sa loob at lumayo sa mga bintana, at huwag maglakad o magmaneho sa baha. Pagkatapos: tingnan ang mga pinsala, mag-ingat sa mga natumbang kawad ng kuryente, at maghanda sa power interruption.",
    isEmergency: true,
    sortOrder: 2,
    status: "PUBLISHED",
    steps: [
      { instruction: "Monitor official warnings (PAGASA).", instructionFilipino: "Subaybayan ang opisyal na babala (PAGASA)." },
      { instruction: "Prepare supplies.", instructionFilipino: "Maghanda ng mga pangangailangan." },
      { instruction: "Stay indoors and away from windows.", instructionFilipino: "Manatili sa loob at lumayo sa mga bintana." },
      { instruction: "Avoid floodwater and fallen wires.", instructionFilipino: "Iwasan ang baha at mga natumbang kawad." },
    ],
  },
  {
    id: -3,
    slug: "flood-safety",
    category: "FLOOD",
    title: "Flood Safety",
    titleFilipino: "Kaligtasan sa Baha",
    summary:
      "Move to high ground when floodwater rises. Never walk or drive through moving water.",
    summaryFilipino:
      "Pumunta sa mataas na lugar kapag tumataas ang tubig. Huwag kailanman maglakad o magmaneho sa umaagos na tubig.",
    body:
      "Do not wade or drive through floodwater, even if it looks shallow - currents can sweep away people and vehicles. Turn off electricity and gas if water enters your home. Move valuables and documents to higher shelves. If trapped in a building, go to the highest floor and call for help (911). After: wait for officials to say it is safe, and watch for diseases from contaminated water.",
    bodyFilipino:
      "Huwag tumawid o magmaneho sa baha, kahit mababaw ito - kayang tangayin ng agos ang tao at sasakyan. Patayin ang kuryente at gas kung papasok ang tubig sa bahay. Ilipat sa mataas na bahagi ang mahahalagang gamit at dokumento. Kung naipit sa gusali, pumunta sa pinakamataas na palapag at tumawag ng tulong (911). Pagkatapos: maghintay ng opisyal na pahintulot bago bumalik at mag-ingat sa mga sakit na dulot ng maruming tubig.",
    isEmergency: true,
    sortOrder: 3,
    status: "PUBLISHED",
    steps: [
      { instruction: "Go to higher ground.", instructionFilipino: "Pumunta sa mataas na lugar." },
      { instruction: "Never walk or drive through floodwater.", instructionFilipino: "Huwag lumakad o magmaneho sa baha." },
      { instruction: "Raise valuables and turn off power.", instructionFilipino: "Itaas ang mahahalagang gamit at patayin ang kuryente." },
      { instruction: "Wait for the all-clear before returning.", instructionFilipino: "Maghintay ng all-clear bago bumalik." },
    ],
  },
  {
    id: -4,
    slug: "fire-safety",
    category: "FIRE",
    title: "Fire Safety",
    titleFilipino: "Kaligtasan sa Sunog",
    summary:
      "If fire breaks out, get out, stay out, and call for help. Know your exits.",
    summaryFilipino:
      "Kung may sunog, lumabas, manatili sa labas, at humingi ng tulong. Alamin ang mga labasan.",
    body:
      "If the fire is small and safe to approach, put it out if you can (PASS: Pull, Aim, Squeeze, Sweep). If the fire grows, leave immediately, close doors behind you, and stay low to avoid smoke. Feel a door before opening it - if it is hot, use another exit. Never use elevators. Call 911 or the fire station. Once out, do not go back inside.",
    bodyFilipino:
      "Kung maliit pa ang apoy at ligtas lapitan, patayin ito kung kaya (Pull, Aim, Squeeze, Sweep). Kung lumalaki ang apoy, lumabas agad, isara ang mga pinto sa likod mo, at manatili sa mababang bahagi para iwasan ang usok. Damhin ang pinto bago buksan - kung mainit, gumamit ng ibang labasan. Huwag gumamit ng elevator. Tumawag sa 911 o sa fire station. Kapag nakalabas na, huwag nang bumalik sa loob.",
    isEmergency: true,
    sortOrder: 4,
    status: "PUBLISHED",
    steps: [
      { instruction: "Get out and stay out.", instructionFilipino: "Lumabas at manatili sa labas." },
      { instruction: "Stay low to avoid smoke.", instructionFilipino: "Manatili sa mababang bahagi para iwasan ang usok." },
      { instruction: "Never use elevators.", instructionFilipino: "Huwag gumamit ng elevator." },
      { instruction: "Call 911 or the fire station.", instructionFilipino: "Tumawag sa 911 o sa fire station." },
    ],
  },
  {
    id: -5,
    slug: "general-preparedness",
    category: "GENERAL",
    title: "General Emergency Preparedness",
    titleFilipino: "Pangkalahatang Paghahanda",
    summary:
      "Know the risks in your area, prepare a family emergency plan and kit, and follow official instructions.",
    summaryFilipino:
      "Alamin ang mga panganib sa inyong lugar, maghanda ng plano at emergency kit para sa pamilya, at sundin ang opisyal na tagubilin.",
    body:
      "Know the hazards in your barangay and your nearest evacuation center. Prepare an emergency kit: water, food, flashlight, radio, power bank, medicines, and copies of documents. Agree on a family plan: a meeting place and contact numbers. Keep emergency numbers handy (911, barangay). Follow barangay and DRRM instructions. Help neighbours who are elderly or have disabilities.",
    bodyFilipino:
      "Alamin ang mga panganib sa inyong barangay at ang pinakamalapit na evacuation center. Maghanda ng emergency kit: tubig, pagkain, flashlight, radyo, power bank, mga gamot, at kopya ng mga dokumento. Gumawa ng plano ng pamilya: meeting place at mga contact number. Itago ang mga emergency number (911, barangay). Sundin ang mga tagubilin ng barangay at DRRM. Tulungan ang mga kapitbahay na matatanda o may kapansanan.",
    isEmergency: false,
    sortOrder: 5,
    status: "PUBLISHED",
    steps: [
      { instruction: "Know your hazards and evacuation center.", instructionFilipino: "Alamin ang mga panganib at evacuation center." },
      { instruction: "Prepare an emergency kit.", instructionFilipino: "Maghanda ng emergency kit." },
      { instruction: "Agree on a family meeting place.", instructionFilipino: "Sumang-ayon sa meeting place ng pamilya." },
      { instruction: "Keep emergency numbers handy.", instructionFilipino: "Itago ang mga emergency number." },
    ],
  },
];
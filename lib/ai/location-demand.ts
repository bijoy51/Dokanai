/**
 * Location-aware demand hints.
 *
 * Pure function. Given the shop's category + nearby venue type, returns a
 * list of product types (with bilingual labels) that are likely to over-
 * index for that combination, plus a one-line rationale. We deliberately
 * keep this rule-based and offline so it's deterministic and free to call
 * on every Overview render — same design intent as the Market Trends panel.
 *
 * The rules are an opinionated starter set drawn from common SME patterns
 * in Bangladesh. They can be tuned by editing the RULES table below.
 */
import type { ShopProfile, ShopType, VenueType } from "@/lib/data/shop-profile";

export interface ProductHint {
  /** Short product-type label, English. */
  en: string;
  /** Short product-type label, Bangla. */
  bn: string;
}

export interface LocationHint {
  /** Product types the shopkeeper should over-stock for this profile. */
  items: ProductHint[];
  /** One-line plain-text reason, English. */
  reasonEn: string;
  /** One-line plain-text reason, Bangla. */
  reasonBn: string;
}

type Key = `${ShopType}|${VenueType}`;

// ---------- pre-built product baskets reused across rules ----------

const SCHOOL_GROCERY: ProductHint[] = [
  { en: "Snacks & chips", bn: "চিপস ও স্ন্যাক্স" },
  { en: "Biscuits & cookies", bn: "বিস্কুট ও কুকিজ" },
  { en: "Chocolate & candy", bn: "চকলেট ও ক্যান্ডি" },
  { en: "Bottled water & juice", bn: "পানি ও জুসের বোতল" },
  { en: "Instant noodles", bn: "ইনস্ট্যান্ট নুডলস" },
  { en: "Notebooks & pencils", bn: "নোটবুক ও পেন্সিল" },
];

const RESIDENTIAL_GROCERY: ProductHint[] = [
  { en: "Rice & lentils (daal)", bn: "চাল ও ডাল" },
  { en: "Cooking oil & ghee", bn: "তেল ও ঘি" },
  { en: "Sugar, salt & spices", bn: "চিনি, লবণ ও মশলা" },
  { en: "Eggs & dairy", bn: "ডিম ও দুধ" },
  { en: "Fresh vegetables", bn: "তাজা সবজি" },
  { en: "Cleaning supplies", bn: "ক্লিনিং সাপ্লাই" },
];

const OFFICE_GROCERY: ProductHint[] = [
  { en: "Ready-to-eat lunch packs", bn: "রেডি লাঞ্চ প্যাক" },
  { en: "Tea, coffee & instant mixes", bn: "চা, কফি ও ইনস্ট্যান্ট মিক্স" },
  { en: "Energy drinks & juice", bn: "এনার্জি ড্রিংক ও জুস" },
  { en: "Healthy snacks", bn: "হেলদি স্ন্যাক্স" },
  { en: "Office tiffin items", bn: "টিফিন আইটেম" },
];

const HOSPITAL_GROCERY: ProductHint[] = [
  { en: "Bottled water (1L / 5L)", bn: "১ লিটার / ৫ লিটার পানি" },
  { en: "Glucose, ORS & juice", bn: "গ্লুকোজ, ওরস্যালাইন ও জুস" },
  { en: "Fresh fruit & fruit baskets", bn: "তাজা ফল ও ফল ঝুড়ি" },
  { en: "Healthy crackers & biscuits", bn: "হেলদি ক্র্যাকার ও বিস্কুট" },
  { en: "Masks & sanitizer", bn: "মাস্ক ও স্যানিটাইজার" },
];

const MARKET_GROCERY: ProductHint[] = [
  { en: "Impulse snacks", bn: "ইম্পালস স্ন্যাক্স" },
  { en: "Bottled water & soft drinks", bn: "পানি ও সফট ড্রিংক" },
  { en: "Cigarettes & paan supplies", bn: "সিগারেট ও পান সামগ্রী" },
  { en: "Mobile recharge & cards", bn: "মোবাইল রিচার্জ" },
  { en: "Hand fans & umbrellas", bn: "হাতপাখা ও ছাতা (মৌসুমি)" },
];

const STUDENT_CLOTHING: ProductHint[] = [
  { en: "Casual t-shirts", bn: "ক্যাজুয়াল টি-শার্ট" },
  { en: "Jeans & chinos", bn: "জিন্স ও চিনোস" },
  { en: "Kurtis & casual tops", bn: "কুর্তি ও ক্যাজুয়াল টপ" },
  { en: "Hoodies & sweatshirts", bn: "হুডি ও সোয়েটশার্ট" },
  { en: "Backpacks", bn: "ব্যাকপ্যাক" },
];

const OFFICE_CLOTHING: ProductHint[] = [
  { en: "Formal shirts & trousers", bn: "ফরমাল শার্ট ও ট্রাউজার" },
  { en: "Office sarees", bn: "অফিস শাড়ি" },
  { en: "Panjabi & kurta", bn: "পাঞ্জাবি ও কুর্তা" },
  { en: "Ties & belts", bn: "টাই ও বেল্ট" },
  { en: "Office bags", bn: "অফিস ব্যাগ" },
];

const STUDENT_ELECTRONICS: ProductHint[] = [
  { en: "Earphones & in-ear headsets", bn: "ইয়ারফোন ও হেডসেট" },
  { en: "Charging cables & adapters", bn: "চার্জিং ক্যাবল ও অ্যাডাপ্টার" },
  { en: "Power banks", bn: "পাওয়ার ব্যাঙ্ক" },
  { en: "USB drives & memory cards", bn: "USB ড্রাইভ ও মেমরি কার্ড" },
  { en: "Affordable Bluetooth speakers", bn: "সাশ্রয়ী ব্লুটুথ স্পিকার" },
];

const SCHOOL_STATIONERY: ProductHint[] = [
  { en: "Notebooks & exercise books", bn: "নোটবুক ও খাতা" },
  { en: "Pens, pencils & markers", bn: "কলম, পেন্সিল ও মার্কার" },
  { en: "Geometry boxes", bn: "জিওমেট্রি বক্স" },
  { en: "Coloured pencils & crayons", bn: "রঙিন পেন্সিল ও ক্রেয়ন" },
  { en: "School bags & water bottles", bn: "স্কুল ব্যাগ ও পানির বোতল" },
];

const HOSPITAL_PHARMACY: ProductHint[] = [
  { en: "OTC pain relief", bn: "অভার-দ্য-কাউন্টার পেইন রিলিফ" },
  { en: "ORS & electrolytes", bn: "ওরস্যালাইন ও ইলেক্ট্রোলাইট" },
  { en: "Vitamins & supplements", bn: "ভিটামিন ও সাপ্লিমেন্ট" },
  { en: "First-aid supplies", bn: "প্রাথমিক চিকিৎসা সামগ্রী" },
  { en: "Glucose & dietary aids", bn: "গ্লুকোজ ও ডায়েটারি এইডস" },
];

const TOURIST_FOOD: ProductHint[] = [
  { en: "Bottled water & soft drinks", bn: "পানি ও সফট ড্রিংক" },
  { en: "Local snacks & sweets", bn: "লোকাল স্ন্যাক্স ও মিষ্টি" },
  { en: "Souvenir-style packaged food", bn: "স্যুভেনির স্টাইল প্যাকেজড ফুড" },
  { en: "Energy bars & instant drinks", bn: "এনার্জি বার ও ইনস্ট্যান্ট ড্রিংক" },
];

const RELIGIOUS_NEAR: ProductHint[] = [
  { en: "Attar & itr (fragrance)", bn: "আতর ও সুগন্ধি" },
  { en: "Tasbih & prayer caps", bn: "তসবিহ ও টুপি" },
  { en: "Dates & dry fruits", bn: "খেজুর ও ড্রাই ফ্রুট" },
  { en: "Bottled water", bn: "পানি" },
  { en: "Modest clothing", bn: "মডেস্ট পোশাক" },
];

// ---------- the rule table ----------

const RULES: Partial<Record<Key, LocationHint>> = {
  // grocery
  "grocery|near_school": {
    items: SCHOOL_GROCERY,
    reasonEn: "Kids and parents buy snacks, water, and stationery on the way to and from school.",
    reasonBn: "স্কুলে যাওয়া-আসার পথে বাচ্চা ও অভিভাবকরা স্ন্যাক্স, পানি ও স্টেশনারি কিনে।",
  },
  "grocery|near_university": {
    items: [...SCHOOL_GROCERY, { en: "Energy drinks", bn: "এনার্জি ড্রিংক" }],
    reasonEn: "Students buy quick snacks, drinks, and instant meals between classes.",
    reasonBn: "ছাত্ররা ক্লাসের মাঝে দ্রুত স্ন্যাক্স ও ইনস্ট্যান্ট খাবার কিনে।",
  },
  "grocery|near_office": {
    items: OFFICE_GROCERY,
    reasonEn: "Office workers grab lunch packs, tea, and tiffin items at peak hours.",
    reasonBn: "অফিস কর্মীরা পিক টাইমে লাঞ্চ প্যাক ও চা/টিফিন কেনেন।",
  },
  "grocery|near_hospital": {
    items: HOSPITAL_GROCERY,
    reasonEn: "Visitors buy water, juice, fruit baskets, and hygiene supplies for patients.",
    reasonBn: "রোগী দর্শনার্থীরা পানি, জুস, ফলের ঝুড়ি ও স্বাস্থ্য সামগ্রী কিনেন।",
  },
  "grocery|near_market": {
    items: MARKET_GROCERY,
    reasonEn: "Foot traffic is high — impulse snacks, drinks, and mobile recharge dominate.",
    reasonBn: "অনেক মানুষ যাতায়াত করে — ইম্পালস স্ন্যাক্স, ড্রিংক ও রিচার্জ বেশি বিক্রি হয়।",
  },
  "grocery|residential": {
    items: RESIDENTIAL_GROCERY,
    reasonEn: "Households restock daily staples and cleaning supplies on a weekly cycle.",
    reasonBn: "পরিবারগুলো সাপ্তাহিক চক্রে চাল-ডাল ও পরিচ্ছন্নতা সামগ্রী কেনে।",
  },
  "grocery|near_religious": {
    items: [...RELIGIOUS_NEAR.slice(0, 4), { en: "Snacks for breaking fast", bn: "ইফতারির স্ন্যাক্স" }],
    reasonEn: "Worshippers stock fragrance, dates, water, and snacks before/after prayers.",
    reasonBn: "নামাজের আগে-পরে আতর, খেজুর, পানি ও স্ন্যাক্স বিক্রি হয়।",
  },
  "grocery|tourist_area": {
    items: TOURIST_FOOD,
    reasonEn: "Tourists buy water, soft drinks, packaged snacks, and small souvenirs.",
    reasonBn: "পর্যটকরা পানি, ড্রিংক ও প্যাকেজড স্ন্যাক্স কিনে।",
  },
  "grocery|mixed": {
    items: [...RESIDENTIAL_GROCERY.slice(0, 3), ...SCHOOL_GROCERY.slice(0, 3)],
    reasonEn: "Mixed-use areas blend household staples and impulse snacks.",
    reasonBn: "মিশ্র এলাকায় স্টেপল ও ইম্পালস দুটোই বিক্রি হয়।",
  },

  // clothing
  "clothing|near_school": {
    items: [
      { en: "School uniforms", bn: "স্কুল ইউনিফর্ম" },
      { en: "Kids casual wear", bn: "বাচ্চাদের ক্যাজুয়াল পোশাক" },
      { en: "Socks & undergarments", bn: "মোজা ও আন্ডারগারমেন্ট" },
      { en: "Sports shoes (kid sizes)", bn: "বাচ্চাদের স্পোর্টস শু" },
      { en: "School bags", bn: "স্কুল ব্যাগ" },
    ],
    reasonEn: "Parents shop uniforms and kids' casualwear at term start.",
    reasonBn: "টার্ম শুরুতে অভিভাবকরা ইউনিফর্ম ও বাচ্চাদের পোশাক কিনেন।",
  },
  "clothing|near_university": {
    items: STUDENT_CLOTHING,
    reasonEn: "Students drive trend-led casualwear and youth styles.",
    reasonBn: "ছাত্রছাত্রীরা ট্রেন্ডি ক্যাজুয়াল ও ইয়ুথ স্টাইল কিনে।",
  },
  "clothing|near_office": {
    items: OFFICE_CLOTHING,
    reasonEn: "Office workers buy formal shirts, sarees, panjabi, and accessories.",
    reasonBn: "অফিস কর্মীরা ফরমাল শার্ট, শাড়ি, পাঞ্জাবি কিনেন।",
  },
  "clothing|residential": {
    items: [
      { en: "Home wear & sleepwear", bn: "হোম ওয়্যার ও স্লিপ ওয়্যার" },
      { en: "Family casualwear", bn: "ফ্যামিলি ক্যাজুয়াল" },
      { en: "Sarees & panjabi", bn: "শাড়ি ও পাঞ্জাবি" },
      { en: "Kids clothing", bn: "বাচ্চাদের পোশাক" },
    ],
    reasonEn: "Residential traffic favours family-and-home wear and basics.",
    reasonBn: "আবাসিক এলাকায় ফ্যামিলি ও হোম ওয়্যার বেশি বিক্রি হয়।",
  },
  "clothing|near_religious": {
    items: [
      { en: "Panjabi & kurta", bn: "পাঞ্জাবি ও কুর্তা" },
      { en: "Abaya, hijab & burqa", bn: "আবায়া, হিজাব ও বোরকা" },
      { en: "Topi & prayer caps", bn: "টুপি" },
      { en: "Festive clothing (Eid, Puja)", bn: "উৎসব পোশাক (ঈদ, পূজা)" },
    ],
    reasonEn: "Demand peaks for modest wear and festival clothing.",
    reasonBn: "মডেস্ট পোশাক ও উৎসব পোশাকের চাহিদা বেশি।",
  },
  "clothing|tourist_area": {
    items: [
      { en: "Beachwear & summer cottons", bn: "বিচওয়্যার ও সামার কটন" },
      { en: "Souvenir t-shirts", bn: "স্যুভেনির টি-শার্ট" },
      { en: "Hats & sunglasses", bn: "টুপি ও সানগ্লাস" },
      { en: "Sarees & local handicraft", bn: "শাড়ি ও লোকাল হ্যান্ডিক্র্যাফট" },
    ],
    reasonEn: "Tourists pick light cottons, souvenirs, and traditional pieces.",
    reasonBn: "পর্যটকরা হালকা কটন, স্যুভেনির ও ঐতিহ্যবাহী পোশাক বেছে নেন।",
  },

  // electronics
  "electronics|near_school": {
    items: [
      { en: "Headphones & earphones", bn: "হেডফোন ও ইয়ারফোন" },
      { en: "Calculators (school)", bn: "ক্যালকুলেটর (স্কুল)" },
      { en: "Pen drives", bn: "পেন ড্রাইভ" },
      { en: "Affordable phone chargers", bn: "সাশ্রয়ী ফোন চার্জার" },
      { en: "Smart watches (entry)", bn: "এন্ট্রি স্মার্ট ওয়াচ" },
    ],
    reasonEn: "Students and parents pick low-ticket accessories and study aids.",
    reasonBn: "ছাত্ররা ও অভিভাবকরা সাশ্রয়ী অ্যাক্সেসরিজ কিনেন।",
  },
  "electronics|near_university": {
    items: STUDENT_ELECTRONICS,
    reasonEn: "Heavy demand for accessories — headsets, cables, power banks.",
    reasonBn: "অ্যাক্সেসরিজের চাহিদা বেশি — হেডসেট, ক্যাবল, পাওয়ার ব্যাঙ্ক।",
  },
  "electronics|near_office": {
    items: [
      { en: "Laptop accessories & stands", bn: "ল্যাপটপ অ্যাক্সেসরি ও স্ট্যান্ড" },
      { en: "Wired & wireless mouse", bn: "ওয়্যারড ও ওয়্যারলেস মাউস" },
      { en: "Keyboards", bn: "কীবোর্ড" },
      { en: "External SSD / HDD", bn: "এক্সটার্নাল SSD / HDD" },
      { en: "Office-grade headsets", bn: "অফিস হেডসেট" },
    ],
    reasonEn: "Office workers and freelancers buy productivity peripherals.",
    reasonBn: "অফিসকর্মী ও ফ্রিল্যান্সাররা প্রোডাক্টিভিটি অ্যাক্সেসরি কিনেন।",
  },

  // beauty
  "beauty|near_university": {
    items: [
      { en: "Lip balm & lipstick", bn: "লিপ বাম ও লিপস্টিক" },
      { en: "Affordable foundation", bn: "সাশ্রয়ী ফাউন্ডেশন" },
      { en: "Skincare basics", bn: "স্কিনকেয়ার বেসিক" },
      { en: "Hair care", bn: "হেয়ার কেয়ার" },
      { en: "Korean-style sheet masks", bn: "শিট মাস্ক" },
    ],
    reasonEn: "Young customers chase trendy, social-media-driven beauty picks.",
    reasonBn: "তরুণ ক্রেতারা ট্রেন্ডি বিউটি প্রোডাক্ট কিনেন।",
  },
  "beauty|near_office": {
    items: [
      { en: "Lipstick & blush", bn: "লিপস্টিক ও ব্লাশ" },
      { en: "Compact powder", bn: "কম্প্যাক্ট পাউডার" },
      { en: "Perfume & deodorant", bn: "পারফিউম ও ডিওডোরেন্ট" },
      { en: "Quick skincare routines", bn: "কুইক স্কিনকেয়ার" },
    ],
    reasonEn: "Office customers want touch-up, fragrance, and quick routines.",
    reasonBn: "অফিস ক্রেতারা টাচ-আপ, পারফিউম ও কুইক রুটিন কিনেন।",
  },
  "beauty|residential": {
    items: [
      { en: "Family skincare", bn: "ফ্যামিলি স্কিনকেয়ার" },
      { en: "Hair oil & shampoo", bn: "হেয়ার অয়েল ও শ্যাম্পু" },
      { en: "Soap & bodywash", bn: "সাবান ও বডিওয়াশ" },
      { en: "Baby care", bn: "বেবি কেয়ার" },
    ],
    reasonEn: "Households buy family-size skincare and bath essentials.",
    reasonBn: "পরিবারগুলো ফ্যামিলি প্যাকের স্কিনকেয়ার ও বাথ এসেনশিয়াল কিনে।",
  },

  // pharmacy
  "pharmacy|near_hospital": {
    items: HOSPITAL_PHARMACY,
    reasonEn: "Patients and visitors buy OTC, ORS, vitamins, and first-aid items.",
    reasonBn: "রোগী ও দর্শনার্থীরা ওষুধ, ওরস্যালাইন, ভিটামিন ও প্রাথমিক চিকিৎসা সামগ্রী কেনেন।",
  },
  "pharmacy|residential": {
    items: [
      { en: "Cold & flu remedies", bn: "ঠান্ডা ও ফ্লু'র ওষুধ" },
      { en: "Vitamins & supplements", bn: "ভিটামিন ও সাপ্লিমেন্ট" },
      { en: "Baby care medicines", bn: "বেবি কেয়ার মেডিসিন" },
      { en: "Wound care basics", bn: "ক্ষতের যত্ন" },
      { en: "Personal hygiene", bn: "ব্যক্তিগত স্বাস্থ্য" },
    ],
    reasonEn: "Households restock everyday remedies and family hygiene products.",
    reasonBn: "পরিবারের জন্য প্রতিদিনের ওষুধ ও স্বাস্থ্য পণ্য কিনে।",
  },

  // stationery
  "stationery|near_school": {
    items: SCHOOL_STATIONERY,
    reasonEn: "School-supply spikes at term openings and exam weeks.",
    reasonBn: "টার্ম ও পরীক্ষার সময়ে স্কুল সাপ্লাই বিক্রি বাড়ে।",
  },
  "stationery|near_university": {
    items: [
      { en: "Notebooks & A4 paper", bn: "নোটবুক ও A4 কাগজ" },
      { en: "Highlighters & gel pens", bn: "হাইলাইটার ও জেল পেন" },
      { en: "Printer cartridges & toner", bn: "প্রিন্টার কার্ট্রিজ" },
      { en: "Project files & folders", bn: "প্রজেক্ট ফাইল" },
    ],
    reasonEn: "Students spike around assignment, project, and exam cycles.",
    reasonBn: "অ্যাসাইনমেন্ট ও পরীক্ষার সময়ে চাহিদা বাড়ে।",
  },
  "stationery|near_office": {
    items: [
      { en: "Bond paper (A4)", bn: "বন্ড পেপার (A4)" },
      { en: "Pens & markers", bn: "কলম ও মার্কার" },
      { en: "Files & folders", bn: "ফাইল ও ফোল্ডার" },
      { en: "Toner & cartridges", bn: "টোনার ও কার্ট্রিজ" },
      { en: "Sticky notes & tape", bn: "স্টিকি নোট ও টেপ" },
    ],
    reasonEn: "Office customers reorder bond paper, files, and printer supplies.",
    reasonBn: "অফিস ক্রেতারা পেপার, ফাইল ও প্রিন্টার সাপ্লাই অর্ডার দেন।",
  },

  // home
  "home|residential": {
    items: [
      { en: "Cleaning supplies", bn: "পরিচ্ছন্নতা সামগ্রী" },
      { en: "Kitchen utensils", bn: "রান্নাঘরের সামগ্রী" },
      { en: "Bedding & towels", bn: "বিছানা ও টাওয়েল" },
      { en: "Storage containers", bn: "স্টোরেজ কন্টেইনার" },
      { en: "Mosquito nets & repellent", bn: "মশারি ও রিপেলেন্ট" },
    ],
    reasonEn: "Residents restock cleaning, kitchen, and seasonal home goods.",
    reasonBn: "পরিচ্ছন্নতা, রান্নাঘর ও মৌসুমি পণ্য বেশি বিক্রি হয়।",
  },

  // food (eatery / takeaway)
  "food|near_school": {
    items: [
      { en: "Singara, samosa, puri", bn: "সিঙ্গাড়া, সমুচা, পুরি" },
      { en: "Chips & crisps", bn: "চিপস" },
      { en: "Cold drinks & juice", bn: "ঠান্ডা পানীয় ও জুস" },
      { en: "Ice cream", bn: "আইসক্রিম" },
      { en: "Chocolate & candy", bn: "চকলেট ও ক্যান্ডি" },
    ],
    reasonEn: "School traffic drives small fried snacks, ice cream, and candy.",
    reasonBn: "স্কুলের ভিড়ে ছোট ভাজা স্ন্যাক্স, আইসক্রিম ও ক্যান্ডি বিক্রি হয়।",
  },
  "food|near_office": {
    items: [
      { en: "Lunch boxes (rice & curry)", bn: "লাঞ্চ বক্স (ভাত-তরকারি)" },
      { en: "Sandwiches & wraps", bn: "স্যান্ডউইচ ও র‍্যাপ" },
      { en: "Tea & coffee", bn: "চা ও কফি" },
      { en: "Set menus / combos", bn: "সেট মেনু" },
    ],
    reasonEn: "Office lunch and tea-break peaks define the day.",
    reasonBn: "অফিসের লাঞ্চ ও চা-বিরতির সময়ই পিক বিক্রি হয়।",
  },
  "food|tourist_area": {
    items: TOURIST_FOOD,
    reasonEn: "Tourists buy bottled drinks, local sweets, and souvenir snacks.",
    reasonBn: "পর্যটকরা পানি, লোকাল মিষ্টি ও স্যুভেনির স্ন্যাক্স কিনেন।",
  },
};

// ---------- generic fallbacks ----------

const GENERIC_BY_SHOP_TYPE: Record<ShopType, ProductHint[]> = {
  grocery: RESIDENTIAL_GROCERY,
  clothing: [
    { en: "Sarees & panjabi", bn: "শাড়ি ও পাঞ্জাবি" },
    { en: "Casualwear", bn: "ক্যাজুয়াল ওয়্যার" },
    { en: "Kids clothing", bn: "বাচ্চাদের পোশাক" },
  ],
  electronics: [
    { en: "Phone accessories", bn: "ফোন অ্যাক্সেসরিজ" },
    { en: "Cables & adapters", bn: "ক্যাবল ও অ্যাডাপ্টার" },
    { en: "Power banks", bn: "পাওয়ার ব্যাঙ্ক" },
  ],
  beauty: [
    { en: "Skincare basics", bn: "স্কিনকেয়ার বেসিক" },
    { en: "Hair care", bn: "হেয়ার কেয়ার" },
    { en: "Lip & face makeup", bn: "লিপ ও ফেস মেকআপ" },
  ],
  food: [
    { en: "Snacks & street food", bn: "স্ন্যাক্স ও স্ট্রিট ফুড" },
    { en: "Cold drinks", bn: "ঠান্ডা পানীয়" },
    { en: "Sweets", bn: "মিষ্টি" },
  ],
  home: [
    { en: "Cleaning supplies", bn: "পরিচ্ছন্নতা সামগ্রী" },
    { en: "Kitchenware", bn: "কিচেনওয়্যার" },
  ],
  pharmacy: [
    { en: "OTC remedies", bn: "ওভার-দ্য-কাউন্টার ওষুধ" },
    { en: "Vitamins", bn: "ভিটামিন" },
    { en: "Personal hygiene", bn: "ব্যক্তিগত স্বাস্থ্য" },
  ],
  stationery: SCHOOL_STATIONERY,
  mixed: [
    { en: "High-velocity SKUs", bn: "হাই-ভেলোসিটি পণ্য" },
    { en: "Impulse items at the counter", bn: "কাউন্টারে ইম্পালস পণ্য" },
  ],
};

export function locationHints(profile: ShopProfile): LocationHint {
  const key: Key = `${profile.shopType}|${profile.venueType}`;
  const exact = RULES[key];
  if (exact) return exact;
  // No exact rule — return the shop-type default with a generic reason.
  return {
    items: GENERIC_BY_SHOP_TYPE[profile.shopType] ?? [],
    reasonEn:
      "We don't have a venue-specific rule for this combination yet — showing baseline picks for your shop type.",
    reasonBn:
      "এই কম্বিনেশনের জন্য নির্দিষ্ট সাজেশন এখনো নেই — শপ টাইপের সাধারণ পণ্য দেখানো হলো।",
  };
}

// ---------- label helpers (UI) ----------

export const SHOP_TYPE_LABELS: Record<ShopType, { en: string; bn: string }> = {
  grocery: { en: "Grocery", bn: "মুদি দোকান" },
  clothing: { en: "Clothing", bn: "পোশাক" },
  electronics: { en: "Electronics", bn: "ইলেকট্রনিক্স" },
  beauty: { en: "Beauty & cosmetics", bn: "বিউটি ও কসমেটিক্স" },
  food: { en: "Food / eatery", bn: "খাবার / খাবারের দোকান" },
  home: { en: "Home goods", bn: "হোম গুডস" },
  pharmacy: { en: "Pharmacy", bn: "ফার্মেসি" },
  stationery: { en: "Stationery", bn: "স্টেশনারি" },
  mixed: { en: "Mixed / general store", bn: "মিশ্র / জেনারেল স্টোর" },
};

export const VENUE_TYPE_LABELS: Record<VenueType, { en: string; bn: string }> = {
  near_school: { en: "Near a school", bn: "স্কুলের পাশে" },
  near_university: { en: "Near a college / university", bn: "কলেজ / বিশ্ববিদ্যালয়ের পাশে" },
  near_office: { en: "Near offices / corporate area", bn: "অফিস এলাকার পাশে" },
  near_hospital: { en: "Near a hospital / clinic", bn: "হাসপাতালের পাশে" },
  near_market: { en: "Near a bazaar / transport hub", bn: "বাজার / যাতায়াতের পাশে" },
  near_religious: { en: "Near a mosque / mandir", bn: "মসজিদ / মন্দিরের পাশে" },
  tourist_area: { en: "Tourist / hospitality area", bn: "পর্যটন এলাকা" },
  residential: { en: "Residential block", bn: "আবাসিক এলাকা" },
  mixed: { en: "Mixed-use area", bn: "মিশ্র এলাকা" },
};

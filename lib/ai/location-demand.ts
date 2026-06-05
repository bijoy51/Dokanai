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
import type { Product } from "@/lib/types";

export interface ProductHint {
  /** Short product-type label, English. */
  en: string;
  /** Short product-type label, Bangla. */
  bn: string;
  /** Optional concrete product-name examples for this category. Shown on
   *  the "Essentials to consider stocking" side of the panel so the
   *  shopkeeper sees actionable product names, not just buckets. When the
   *  category is already in the catalog the panel ignores these and shows
   *  the real matching product names from the user's data instead. */
  examples?: Array<{ en: string; bn: string }>;
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
  {
    en: "Snacks & chips",
    bn: "চিপস ও স্ন্যাক্স",
    examples: [
      { en: "Potato chips (small pack)", bn: "পটেটো চিপস (ছোট প্যাক)" },
      { en: "Cheese balls", bn: "চিজ বল" },
      { en: "Bombay mix / chanachur", bn: "চানাচুর" },
    ],
  },
  {
    en: "Biscuits & cookies",
    bn: "বিস্কুট ও কুকিজ",
    examples: [
      { en: "Glucose biscuits", bn: "গ্লুকোজ বিস্কুট" },
      { en: "Cream-filled cookies", bn: "ক্রিম বিস্কুট" },
      { en: "Tiffin cake (small)", bn: "টিফিন কেক (ছোট)" },
    ],
  },
  {
    en: "Chocolate & candy",
    bn: "চকলেট ও ক্যান্ডি",
    examples: [
      { en: "Bar chocolate (15g)", bn: "বার চকলেট (১৫গ্রাম)" },
      { en: "Lollipop pack", bn: "ললিপপ প্যাক" },
      { en: "Mango candy strip", bn: "ম্যাঙ্গো ক্যান্ডি স্ট্রিপ" },
    ],
  },
  {
    en: "Bottled water & juice",
    bn: "পানি ও জুসের বোতল",
    examples: [
      { en: "Mineral water 500ml", bn: "মিনারেল ওয়াটার ৫০০মিলি" },
      { en: "Fruit juice 250ml (Pran/Frutika)", bn: "ফ্রুট জুস ২৫০মিলি" },
      { en: "Coconut water tetra-pack", bn: "ডাবের জল টেট্রা প্যাক" },
    ],
  },
  {
    en: "Instant noodles",
    bn: "ইনস্ট্যান্ট নুডলস",
    examples: [
      { en: "Chicken instant noodles", bn: "চিকেন ইনস্ট্যান্ট নুডলস" },
      { en: "Cup noodles (single serve)", bn: "কাপ নুডলস" },
      { en: "Masala noodles (3-pack)", bn: "মশলা নুডলস (৩টি প্যাক)" },
    ],
  },
  {
    en: "Notebooks & pencils",
    bn: "নোটবুক ও পেন্সিল",
    examples: [
      { en: "200-page exercise book", bn: "২০০ পৃষ্ঠার খাতা" },
      { en: "HB pencil (pack of 10)", bn: "HB পেন্সিল (১০টি প্যাক)" },
      { en: "Eraser & sharpener combo", bn: "রাবার-শার্পনার কম্বো" },
    ],
  },
];

const RESIDENTIAL_GROCERY: ProductHint[] = [
  {
    en: "Rice & lentils (daal)",
    bn: "চাল ও ডাল",
    examples: [
      { en: "Miniket rice 5kg", bn: "মিনিকেট চাল ৫কেজি" },
      { en: "Masoor daal 1kg", bn: "মুসুর ডাল ১কেজি" },
      { en: "Chola (chickpeas) 500g", bn: "ছোলা ৫০০গ্রাম" },
    ],
  },
  {
    en: "Cooking oil & ghee",
    bn: "তেল ও ঘি",
    examples: [
      { en: "Soybean oil 5L", bn: "সয়াবিন তেল ৫ লিটার" },
      { en: "Mustard oil 1L", bn: "সরিষার তেল ১ লিটার" },
      { en: "Pure cow ghee 500g", bn: "খাঁটি গরুর ঘি ৫০০গ্রাম" },
    ],
  },
  {
    en: "Sugar, salt & spices",
    bn: "চিনি, লবণ ও মশলা",
    examples: [
      { en: "Sugar 1kg", bn: "চিনি ১কেজি" },
      { en: "Iodised salt 500g", bn: "আয়োডিন লবণ ৫০০গ্রাম" },
      { en: "Turmeric, chilli, garam masala", bn: "হলুদ, মরিচ, গরম মশলা" },
    ],
  },
  {
    en: "Eggs & dairy",
    bn: "ডিম ও দুধ",
    examples: [
      { en: "Farm eggs (12-pack)", bn: "ফার্মের ডিম (১২টি প্যাক)" },
      { en: "Pasteurised milk 1L", bn: "পাস্তুরাইজড দুধ ১ লিটার" },
      { en: "Butter / paneer block", bn: "মাখন / পনির ব্লক" },
    ],
  },
  {
    en: "Fresh vegetables",
    bn: "তাজা সবজি",
    examples: [
      { en: "Potato, onion, garlic", bn: "আলু, পেঁয়াজ, রসুন" },
      { en: "Green chilli & ginger", bn: "কাঁচা মরিচ ও আদা" },
      { en: "Seasonal leafy greens", bn: "মৌসুমী শাক" },
    ],
  },
  {
    en: "Cleaning supplies",
    bn: "ক্লিনিং সাপ্লাই",
    examples: [
      { en: "Bathroom cleaner", bn: "বাথরুম ক্লিনার" },
      { en: "Detergent powder 1kg", bn: "ডিটারজেন্ট পাউডার ১কেজি" },
      { en: "Bar soap & dish soap", bn: "বার সাবান ও থালা সাবান" },
    ],
  },
];

const OFFICE_GROCERY: ProductHint[] = [
  {
    en: "Ready-to-eat lunch packs",
    bn: "রেডি লাঞ্চ প্যাক",
    examples: [
      { en: "Biryani lunch box", bn: "বিরিয়ানি লাঞ্চ বক্স" },
      { en: "Rice-and-curry combo", bn: "ভাত-তরকারি কম্বো" },
      { en: "Veg paratha roll", bn: "ভেজ পরোটা রোল" },
    ],
  },
  {
    en: "Tea, coffee & instant mixes",
    bn: "চা, কফি ও ইনস্ট্যান্ট মিক্স",
    examples: [
      { en: "Premix milk tea sachets", bn: "প্রিমিক্স মিল্ক টি স্যাশে" },
      { en: "3-in-1 instant coffee", bn: "৩-ইন-১ ইনস্ট্যান্ট কফি" },
      { en: "Lemon-honey tea bags", bn: "লেমন-হানি টি ব্যাগ" },
    ],
  },
  {
    en: "Energy drinks & juice",
    bn: "এনার্জি ড্রিংক ও জুস",
    examples: [
      { en: "Energy drink 250ml", bn: "এনার্জি ড্রিংক ২৫০মিলি" },
      { en: "Mango juice tetra-pack", bn: "ম্যাঙ্গো জুস টেট্রা প্যাক" },
    ],
  },
  {
    en: "Healthy snacks",
    bn: "হেলদি স্ন্যাক্স",
    examples: [
      { en: "Roasted nuts mix", bn: "রোস্টেড নাট মিক্স" },
      { en: "Granola bar", bn: "গ্রানোলা বার" },
      { en: "Baked chips (low oil)", bn: "বেকড চিপস (কম তেল)" },
    ],
  },
  {
    en: "Office tiffin items",
    bn: "টিফিন আইটেম",
    examples: [
      { en: "Singara & samosa 6-pack", bn: "সিঙ্গাড়া ও সমুচা ৬-প্যাক" },
      { en: "Egg paratha (frozen)", bn: "এগ পরোটা (ফ্রোজেন)" },
    ],
  },
];

const HOSPITAL_GROCERY: ProductHint[] = [
  {
    en: "Bottled water (1L / 5L)",
    bn: "১ লিটার / ৫ লিটার পানি",
    examples: [
      { en: "Mineral water 1L", bn: "মিনারেল ওয়াটার ১ লিটার" },
      { en: "Mineral water 5L jar", bn: "মিনারেল ওয়াটার ৫ লিটার জার" },
    ],
  },
  {
    en: "Glucose, ORS & juice",
    bn: "গ্লুকোজ, ওরস্যালাইন ও জুস",
    examples: [
      { en: "Saline (ORS) sachets", bn: "ওরস্যালাইন স্যাশে" },
      { en: "Glucose powder 500g", bn: "গ্লুকোজ পাউডার ৫০০গ্রাম" },
      { en: "Orange juice 1L", bn: "অরেঞ্জ জুস ১ লিটার" },
    ],
  },
  {
    en: "Fresh fruit & fruit baskets",
    bn: "তাজা ফল ও ফল ঝুড়ি",
    examples: [
      { en: "Apple-orange basket", bn: "আপেল-কমলা ঝুড়ি" },
      { en: "Banana dozen", bn: "কলা ডজন" },
      { en: "Mixed seasonal basket", bn: "মিশ্র মৌসুমি ঝুড়ি" },
    ],
  },
  {
    en: "Healthy crackers & biscuits",
    bn: "হেলদি ক্র্যাকার ও বিস্কুট",
    examples: [
      { en: "Digestive biscuits", bn: "ডাইজেস্টিভ বিস্কুট" },
      { en: "Whole-wheat crackers", bn: "হোলহুইট ক্র্যাকার" },
    ],
  },
  {
    en: "Masks & sanitizer",
    bn: "মাস্ক ও স্যানিটাইজার",
    examples: [
      { en: "Surgical mask (10-pack)", bn: "সার্জিক্যাল মাস্ক (১০টি প্যাক)" },
      { en: "Hand sanitizer 100ml", bn: "হ্যান্ড স্যানিটাইজার ১০০মিলি" },
    ],
  },
];

const MARKET_GROCERY: ProductHint[] = [
  {
    en: "Impulse snacks",
    bn: "ইম্পালস স্ন্যাক্স",
    examples: [
      { en: "Chanachur small pack", bn: "চানাচুর ছোট প্যাক" },
      { en: "Peanut packets", bn: "বাদাম প্যাকেট" },
    ],
  },
  {
    en: "Bottled water & soft drinks",
    bn: "পানি ও সফট ড্রিংক",
    examples: [
      { en: "Cola 250ml", bn: "কোলা ২৫০মিলি" },
      { en: "Mineral water 500ml", bn: "মিনারেল ওয়াটার ৫০০মিলি" },
    ],
  },
  {
    en: "Cigarettes & paan supplies",
    bn: "সিগারেট ও পান সামগ্রী",
    examples: [
      { en: "Cigarette sticks (per pack)", bn: "সিগারেট স্টিক (প্রতি প্যাক)" },
      { en: "Paan masala / supari", bn: "পান মসলা / সুপারি" },
    ],
  },
  {
    en: "Mobile recharge & cards",
    bn: "মোবাইল রিচার্জ",
    examples: [
      { en: "Flexi-recharge cards", bn: "ফ্লেক্সি রিচার্জ কার্ড" },
      { en: "Data top-up vouchers", bn: "ডেটা টপ-আপ ভাউচার" },
    ],
  },
  {
    en: "Hand fans & umbrellas",
    bn: "হাতপাখা ও ছাতা (মৌসুমি)",
    examples: [
      { en: "Bamboo hand fan", bn: "বাঁশের হাতপাখা" },
      { en: "Foldable rain umbrella", bn: "ফোল্ডিং বৃষ্টির ছাতা" },
    ],
  },
];

const STUDENT_CLOTHING: ProductHint[] = [
  {
    en: "Casual t-shirts",
    bn: "ক্যাজুয়াল টি-শার্ট",
    examples: [
      { en: "Round-neck cotton tee", bn: "রাউন্ড-নেক কটন টি" },
      { en: "Graphic-print tee", bn: "গ্রাফিক প্রিন্ট টি" },
      { en: "Oversized streetwear tee", bn: "ওভারসাইজড স্ট্রিটওয়্যার টি" },
    ],
  },
  {
    en: "Jeans & chinos",
    bn: "জিন্স ও চিনোস",
    examples: [
      { en: "Slim-fit blue jeans", bn: "স্লিম ফিট নীল জিন্স" },
      { en: "Black skinny jeans", bn: "কালো স্কিনি জিন্স" },
      { en: "Khaki chinos", bn: "খাকি চিনোস" },
    ],
  },
  {
    en: "Kurtis & casual tops",
    bn: "কুর্তি ও ক্যাজুয়াল টপ",
    examples: [
      { en: "Cotton printed kurti", bn: "কটন প্রিন্ট কুর্তি" },
      { en: "Tunic top", bn: "টিউনিক টপ" },
    ],
  },
  {
    en: "Hoodies & sweatshirts",
    bn: "হুডি ও সোয়েটশার্ট",
    examples: [
      { en: "Plain pull-over hoodie", bn: "প্লেইন পুল-ওভার হুডি" },
      { en: "Zip-up hoodie (winter)", bn: "জিপ-আপ হুডি (শীত)" },
    ],
  },
  {
    en: "Backpacks",
    bn: "ব্যাকপ্যাক",
    examples: [
      { en: "Laptop backpack 15-inch", bn: "ল্যাপটপ ব্যাকপ্যাক ১৫\"" },
      { en: "Canvas student bag", bn: "ক্যানভাস স্টুডেন্ট ব্যাগ" },
    ],
  },
];

const OFFICE_CLOTHING: ProductHint[] = [
  {
    en: "Formal shirts & trousers",
    bn: "ফরমাল শার্ট ও ট্রাউজার",
    examples: [
      { en: "Plain white formal shirt", bn: "প্লেইন সাদা ফরমাল শার্ট" },
      { en: "Slim-fit black trouser", bn: "স্লিম ফিট কালো ট্রাউজার" },
      { en: "Striped business shirt", bn: "স্ট্রাইপড বিজনেস শার্ট" },
    ],
  },
  {
    en: "Office sarees",
    bn: "অফিস শাড়ি",
    examples: [
      { en: "Cotton tant saree (office)", bn: "কটন তাঁত শাড়ি (অফিস)" },
      { en: "Half-silk plain saree", bn: "হাফ-সিল্ক প্লেইন শাড়ি" },
    ],
  },
  {
    en: "Panjabi & kurta",
    bn: "পাঞ্জাবি ও কুর্তা",
    examples: [
      { en: "Plain cotton panjabi", bn: "প্লেইন কটন পাঞ্জাবি" },
      { en: "Slim-fit office kurta", bn: "স্লিম ফিট অফিস কুর্তা" },
    ],
  },
  {
    en: "Ties & belts",
    bn: "টাই ও বেল্ট",
    examples: [
      { en: "Solid silk tie", bn: "সলিড সিল্ক টাই" },
      { en: "Leather formal belt", bn: "চামড়ার ফরমাল বেল্ট" },
    ],
  },
  {
    en: "Office bags",
    bn: "অফিস ব্যাগ",
    examples: [
      { en: "Laptop messenger bag", bn: "ল্যাপটপ মেসেঞ্জার ব্যাগ" },
      { en: "Faux-leather portfolio", bn: "ফক্স লেদার পোর্টফোলিও" },
    ],
  },
];

const STUDENT_ELECTRONICS: ProductHint[] = [
  {
    en: "Earphones & in-ear headsets",
    bn: "ইয়ারফোন ও হেডসেট",
    examples: [
      { en: "Wired in-ear earphones", bn: "ওয়্যারড ইন-ইয়ার ইয়ারফোন" },
      { en: "TWS bluetooth earbuds", bn: "TWS ব্লুটুথ ইয়ারবাড" },
    ],
  },
  {
    en: "Charging cables & adapters",
    bn: "চার্জিং ক্যাবল ও অ্যাডাপ্টার",
    examples: [
      { en: "Type-C cable 1m", bn: "Type-C ক্যাবল ১মি" },
      { en: "Lightning cable", bn: "লাইটনিং ক্যাবল" },
      { en: "20W fast adapter", bn: "২০W ফাস্ট অ্যাডাপ্টার" },
    ],
  },
  {
    en: "Power banks",
    bn: "পাওয়ার ব্যাঙ্ক",
    examples: [
      { en: "10000mAh slim power bank", bn: "১০০০০mAh স্লিম পাওয়ার ব্যাঙ্ক" },
      { en: "20000mAh dual-port", bn: "২০০০০mAh ডুয়াল-পোর্ট" },
    ],
  },
  {
    en: "USB drives & memory cards",
    bn: "USB ড্রাইভ ও মেমরি কার্ড",
    examples: [
      { en: "32GB USB 3.0 drive", bn: "৩২GB USB ৩.০ ড্রাইভ" },
      { en: "64GB microSD card", bn: "৬৪GB microSD কার্ড" },
    ],
  },
  {
    en: "Affordable Bluetooth speakers",
    bn: "সাশ্রয়ী ব্লুটুথ স্পিকার",
    examples: [
      { en: "Portable mini speaker", bn: "পোর্টেবল মিনি স্পিকার" },
      { en: "Mid-range bass speaker", bn: "মিড-রেঞ্জ বেস স্পিকার" },
    ],
  },
];

const SCHOOL_STATIONERY: ProductHint[] = [
  {
    en: "Notebooks & exercise books",
    bn: "নোটবুক ও খাতা",
    examples: [
      { en: "Single-line 200pg notebook", bn: "এক-লাইন ২০০ পৃষ্ঠার খাতা" },
      { en: "Math square exercise book", bn: "ম্যাথ স্কয়ার খাতা" },
    ],
  },
  {
    en: "Pens, pencils & markers",
    bn: "কলম, পেন্সিল ও মার্কার",
    examples: [
      { en: "Blue ball-point pen (10-pack)", bn: "নীল বল-পয়েন্ট কলম (১০টি প্যাক)" },
      { en: "Permanent marker set", bn: "পারমানেন্ট মার্কার সেট" },
    ],
  },
  {
    en: "Geometry boxes",
    bn: "জিওমেট্রি বক্স",
    examples: [
      { en: "School geometry set", bn: "স্কুল জিওমেট্রি সেট" },
      { en: "Compass + protractor combo", bn: "কম্পাস + প্রটেক্টর কম্বো" },
    ],
  },
  {
    en: "Coloured pencils & crayons",
    bn: "রঙিন পেন্সিল ও ক্রেয়ন",
    examples: [
      { en: "24-colour pencil set", bn: "২৪ রঙ পেন্সিল সেট" },
      { en: "Wax crayon 12-pack", bn: "ওয়াক্স ক্রেয়ন ১২টি প্যাক" },
    ],
  },
  {
    en: "School bags & water bottles",
    bn: "স্কুল ব্যাগ ও পানির বোতল",
    examples: [
      { en: "Padded school backpack", bn: "প্যাডেড স্কুল ব্যাকপ্যাক" },
      { en: "BPA-free water bottle 750ml", bn: "BPA-ফ্রি পানির বোতল ৭৫০মিলি" },
    ],
  },
];

const HOSPITAL_PHARMACY: ProductHint[] = [
  {
    en: "OTC pain relief",
    bn: "অভার-দ্য-কাউন্টার পেইন রিলিফ",
    examples: [
      { en: "Paracetamol 500mg strip", bn: "প্যারাসিটামল ৫০০মিগ্রা স্ট্রিপ" },
      { en: "Ibuprofen 200mg", bn: "আইবুপ্রোফেন ২০০মিগ্রা" },
    ],
  },
  {
    en: "ORS & electrolytes",
    bn: "ওরস্যালাইন ও ইলেক্ট্রোলাইট",
    examples: [
      { en: "Saline (ORS) sachets", bn: "ওরস্যালাইন স্যাশে" },
      { en: "Electrolyte drink mix", bn: "ইলেক্ট্রোলাইট ড্রিংক মিক্স" },
    ],
  },
  {
    en: "Vitamins & supplements",
    bn: "ভিটামিন ও সাপ্লিমেন্ট",
    examples: [
      { en: "Multivitamin tablet (30s)", bn: "মাল্টিভিটামিন ট্যাবলেট (৩০টি)" },
      { en: "Vitamin D3 capsule", bn: "ভিটামিন D3 ক্যাপসুল" },
    ],
  },
  {
    en: "First-aid supplies",
    bn: "প্রাথমিক চিকিৎসা সামগ্রী",
    examples: [
      { en: "Bandage roll & gauze", bn: "ব্যান্ডেজ রোল ও গজ" },
      { en: "Antiseptic ointment", bn: "অ্যান্টিসেপটিক ওইন্টমেন্ট" },
    ],
  },
  {
    en: "Glucose & dietary aids",
    bn: "গ্লুকোজ ও ডায়েটারি এইডস",
    examples: [
      { en: "Glucose powder 500g", bn: "গ্লুকোজ পাউডার ৫০০গ্রাম" },
      { en: "Fibre supplement", bn: "ফাইবার সাপ্লিমেন্ট" },
    ],
  },
];

const TOURIST_FOOD: ProductHint[] = [
  {
    en: "Bottled water & soft drinks",
    bn: "পানি ও সফট ড্রিংক",
    examples: [
      { en: "Mineral water 500ml", bn: "মিনারেল ওয়াটার ৫০০মিলি" },
      { en: "Soft drink can 250ml", bn: "সফট ড্রিংক ক্যান ২৫০মিলি" },
    ],
  },
  {
    en: "Local snacks & sweets",
    bn: "লোকাল স্ন্যাক্স ও মিষ্টি",
    examples: [
      { en: "Roshogolla box (250g)", bn: "রসগোল্লা বক্স (২৫০গ্রাম)" },
      { en: "Cox's Bazar dried fish", bn: "কক্সবাজার শুঁটকি" },
    ],
  },
  {
    en: "Souvenir-style packaged food",
    bn: "স্যুভেনির স্টাইল প্যাকেজড ফুড",
    examples: [
      { en: "Bangladeshi tea gift pack", bn: "বাংলাদেশি চা গিফট প্যাক" },
      { en: "Hand-packed sweets gift box", bn: "হাতে প্যাক করা মিষ্টি গিফট বক্স" },
    ],
  },
  {
    en: "Energy bars & instant drinks",
    bn: "এনার্জি বার ও ইনস্ট্যান্ট ড্রিংক",
    examples: [
      { en: "Granola energy bar", bn: "গ্রানোলা এনার্জি বার" },
      { en: "Instant mango drink mix", bn: "ইনস্ট্যান্ট ম্যাঙ্গো ড্রিংক মিক্স" },
    ],
  },
];

const RELIGIOUS_NEAR: ProductHint[] = [
  {
    en: "Attar & itr (fragrance)",
    bn: "আতর ও সুগন্ধি",
    examples: [
      { en: "Oudh attar 6ml", bn: "ওউদ আতর ৬মিলি" },
      { en: "Rose itr roll-on", bn: "গোলাপ ইতর রোল-অন" },
    ],
  },
  {
    en: "Tasbih & prayer caps",
    bn: "তসবিহ ও টুপি",
    examples: [
      { en: "99-bead wooden tasbih", bn: "৯৯-বিড কাঠের তসবিহ" },
      { en: "White cotton tupi", bn: "সাদা কটন টুপি" },
    ],
  },
  {
    en: "Dates & dry fruits",
    bn: "খেজুর ও ড্রাই ফ্রুট",
    examples: [
      { en: "Saudi Ajwa dates 500g", bn: "সৌদি আজওয়া খেজুর ৫০০গ্রাম" },
      { en: "Mixed dry-fruit gift box", bn: "মিশ্র ড্রাই-ফ্রুট গিফট বক্স" },
    ],
  },
  {
    en: "Bottled water",
    bn: "পানি",
    examples: [
      { en: "Mineral water 1L", bn: "মিনারেল ওয়াটার ১ লিটার" },
    ],
  },
  {
    en: "Modest clothing",
    bn: "মডেস্ট পোশাক",
    examples: [
      { en: "Plain abaya", bn: "প্লেইন আবায়া" },
      { en: "Long-sleeve maxi dress", bn: "লং-স্লিভ ম্যাক্সি ড্রেস" },
    ],
  },
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
      {
        en: "Panjabi & kurta",
        bn: "পাঞ্জাবি ও কুর্তা",
        examples: [
          { en: "Cotton Eid Panjabi", bn: "কটন ইদ পাঞ্জাবি" },
          { en: "Embroidered Pakistani Kurta", bn: "এমব্রয়ডারি পাকিস্তানি কুর্তা" },
          { en: "Slim-fit Premium Panjabi", bn: "স্লিম ফিট প্রিমিয়াম পাঞ্জাবি" },
        ],
      },
      {
        en: "Abaya, hijab & burqa",
        bn: "আবায়া, হিজাব ও বোরকা",
        examples: [
          { en: "Plain Black Abaya", bn: "প্লেইন ব্ল্যাক আবায়া" },
          { en: "Chiffon Hijab (set of 3)", bn: "শিফন হিজাব (৩টি সেট)" },
          { en: "Designer Burqa with niqab", bn: "নিকাবসহ ডিজাইনার বোরকা" },
        ],
      },
      {
        en: "Topi & prayer caps",
        bn: "টুপি",
        examples: [
          { en: "White cotton tupi", bn: "সাদা কটন টুপি" },
          { en: "Velvet sufi tupi", bn: "ভেলভেট সুফি টুপি" },
          { en: "Embroidered prayer cap", bn: "এমব্রয়ডারি প্রেয়ার ক্যাপ" },
        ],
      },
      {
        en: "Festive clothing (Eid, Puja)",
        bn: "উৎসব পোশাক (ঈদ, পূজা)",
        examples: [
          { en: "Eid Special Saree", bn: "ইদ স্পেশাল শাড়ি" },
          { en: "Puja Dhoti & Punjabi set", bn: "পূজা ধুতি ও পাঞ্জাবি সেট" },
          { en: "Family Festive Combo (4 pcs)", bn: "ফ্যামিলি উৎসব কম্বো (৪টি)" },
        ],
      },
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

/**
 * Look up the (shopType, venueType) rule. Shop type comes from
 * detectShopType() and the venue type from the saved profile. Falls back
 * to a baseline shop-type basket when no exact venue rule exists.
 */
export function locationHints(shopType: ShopType, venueType: VenueType): LocationHint {
  const key: Key = `${shopType}|${venueType}`;
  const exact = RULES[key];
  if (exact) return exact;
  return {
    items: GENERIC_BY_SHOP_TYPE[shopType] ?? [],
    reasonEn:
      "We don't have a venue-specific rule for this combination yet — showing baseline picks for your shop type.",
    reasonBn:
      "এই কম্বিনেশনের জম্য নির্দিষ্ট সাজেশন এখনো নেই — শপ টাইপের সাধারণ পণ্য দেখানো হলো।",
  };
}

/**
 * Detect the shop type from the imported product catalog using a name-based
 * keyword vote that runs before the imported-category fallback. Names beat
 * categories because the CSV importer coerces unknown categories to "home"
 * — so a pharmacy uploaded with category="pharmacy" would otherwise look
 * like a home-goods shop. Returns "mixed" when no single type wins ≥ 40%.
 */
const DETECTION_RULES: Array<{ regex: RegExp; type: ShopType }> = [
  // pharmacy
  { regex: /\b(medicine|tablet|capsule|syrup|paracetamol|antibiotic|ointment|ors|inhaler|antiseptic|napa|ibuprofen|amoxicillin|salbutamol|ranitidine|omeprazole|metformin|aspirin|amlodipine|losartan|atorvastatin|prescription|pharmaceutical)\b/i, type: "pharmacy" },
  // stationery
  { regex: /\b(pen|pencil|notebook|exercise\s?book|eraser|sharpener|marker|highlighter|ruler|geometry|crayon|stapler|folder|envelope|sketch\s?book|writing\s?pad)\b/i, type: "stationery" },
  // grocery (raw staples + packaged groceries)
  { regex: /\b(rice|chal|dal|lentil|cooking\s?oil|atta|maida|sugar|chini|salt|lobon|flour|potato|onion|garlic|ginger|tomato|chili|mosla|spice|biscuit|noodle|cereal|tea|coffee|milk|egg|dudh|cheese|butter|ghee)\b/i, type: "grocery" },
  // food (prepared / eatery)
  { regex: /\b(burger|samosa|singara|pizza|sandwich|wrap|pasta|biryani|kebab|grill|fries|naan|chapati|paratha|tehari|khichuri|cha|coffee\s?cup|combo|meal\s?plate|bowl)\b/i, type: "food" },
  // clothing
  { regex: /\b(shirt|saree|panjabi|kurti|trouser|pants|jeans|t[- ]?shirt|tee|hoodie|jacket|coat|dress|gown|salwar|kameez|abaya|hijab|kurta|skirt|blouse|polo)\b/i, type: "clothing" },
  // electronics
  { regex: /\b(phone|mobile|charger|cable|earphone|headphone|speaker|tv|laptop|tablet|mouse|keyboard|monitor|smartwatch|adapter|battery|power\s?bank|router|bluetooth|usb)\b/i, type: "electronics" },
  // beauty
  { regex: /\b(lipstick|foundation|mascara|eyeliner|blush|primer|moisturizer|serum|cleanser|toner|sunscreen|shampoo|conditioner|perfume|attar|nail\s?polish|face\s?cream|hair\s?oil|body\s?lotion|fairness)\b/i, type: "beauty" },
  // home
  { regex: /\b(towel|bedsheet|pillow|curtain|carpet|mattress|cookware|pan|pot|plate|bowl|cup|cutlery|spoon|fork|knife|broom|mop|bucket|detergent|cleaner|tiffin\s?box)\b/i, type: "home" },
];

const CATEGORY_FALLBACK: Record<string, ShopType> = {
  food: "grocery",
  clothing: "clothing",
  electronics: "electronics",
  beauty: "beauty",
  home: "home",
};

export function detectShopType(products: Product[]): ShopType {
  if (!products.length) return "mixed";

  const buckets: Record<ShopType, number> = {
    grocery: 0, clothing: 0, electronics: 0, beauty: 0,
    food: 0, home: 0, pharmacy: 0, stationery: 0, mixed: 0,
  };

  for (const p of products) {
    const name = `${p.name} ${p.nameBn ?? ""}`.toLowerCase();
    let matched = false;
    for (const r of DETECTION_RULES) {
      if (r.regex.test(name)) {
        buckets[r.type]++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const cat = CATEGORY_FALLBACK[p.category];
      if (cat) buckets[cat]++;
      else buckets.mixed++;
    }
  }

  const ranked = (Object.entries(buckets) as [ShopType, number][])
    .filter(([k]) => k !== "mixed")
    .sort((a, b) => b[1] - a[1]);
  const topShare = (ranked[0]?.[1] ?? 0) / products.length;
  if (!ranked[0] || topShare < 0.4) return "mixed";
  return ranked[0][0];
}

/**
 * Heuristic: does the catalog already contain a product matching this hint?
 * Used by the Overview panel to split suggestions into "missing essentials"
 * (actionable — consider stocking) vs "already stocked" (confirmation).
 *
 * Match rule: any meaningful token (>= 3 chars, not a stop-word) from the
 * hint's English label must appear as a substring in any product's name or
 * Bangla name. Forgiving on purpose — "Bottled water & juice" should match
 * a product called just "Mineral Water 500ml".
 */
const STOP_WORDS = new Set([
  "and", "the", "with", "for", "from", "you", "your", "near", "school", "office", "size",
]);

export function isHintStocked(hint: ProductHint, products: Product[]): boolean {
  return matchedProductsForHint(hint, products).length > 0;
}

/** Returns every product in the user's catalog that plausibly matches this
 *  hint's category. Used by LocationRecommendationsPanel to show real
 *  product names under each "Already in your catalog" tile instead of just
 *  the generic hint label. Matching rule is the same forgiving substring
 *  scan as `isHintStocked` — any meaningful token from the hint's English
 *  label appearing as a substring in the product name (en or bn) is a hit. */
export function matchedProductsForHint(hint: ProductHint, products: Product[]): Product[] {
  const tokens = (hint.en.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []).filter(
    (t) => !STOP_WORDS.has(t),
  );
  if (tokens.length === 0) return [];
  return products.filter((p) => {
    const blob = `${p.name} ${p.nameBn ?? ""}`.toLowerCase();
    return tokens.some((t) => blob.includes(t));
  });
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

"""Bangladesh festival calendar and demand-boost helpers.

Mirrors the calendar used by the Next.js app so forecasts and advice are
consistent across the two services.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import List, Optional, Tuple


@dataclass
class Festival:
    id: str
    name: str
    name_bn: str
    date: str  # ISO YYYY-MM-DD
    lead_days: int
    peak_boost: float
    categories: List[str] = field(default_factory=list)
    advice: str = ""
    advice_bn: str = ""


FESTIVALS: List[Festival] = [
    Festival("ramadan-start", "Ramadan begins", "রমজান শুরু", "2026-02-18", 14, 2.4,
             ["food", "clothing"],
             "Stock up on dates, perfumes, prayer items, iftar essentials.",
             "খেজুর, পারফিউম, ইফতারের সামগ্রী মজুত বাড়ান।"),
    Festival("eid-ul-fitr", "Eid-ul-Fitr", "ঈদ-উল-ফিতর", "2026-03-20", 21, 3.2,
             ["clothing", "beauty", "food"],
             "Eid is the year's biggest sales window. Stock new collections, fragrances, sweets.",
             "বছরের সবচেয়ে বড় বিক্রির সময়। নতুন কালেকশন, পারফিউম, মিষ্টি মজুত রাখুন।"),
    Festival("pohela-boishakh", "Pohela Boishakh", "পহেলা বৈশাখ", "2026-04-14", 10, 2.0,
             ["clothing", "food", "home"],
             "Push red-and-white themed sarees, panjabis, hilsa, traditional foods.",
             "লাল-সাদা শাড়ি, পাঞ্জাবি, ইলিশ, ঐতিহ্যবাহী খাবার প্রোমোট করুন।"),
    Festival("eid-ul-adha", "Eid-ul-Adha", "ঈদ-উল-আযহা", "2026-05-27", 14, 2.6,
             ["clothing", "home", "food"],
             "Stock cooking essentials, knives, freezer storage, festive clothing.",
             "রান্নার সামগ্রী, ছুরি, ফ্রিজার ব্যাগ, উৎসবের পোশাক মজুত করুন।"),
    Festival("durga-puja", "Durga Puja", "দুর্গা পূজা", "2026-10-19", 14, 2.2,
             ["clothing", "beauty", "home"],
             "Sarees, jewellery, sweets, decorative items see major lift.",
             "শাড়ি, গহনা, মিষ্টি, সাজসজ্জার সামগ্রীর চাহিদা বাড়ে।"),
    Festival("winter-collection", "Winter season", "শীতকাল", "2026-12-15", 30, 1.6,
             ["clothing", "home"],
             "Push blankets, jackets, warmers. Demand grows steadily Dec-Feb.",
             "কম্বল, জ্যাকেট, হিটার বিক্রি বাড়ান। ডিসেম্বর-ফেব্রুয়ারিতে চাহিদা বাড়ে।"),
    Festival("valentines", "Valentine's Day", "ভ্যালেন্টাইনস ডে", "2026-02-14", 7, 1.8,
             ["beauty", "clothing"],
             "Gift bundles, perfumes, jewellery, flowers move fast in urban markets.",
             "গিফট বান্ডেল, পারফিউম, গহনা, ফুলের বিক্রি শহরাঞ্চলে বাড়ে।"),
]


def _to_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def festival_boost(d, category: str) -> Tuple[float, Optional[str]]:
    """Demand multiplier for a category on a given date, plus the dominant festival id."""
    d = _to_date(d)
    total = 1.0
    strongest = 1.0
    dominant: Optional[str] = None
    for f in FESTIVALS:
        if category not in f.categories:
            continue
        diff = (_to_date(f.date) - d).days
        if -3 <= diff <= f.lead_days:
            ramp = (f.lead_days - diff) / f.lead_days if diff >= 0 else max(0.0, 1 + diff / 3)
            factor = 1 + (f.peak_boost - 1) * max(0.0, ramp)
            total *= factor
            if factor > strongest:
                strongest = factor
                dominant = f.id
    return total, dominant


def upcoming_festivals(frm=None, days: int = 60) -> List[Festival]:
    base = _to_date(frm) if frm else date.today()
    out = []
    for f in FESTIVALS:
        fd = _to_date(f.date)
        if base <= fd <= date.fromordinal(base.toordinal() + days):
            out.append(f)
    out.sort(key=lambda f: _to_date(f.date))
    return out

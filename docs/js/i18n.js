// Translations (Czech default, English). DOM-free core so parsers can use t()
// in tests; applyTranslations() updates the static page.
//
// Keys map to a string, or to plural forms {one, few, many, other} chosen by
// Intl.PluralRules. Placeholders: {name}. Strings used with data-i18n-html
// may contain trusted markup.

const DICT = {
  en: {
    "lang.name": "English",
    "nav.activities": "Activities", "nav.fitness": "Fitness", "nav.trends": "Trends",
    "nav.settings": "Settings", "nav.language": "Language",

    "home.title": "Analyse an activity",
    "home.intro": "Deep stats for any of your Strava activities: splits, zones, best efforts, heart-rate drift and more. Everything is calculated on this device and nothing is uploaded.",
    "step1.title": "Get the activity file from Strava",
    "desk.open": "Open my activities on Strava",
    "desk.s1": "Log in if Strava asks, then click the activity you want.",
    "desk.s2": "Click the <b>⋯</b> (more) button on the left and choose <b>Export Original</b>. The file downloads.",
    "desk.nomenu": "No ⋯ button? Copy the activity’s address, come back and paste it:",
    "phone.copyStrava": "Copy Strava address",
    "phone.s1": "Open a new tab in your browser, <b>paste</b> the address into the address bar and open it. (Typing or pasting it yourself stops the Strava app from taking over.)",
    "phone.s2": "Log in if asked. Tap the activity you want and copy its address from the address bar.",
    "phone.s3": "Come back here and tap <b>Paste link</b>.",
    "paste.btn": "Paste link",
    "paste.placeholder": "…or paste the link here",
    "paste.label": "Strava activity link",
    "desk.download": "Download from Strava",
    "phone.copy": "Copy download link",
    "phone.copyHelp": "Then paste it into your browser’s address bar and open it. The file downloads. (Pasting it yourself stops the Strava app from taking over.)",
    "download.label": "Download link",
    "switch.toDesktop": "Using a computer? Show computer steps",
    "switch.toPhone": "Using a phone or tablet? Show phone steps",
    "step2.title": "Open the downloaded file here",
    "step2.choose": "Choose file",
    "step2.deskHint": "It’s in your Downloads folder, or drag it here from the browser’s downloads list",
    "step2.phoneHint": "Look under <b>Recents</b> or <b>Downloads</b>",
    "home.demo": "No file handy? <a href=\"#/demo\">See a demo activity</a>.",
    "history.title": "Your activities",
    "history.empty": "Activities you open are saved in this browser, so you can come back to them and build up your fitness curve.",

    "link.share": "That’s a share link from the Strava app. Open Strava in the browser (step 1 above), open the activity there and copy the address from the address bar.",
    "toast.stravaCopied": "Copied. Open a new tab and paste it into the address bar.",
    "link.invalid": "That doesn’t look like a Strava activity link. It should look like strava.com/activities/123456789.",
    "clipboard.fail": "Couldn’t read the clipboard. Long-press the box next to the button and choose Paste.",
    "toast.copied": "Copied. Now paste it into the address bar and open it.",
    "toast.copyManual": "Select the link below and copy it.",
    "toast.storage": "Your browser blocked local storage (private mode?). Activities won’t be saved.",
    "toast.recalc": "Recalculating your activities…",
    "toast.updated": "Updated.",
    "toast.added": { one: "Added {n} activity.", other: "Added {n} activities." },
    "status.reading": "Reading {name}…",
    "status.readingN": "Reading {i} of {n}: {name}…",

    "act.back": "← All activities",
    "act.demoBanner": "Demo with made-up data. <a href=\"#/\">Analyse your own activity →</a>",
    "act.viewStrava": "View on Strava",
    "act.delete": "Delete",
    "act.loading": "Loading…",
    "act.notFound": "Activity not found",
    "act.notFoundSub": "It may have been deleted, or it was added in a different browser.",
    "act.confirmDelete": "Delete “{name}” from this device?",
    "act.highlights": "Highlights",
    "act.route": "Route",
    "act.analysis": "Analysis",
    "act.splits": "Splits",
    "act.downloadCsv": "Download CSV",
    "act.gapNote": "GAP = grade-adjusted pace: your equivalent pace on flat ground (estimate).",
    "act.zones": "Zones",
    "act.bestEfforts": "Best efforts",
    "act.powerCurve": "Power curve",
    "act.download": "Download",
    "act.allPoints": "All data points (CSV)",
    "demo.name": "Evening Run (demo)",
    "demo.status": "Demo",

    "map.colorBy": "Colour route by", "map.pace": "Pace", "map.speed": "Speed", "map.hr": "Heart rate", "map.grade": "Grade",
    "map.slower": "slower", "map.faster": "faster", "map.low": "low", "map.high": "high",
    "map.failed": "Map couldn’t load (offline?).",

    "tile.distance": "Distance", "tile.moving": "Moving time", "tile.pace": "Avg pace",
    "tile.gap": "Grade-adj. pace", "tile.speed": "Avg speed", "tile.elev": "Elevation gain",
    "tile.avgHr": "Avg heart rate", "tile.maxHr": "Max heart rate", "tile.power": "Avg power",
    "tile.np": "Normalized power", "tile.cadence": "Cadence", "tile.load": "Training load",
    "tile.elapsed": "Elapsed time", "tile.temp": "Temperature", "tile.est": "est.",
    "unit.bpm": "bpm", "unit.spm": "spm", "unit.rpm": "rpm",

    "chart.pace": "Pace", "chart.gap": "Grade-adjusted pace", "chart.speed": "Speed", "chart.hr": "Heart rate",
    "chart.elev": "Elevation", "chart.cad": "Cadence", "chart.power": "Power",
    "chart.aria": "{label} over the activity",
    "chart.hoverHint": "Touch or hover over the charts to inspect",
    "chart.atKm": "At {x} km", "chart.atTime": "At {x}",
    "chart.fitness": "Fitness", "chart.fatigue": "Fatigue", "chart.form": "Form",
    "chart.weekOf": "Week of {d}", "chart.load": "Load", "chart.range": "Typical range",
    "chart.rangeLegend": "Typical range (last 3 weeks)", "chart.weeklyLoad": "Weekly load", "chart.total": "Total",

    "splits.km": "km", "splits.pace": "Pace /km", "splits.speed": "km/h", "splits.gap": "GAP", "splits.hr": "HR", "splits.elev": "Elev",
    "th.distance": "Distance", "th.time": "Time", "th.pace": "Pace",

    "zones.hr": "Heart-rate zones", "zones.pace": "Pace zones (grade-adjusted)", "zones.power": "Power zones",
    "zones.hrNote": "Based on max heart rate {v} bpm{est}.",
    "zones.paceNote": "Based on threshold pace {v} /km{est}.",
    "zones.powerNote": "Based on FTP {v} W.",
    "zones.est": " (estimated: set yours in Settings)",
    "zones.slower": "slower than {p} /km", "zones.faster": "faster than {p} /km",
    "zone.hr": ["Z1 Recovery", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 Anaerobic"],
    "zone.pace": ["Z1 Recovery", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 VO₂ max", "Z6 Anaerobic"],
    "zone.power": ["Z1 Recovery", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 VO₂ max", "Z6 Anaerobic", "Z7 Neuromuscular"],

    "effort.best": "Best", "effort.2nd": "2nd best", "effort.3rd": "3rd best",
    "effort.noteRuns": "Ranks compare with the other runs you’ve added ({n}).",
    "effort.noteOther": "Ranks compare with the other activities you’ve added ({n}).",
    "effort.empty": "Add more activities to see how these compare with your other runs.",
    "effort.names": {
      "400 m": "400 m", "½ mile": "½ mile", "1 km": "1 km", "1 mile": "1 mile", "2 mile": "2 mile",
      "5 km": "5 km", "10 km": "10 km", "15 km": "15 km", "10 mile": "10 mile", "20 km": "20 km",
      "Half marathon": "Half marathon", "30 km": "30 km", "Marathon": "Marathon",
    },

    "ins.loadVs.harder": "<b>Training load {l}</b>: harder than {p}% of your other {sport} activities.",
    "ins.loadVs.easier": "<b>Training load {l}</b>: easier than {p}% of your other {sport} activities.",
    "ins.load": "<b>Training load {l}</b> (100 ≈ one hour at your threshold effort). {method}",
    "ins.method.hr": "Calculated from your heart rate, second by second.",
    "ins.method.power": "Calculated from your power.",
    "ins.method.pace": "Estimated from your pace (no heart rate in this file).",
    "ins.method.est": "Rough estimate from duration only.",
    "ins.zone": "Most time in <b>{zone}</b> ({p}% of moving time).",
    "ins.driftHigh": "<b>Heart-rate drift {d}%</b>: your heart rate rose relative to pace in the second half, usually from fatigue, heat or low fuel. Under 5% would suggest solid aerobic endurance for this effort.",
    "ins.driftLow": "<b>Heart-rate drift {d}%</b>: heart rate stayed steady relative to pace, which suggests solid aerobic endurance for this effort.",
    "ins.stops": {
      one: "{n} stop, <b>{t}</b> not moving in total (left out of moving time and pace).",
      other: "{n} stops, <b>{t}</b> not moving in total (left out of moving time and pace).",
    },
    "ins.even": "<b>Even pacing</b>: first and second half within 5 s/km (grade-adjusted).",
    "ins.negative": "<b>Negative split</b>: second half {s} s/km faster (grade-adjusted).",
    "ins.positive": "<b>Positive split</b>: second half {s} s/km slower (grade-adjusted).",

    "fit.title": "Fitness & freshness",
    "fit.empty": "Add some activities first. The curve builds from every activity you open here.",
    "fit.fatigueSub": "last ~7 days",
    "fit.delta": "{d} vs 7 days ago",
    "fit.chartTitle": "Fitness & fatigue",
    "fit.range": "Time range",
    "fit.r3": "3M", "fit.r6": "6M", "fit.r12": "1Y", "fit.rAll": "All",
    "fit.formTitle": "Form <span class=\"muted\">(fitness − fatigue: above 0 fresh, below 0 tired)</span>",
    "fit.weekly": "Weekly training load",
    "fit.how": "How is this calculated?",
    "fit.how1": "Every activity gets a <b>training load</b> score, where 100 ≈ one hour at your threshold (your hardest sustainable effort). It comes from your heart rate second by second, or power if you set an FTP, or pace if there’s no heart rate.",
    "fit.how2": "<b>Fitness</b> is your load averaged over ~6 weeks, <b>fatigue</b> over ~1 week, and <b>form</b> is yesterday’s fitness minus fatigue. Set your max and resting heart rate in Settings for more accurate numbers.",
    "fit.coverage": {
      one: "Based on the {n} activity you’ve added ({from} – {to}). It’s only accurate if you add all your activities, including easy ones, for at least the last 6 weeks.",
      other: "Based on the {n} activities you’ve added ({from} – {to}). It’s only accurate if you add all your activities, including easy ones, for at least the last 6 weeks.",
    },
    "form.fresh2": "Fresh — possibly losing fitness", "form.fresh": "Fresh", "form.neutral": "Neutral",
    "form.productive": "Productive training", "form.tired": "Very tired — injury risk",

    "tr.title": "Trends", "tr.empty": "Add some activities first.",
    "tr.per": "Per", "tr.week": "Week", "tr.month": "Month", "tr.year": "Year",
    "tr.show": "Show", "tr.distance": "Distance", "tr.time": "Time", "tr.elevation": "Elevation", "tr.count": "Activities",
    "tr.sport": "Sport", "tr.allSports": "All sports", "tr.other": "Other",

    "footer": "Uses data you export from Strava · Not affiliated with Strava, Inc. · Map © OpenStreetMap contributors",

    "set.title": "Settings",
    "set.intro": "Used for zones and training load. Leave a field empty to use the estimate shown.",
    "set.maxhr": "Max heart rate", "set.resthr": "Resting heart rate", "set.formula": "Heart-rate formula",
    "set.male": "Male", "set.female": "Female",
    "set.pace": "Threshold run pace (min:sec per km)", "set.ftp": "Cycling FTP (watts, optional)",
    "set.cancel": "Cancel", "set.save": "Save", "set.estimate": " (estimate)",
    "set.paceInvalid": "Use minutes:seconds, e.g. 4:45",
    "set.data": "Your data", "set.dataNote": "Stored only in this browser.",
    "set.csv": "All activities (CSV)", "set.json": "All activities (JSON)",
    "set.deleteAll": "Delete everything from this device",
    "set.confirmDeleteAll": "Delete all activities and settings from this device? This can’t be undone.",

    "sport": {
      Run: "Run", TrailRun: "Trail Run", VirtualRun: "Treadmill Run", Ride: "Ride", VirtualRide: "Virtual Ride",
      MountainBikeRide: "Mountain Bike Ride", GravelRide: "Gravel Ride", EBikeRide: "E-Bike Ride", Walk: "Walk",
      Hike: "Hike", Swim: "Swim", WeightTraining: "Weight Training", Workout: "Workout", Yoga: "Yoga",
      Rowing: "Rowing", NordicSki: "Nordic Ski", AlpineSki: "Alpine Ski", Kayaking: "Kayaking",
      StandUpPaddling: "Stand Up Paddling", Other: "Other",
    },

    "picker.desc": "Activity files",
    "err.tooFew": "This file has too few data points to analyse.",
    "err.noRecords": "This file has no recorded data points.",
    "err.notFit": "Not a FIT file.",
    "err.corruptFit": "This FIT file is damaged.",
    "err.gz": "This browser can’t open .gz files. Please update it or unzip the file first.",
    "err.zip": "That’s a ZIP file. Please pick a single activity file (.fit, .gpx or .tcx).",
    "err.html": "That file is a web page, not an activity. You probably weren’t logged in to strava.com when downloading. Log in and try the download again.",
    "err.unknown": "Unknown file type. Please pick a .fit, .gpx or .tcx file exported from Strava.",
    "err.xml": "The file couldn’t be read (invalid XML).",
    "err.noPoints": "This file has no track points.",
  },

  cs: {
    "lang.name": "Čeština",
    "nav.activities": "Aktivity", "nav.fitness": "Kondice", "nav.trends": "Trendy",
    "nav.settings": "Nastavení", "nav.language": "Jazyk",

    "home.title": "Analýza aktivity",
    "home.intro": "Podrobné statistiky ke každé vaší aktivitě ze Stravy: mezičasy, zóny, nejlepší výkony, drift tepu a další. Vše se počítá v tomto zařízení a nic se nikam nenahrává.",
    "step1.title": "Stáhněte si soubor aktivity ze Stravy",
    "desk.open": "Otevřít moje aktivity na Stravě",
    "desk.s1": "Přihlaste se, pokud o to Strava požádá, a klikněte na aktivitu, kterou chcete.",
    "desk.s2": "Vlevo klikněte na tlačítko <b>⋯</b> (více) a zvolte <b>Exportovat originál</b> (Export Original). Soubor se stáhne.",
    "desk.nomenu": "Nevidíte tlačítko ⋯? Zkopírujte adresu aktivity, vraťte se sem a vložte ji:",
    "phone.copyStrava": "Zkopírovat adresu Stravy",
    "phone.s1": "Otevřete v prohlížeči novou kartu, adresu <b>vložte</b> do adresního řádku a otevřete ji. (Když adresu vložíte sami, neotevře se místo toho aplikace Strava.)",
    "phone.s2": "Pokud je potřeba, přihlaste se. Klepněte na aktivitu, kterou chcete, a zkopírujte její adresu z adresního řádku.",
    "phone.s3": "Vraťte se sem a klepněte na <b>Vložit odkaz</b>.",
    "paste.btn": "Vložit odkaz",
    "paste.placeholder": "…nebo odkaz vložte sem",
    "paste.label": "Odkaz na aktivitu na Stravě",
    "desk.download": "Stáhnout ze Stravy",
    "phone.copy": "Zkopírovat odkaz ke stažení",
    "phone.copyHelp": "Pak ho vložte do adresního řádku prohlížeče a otevřete. Soubor se stáhne. (Když odkaz vložíte sami, neotevře se místo toho aplikace Strava.)",
    "download.label": "Odkaz ke stažení",
    "switch.toDesktop": "Jste na počítači? Zobrazit postup pro počítač",
    "switch.toPhone": "Jste na telefonu nebo tabletu? Zobrazit postup pro telefon",
    "step2.title": "Otevřete stažený soubor tady",
    "step2.choose": "Vybrat soubor",
    "step2.deskHint": "Najdete ho ve složce Stažené soubory, nebo ho sem přetáhněte ze seznamu stažených souborů v prohlížeči",
    "step2.phoneHint": "Hledejte v části <b>Nedávné</b> nebo ve složce <b>Stažené soubory</b>",
    "home.demo": "Nemáte po ruce soubor? <a href=\"#/demo\">Podívejte se na ukázkovou aktivitu</a>.",
    "history.title": "Vaše aktivity",
    "history.empty": "Otevřené aktivity se ukládají v tomto prohlížeči, takže se k nim můžete vracet a postupně si budovat křivku kondice.",

    "link.share": "Tohle je odkaz pro sdílení z aplikace Strava. Otevřete Stravu v prohlížeči (krok 1 výše), tam otevřete aktivitu a zkopírujte adresu z adresního řádku.",
    "toast.stravaCopied": "Zkopírováno. Otevřete novou kartu a vložte adresu do adresního řádku.",
    "link.invalid": "Tohle nevypadá jako odkaz na aktivitu na Stravě. Měl by vypadat jako strava.com/activities/123456789.",
    "clipboard.fail": "Nepodařilo se přečíst schránku. Podržte prst na políčku vedle tlačítka a zvolte Vložit.",
    "toast.copied": "Zkopírováno. Teď odkaz vložte do adresního řádku a otevřete ho.",
    "toast.copyManual": "Označte odkaz níže a zkopírujte ho.",
    "toast.storage": "Prohlížeč zablokoval ukládání dat (anonymní režim?). Aktivity se neuloží.",
    "toast.recalc": "Přepočítávám vaše aktivity…",
    "toast.updated": "Hotovo.",
    "toast.added": { one: "Přidána {n} aktivita.", few: "Přidány {n} aktivity.", other: "Přidáno {n} aktivit." },
    "status.reading": "Načítám {name}…",
    "status.readingN": "Načítám {i} z {n}: {name}…",

    "act.back": "← Všechny aktivity",
    "act.demoBanner": "Ukázka s vymyšlenými daty. <a href=\"#/\">Analyzujte vlastní aktivitu →</a>",
    "act.viewStrava": "Zobrazit na Stravě",
    "act.delete": "Smazat",
    "act.loading": "Načítám…",
    "act.notFound": "Aktivita nenalezena",
    "act.notFoundSub": "Možná byla smazána, nebo byla přidána v jiném prohlížeči.",
    "act.confirmDelete": "Smazat „{name}“ z tohoto zařízení?",
    "act.highlights": "To nejdůležitější",
    "act.route": "Trasa",
    "act.analysis": "Průběh",
    "act.splits": "Mezičasy",
    "act.downloadCsv": "Stáhnout CSV",
    "act.gapNote": "GAP = tempo upravené o sklon: odpovídající tempo na rovině (odhad).",
    "act.zones": "Zóny",
    "act.bestEfforts": "Nejlepší výkony",
    "act.powerCurve": "Výkonová křivka",
    "act.download": "Stáhnout",
    "act.allPoints": "Všechny datové body (CSV)",
    "demo.name": "Večerní běh (ukázka)",
    "demo.status": "Ukázka",

    "map.colorBy": "Obarvit trasu podle", "map.pace": "Tempo", "map.speed": "Rychlost", "map.hr": "Tep", "map.grade": "Sklon",
    "map.slower": "pomaleji", "map.faster": "rychleji", "map.low": "nižší", "map.high": "vyšší",
    "map.failed": "Mapu se nepodařilo načíst (jste offline?).",

    "tile.distance": "Vzdálenost", "tile.moving": "Čas v pohybu", "tile.pace": "Průměrné tempo",
    "tile.gap": "Tempo upr. o sklon", "tile.speed": "Průměrná rychlost", "tile.elev": "Převýšení",
    "tile.avgHr": "Průměrný tep", "tile.maxHr": "Maximální tep", "tile.power": "Průměrný výkon",
    "tile.np": "Normalizovaný výkon", "tile.cadence": "Kadence", "tile.load": "Tréninková zátěž",
    "tile.elapsed": "Celkový čas", "tile.temp": "Teplota", "tile.est": "odhad",
    "unit.bpm": "tep/min", "unit.spm": "kroků/min", "unit.rpm": "ot/min",

    "chart.pace": "Tempo", "chart.gap": "Tempo upravené o sklon", "chart.speed": "Rychlost", "chart.hr": "Tep",
    "chart.elev": "Nadmořská výška", "chart.cad": "Kadence", "chart.power": "Výkon",
    "chart.aria": "{label} v průběhu aktivity",
    "chart.hoverHint": "Dotkněte se grafu nebo na něj najeďte myší",
    "chart.atKm": "Na {x} km", "chart.atTime": "V čase {x}",
    "chart.fitness": "Kondice", "chart.fatigue": "Únava", "chart.form": "Forma",
    "chart.weekOf": "Týden od {d}", "chart.load": "Zátěž", "chart.range": "Obvyklé rozmezí",
    "chart.rangeLegend": "Obvyklé rozmezí (poslední 3 týdny)", "chart.weeklyLoad": "Týdenní zátěž", "chart.total": "Celkem",

    "splits.km": "km", "splits.pace": "Tempo /km", "splits.speed": "km/h", "splits.gap": "GAP", "splits.hr": "Tep", "splits.elev": "Převýš.",
    "th.distance": "Vzdálenost", "th.time": "Čas", "th.pace": "Tempo",

    "zones.hr": "Tepové zóny", "zones.pace": "Tempové zóny (upravené o sklon)", "zones.power": "Výkonové zóny",
    "zones.hrNote": "Podle maximálního tepu {v} tep/min{est}.",
    "zones.paceNote": "Podle prahového tempa {v} /km{est}.",
    "zones.powerNote": "Podle FTP {v} W.",
    "zones.est": " (odhad – nastavte si vlastní v Nastavení)",
    "zones.slower": "pomaleji než {p} /km", "zones.faster": "rychleji než {p} /km",
    "zone.hr": ["Z1 Regenerace", "Z2 Vytrvalost", "Z3 Tempo", "Z4 Práh", "Z5 Anaerobní"],
    "zone.pace": ["Z1 Regenerace", "Z2 Vytrvalost", "Z3 Tempo", "Z4 Práh", "Z5 VO₂ max", "Z6 Anaerobní"],
    "zone.power": ["Z1 Regenerace", "Z2 Vytrvalost", "Z3 Tempo", "Z4 Práh", "Z5 VO₂ max", "Z6 Anaerobní", "Z7 Neuromuskulární"],

    "effort.best": "Nejlepší", "effort.2nd": "2. nejlepší", "effort.3rd": "3. nejlepší",
    "effort.noteRuns": "Pořadí v porovnání s ostatními běhy, které jste přidali (celkem {n}).",
    "effort.noteOther": "Pořadí v porovnání s ostatními aktivitami, které jste přidali (celkem {n}).",
    "effort.empty": "Přidejte další aktivity a uvidíte, jak si vedete v porovnání s ostatními běhy.",
    "effort.names": {
      "400 m": "400 m", "½ mile": "½ míle", "1 km": "1 km", "1 mile": "1 míle", "2 mile": "2 míle",
      "5 km": "5 km", "10 km": "10 km", "15 km": "15 km", "10 mile": "10 mil", "20 km": "20 km",
      "Half marathon": "Půlmaraton", "30 km": "30 km", "Marathon": "Maraton",
    },

    "ins.loadVs.harder": "<b>Tréninková zátěž {l}</b>: náročnější než {p} % vašich ostatních aktivit typu {sport}.",
    "ins.loadVs.easier": "<b>Tréninková zátěž {l}</b>: lehčí než {p} % vašich ostatních aktivit typu {sport}.",
    "ins.load": "<b>Tréninková zátěž {l}</b> (100 ≈ hodina na úrovni vašeho prahu). {method}",
    "ins.method.hr": "Spočítáno z vašeho tepu, sekundu po sekundě.",
    "ins.method.power": "Spočítáno z vašeho výkonu.",
    "ins.method.pace": "Odhadnuto z tempa (soubor neobsahuje tep).",
    "ins.method.est": "Hrubý odhad jen podle délky trvání.",
    "ins.zone": "Nejvíc času v zóně <b>{zone}</b> ({p} % času v pohybu).",
    "ins.driftHigh": "<b>Drift tepu {d} %</b>: ve druhé polovině vám tep vzhledem k tempu stoupl, obvykle kvůli únavě, horku nebo nedostatku energie. Hodnota pod 5 % by ukazovala na dobrou aerobní vytrvalost.",
    "ins.driftLow": "<b>Drift tepu {d} %</b>: tep zůstal vzhledem k tempu stabilní, což ukazuje na dobrou aerobní vytrvalost při tomto úsilí.",
    "ins.stops": {
      one: "{n} zastávka, celkem <b>{t}</b> bez pohybu (nezapočítává se do času v pohybu ani do tempa).",
      few: "{n} zastávky, celkem <b>{t}</b> bez pohybu (nezapočítávají se do času v pohybu ani do tempa).",
      other: "{n} zastávek, celkem <b>{t}</b> bez pohybu (nezapočítávají se do času v pohybu ani do tempa).",
    },
    "ins.even": "<b>Vyrovnané tempo</b>: první a druhá polovina se liší o méně než 5 s/km (po úpravě o sklon).",
    "ins.negative": "<b>Negativní split</b>: druhá polovina o {s} s/km rychlejší (po úpravě o sklon).",
    "ins.positive": "<b>Pozitivní split</b>: druhá polovina o {s} s/km pomalejší (po úpravě o sklon).",

    "fit.title": "Kondice a svěžest",
    "fit.empty": "Nejdřív přidejte nějaké aktivity. Křivka se skládá ze všech aktivit, které tu otevřete.",
    "fit.fatigueSub": "posledních ~7 dní",
    "fit.delta": "{d} za posledních 7 dní",
    "fit.chartTitle": "Kondice a únava",
    "fit.range": "Časové období",
    "fit.r3": "3 měs.", "fit.r6": "6 měs.", "fit.r12": "1 rok", "fit.rAll": "Vše",
    "fit.formTitle": "Forma <span class=\"muted\">(kondice − únava: nad 0 svěží, pod 0 unavený)</span>",
    "fit.weekly": "Týdenní tréninková zátěž",
    "fit.how": "Jak se to počítá?",
    "fit.how1": "Každá aktivita dostane skóre <b>tréninkové zátěže</b>, kde 100 ≈ hodina na úrovni vašeho prahu (nejvyššího úsilí, které dokážete udržet). Počítá se z tepu sekundu po sekundě, z výkonu, pokud máte nastavené FTP, nebo z tempa, když chybí tep.",
    "fit.how2": "<b>Kondice</b> je průměrná zátěž za ~6 týdnů, <b>únava</b> za ~1 týden a <b>forma</b> je včerejší kondice mínus únava. Pro přesnější čísla si v Nastavení zadejte svůj maximální a klidový tep.",
    "fit.coverage": {
      one: "Vychází z {n} aktivity, kterou jste přidali ({from} – {to}). Přesné je to jen tehdy, když přidáte všechny aktivity včetně lehkých, aspoň za posledních 6 týdnů.",
      other: "Vychází z aktivit, které jste přidali (celkem {n}, {from} – {to}). Přesné je to jen tehdy, když přidáte všechny aktivity včetně lehkých, aspoň za posledních 6 týdnů.",
    },
    "form.fresh2": "Svěží – možná ztrácíte kondici", "form.fresh": "Svěží", "form.neutral": "Neutrální",
    "form.productive": "Produktivní trénink", "form.tired": "Velmi unavený – riziko zranění",

    "tr.title": "Trendy", "tr.empty": "Nejdřív přidejte nějaké aktivity.",
    "tr.per": "Období", "tr.week": "Týden", "tr.month": "Měsíc", "tr.year": "Rok",
    "tr.show": "Zobrazit", "tr.distance": "Vzdálenost", "tr.time": "Čas", "tr.elevation": "Převýšení", "tr.count": "Počet aktivit",
    "tr.sport": "Sport", "tr.allSports": "Všechny sporty", "tr.other": "Ostatní",

    "footer": "Používá data, která si sami vyexportujete ze Stravy · Není nijak spojeno se společností Strava, Inc. · Mapa © přispěvatelé OpenStreetMap",

    "set.title": "Nastavení",
    "set.intro": "Používá se pro zóny a tréninkovou zátěž. Když pole necháte prázdné, použije se zobrazený odhad.",
    "set.maxhr": "Maximální tep", "set.resthr": "Klidový tep", "set.formula": "Výpočet podle tepu",
    "set.male": "Muž", "set.female": "Žena",
    "set.pace": "Prahové běžecké tempo (min:s na km)", "set.ftp": "FTP na kole (watty, nepovinné)",
    "set.cancel": "Zrušit", "set.save": "Uložit", "set.estimate": " (odhad)",
    "set.paceInvalid": "Zadejte minuty:sekundy, např. 4:45",
    "set.data": "Vaše data", "set.dataNote": "Uložená jen v tomto prohlížeči.",
    "set.csv": "Všechny aktivity (CSV)", "set.json": "Všechny aktivity (JSON)",
    "set.deleteAll": "Smazat vše z tohoto zařízení",
    "set.confirmDeleteAll": "Smazat všechny aktivity a nastavení z tohoto zařízení? Nelze to vrátit zpět.",

    "sport": {
      Run: "Běh", TrailRun: "Trailový běh", VirtualRun: "Běh na pásu", Ride: "Kolo", VirtualRide: "Virtuální jízda",
      MountainBikeRide: "Horské kolo", GravelRide: "Gravel", EBikeRide: "Elektrokolo", Walk: "Chůze",
      Hike: "Turistika", Swim: "Plavání", WeightTraining: "Posilování", Workout: "Trénink", Yoga: "Jóga",
      Rowing: "Veslování", NordicSki: "Běžky", AlpineSki: "Sjezdovky", Kayaking: "Kajak",
      StandUpPaddling: "Paddleboard", Other: "Ostatní",
    },

    "picker.desc": "Soubory aktivit",
    "err.tooFew": "Soubor obsahuje příliš málo dat na analýzu.",
    "err.noRecords": "Soubor neobsahuje žádná zaznamenaná data.",
    "err.notFit": "Nejde o soubor FIT.",
    "err.corruptFit": "Tento soubor FIT je poškozený.",
    "err.gz": "Tento prohlížeč neumí otevřít soubory .gz. Aktualizujte ho, nebo soubor nejdřív rozbalte.",
    "err.zip": "Tohle je soubor ZIP. Vyberte prosím jeden soubor aktivity (.fit, .gpx nebo .tcx).",
    "err.html": "Tenhle soubor je webová stránka, ne aktivita. Nejspíš jste při stahování nebyli přihlášení na strava.com. Přihlaste se a stáhněte soubor znovu.",
    "err.unknown": "Neznámý typ souboru. Vyberte prosím soubor .fit, .gpx nebo .tcx vyexportovaný ze Stravy.",
    "err.xml": "Soubor se nepodařilo přečíst (neplatné XML).",
    "err.noPoints": "Soubor neobsahuje žádné body trasy.",
  },
};

export const LANGS = ["cs", "en"];
const LOCALES = { cs: "cs-CZ", en: "en-GB" };
let lang = "cs";

export const getLang = () => lang;
export const locale = () => LOCALES[lang];
export function setLang(l) { if (DICT[l]) lang = l; }

/** Translate key with {placeholders}; objects with plural forms use vars.n. */
export function t(key, vars = {}) {
  let v = DICT[lang][key] ?? DICT.en[key] ?? key;
  if (v && typeof v === "object" && !Array.isArray(v) && ("other" in v)) {
    const form = new Intl.PluralRules(locale()).select(vars.n ?? 0);
    v = v[form] ?? v.other;
  }
  if (typeof v !== "string") return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Number with locale decimal separator. */
export function num(x, digits = 0) {
  if (x == null || !Number.isFinite(x)) return "–";
  return x.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function sportName(s) {
  const map = t("sport");
  return map[s] || (s || "Workout").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Update static text: data-i18n (text), data-i18n-html, data-i18n-placeholder, data-i18n-aria. */
export function applyTranslations(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
    if (el.hasAttribute("title")) el.title = t(el.dataset.i18nAria);
  }
}

// Builds the seminar deck: node build-deck.cjs <output.pptx>
// Structured deck (theme, layouts, sections, placeholders) with pptxgenjs.
const path = require("path");
const pptxgen = require("pptxgenjs");
const QRCode = require("qrcode");

const SKILL_DIR =
  "C:/Users/Suresh/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/local-agent-mode-sessions/skills-plugin/dde6bac1-9614-4258-a064-3aca585f1de7/0fd928af-9eb0-4644-a9c5-ab173113d30d/skills/pptx";
const { applyTheme } = require(path.join(SKILL_DIR, "scripts/apply_theme.js"));

const OUT = process.argv[2] || "Investment-Plans-Seminar.pptx";
const INQUIRY_URL = "https://payout-calculator-steel.vercel.app/inquiries";
const INQUIRY_URL_SHORT = "payout-calculator-steel.vercel.app/inquiries";

// Current production rates (percent per year), used only to calculate payouts.
// Rates themselves are not shown on the slides, matching the website.
const RATES = { quarterly: 8, "half-yearly": 9, yearly: 10 };
const AMOUNTS = [25000, 50000, 100000];

const DISCLAIMER =
  "This calculator provides illustrative estimates based on the selected assumptions. Earnings are assumed to start on the next business day after the planned investment date, counting Monday to Friday as business days; public holidays are not taken into account. Actual returns, payment timing, taxes, fees, and principal repayment may differ. This calculator is not a guarantee of investment performance or a substitute for professional financial advice.";

const THEME = {
  name: "Payout Plans",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B2A41",
    lt1: "FFFFFF",
    dk2: "16285A",
    lt2: "EEF3FB",
    accent1: "1E3A8A",
    accent2: "C9A227",
    accent3: "0E7490",
    accent4: "64748B",
    accent5: "DCE6F5",
    accent6: "15803D",
    hlink: "1E3A8A",
    folHlink: "5B21B6",
  },
};
const HEX = THEME.colors;

const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number.isInteger(n) ? 0 : 2, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);

const PLANS = [
  {
    key: "quarterly",
    title: "Quarterly payouts",
    perYear: 4,
    every: "every 3 months",
    lead: "Earnings every 3 months, 4 payouts a year, your full amount back at the end of the term",
    payoutLabel: "Every quarter you receive",
  },
  {
    key: "half-yearly",
    title: "Half-yearly payouts",
    perYear: 2,
    every: "every 6 months",
    lead: "Earnings every 6 months, 2 payouts a year, your full amount back at the end of the term",
    payoutLabel: "Every 6 months you receive",
  },
  {
    key: "yearly",
    title: "Yearly payouts",
    perYear: 1,
    every: "once a year",
    lead: "Earnings once a year, 1 payout a year, your full amount back at the end of the term",
    payoutLabel: "Every year you receive",
  },
];

const plural = (n) => `${n} payout${n === 1 ? "" : "s"}`;

function planNumbers(plan, principal, years) {
  // Simple earnings, Earnings Only: same payout each period, principal returned at maturity.
  const rate = RATES[plan.key] / 100;
  const perPayout = Math.round(((principal * rate) / plan.perYear) * 100) / 100;
  const payouts = plan.perYear * years;
  const totalInterest = Math.round(principal * rate * years * 100) / 100;
  return { perPayout, payouts, totalInterest, totalReceived: principal + totalInterest };
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9"; // 10" x 5.625"
  pres.title = "Fixed-Term Investment Plans";
  pres.subject = "Quarterly, half-yearly and yearly payout plans";
  pres.author = "Investment Payout Calculator";
  pres.company = "Investment Payout Calculator";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ---------- layouts ----------
  pres.defineSlideMaster({
    title: "TITLE_DARK",
    background: { color: C.text2 },
    objects: [
      {
        placeholder: {
          options: { name: "title", type: "title", x: 0.6, y: 1.05, w: 8.8, h: 1.0, fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 },
          text: "",
        },
      },
      {
        placeholder: {
          options: { name: "body", type: "body", x: 0.6, y: 2.15, w: 8.8, h: 0.6, fontSize: 20, color: C.background2, valign: "top", margin: 0 },
          text: "",
        },
      },
    ],
  });

  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: C.background1 },
    margin: [0.5, 0.5, 0.5, 0.5],
    objects: [
      {
        placeholder: {
          options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9.0, h: 0.65, fontSize: 32, bold: true, color: C.accent1, valign: "middle", margin: 0 },
          text: "",
        },
      },
      { text: { text: "Fixed-Term Investment Plans", options: { x: 0.5, y: 5.25, w: 5, h: 0.25, fontSize: 10, color: C.accent4, margin: 0, isTextBox: true } } },
    ],
    slideNumber: { x: 9.0, y: 5.25, w: 0.5, h: 0.25, fontSize: 10, color: HEX.accent4, align: "right" },
  });

  pres.defineSlideMaster({
    title: "CLOSING_DARK",
    background: { color: C.text2 },
    objects: [
      {
        placeholder: {
          options: { name: "title", type: "title", x: 0.6, y: 0.45, w: 8.8, h: 0.8, fontSize: 36, bold: true, color: C.background1, valign: "middle", align: "left", margin: 0 },
          text: "",
        },
      },
    ],
  });

  // ---------- 1. Title ----------
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addText("Fixed-Term Investment Plans", { placeholder: "title" });
  s.addText("Regular payouts every quarter, half-year or year", { placeholder: "body" });
  const cadences = [
    { big: "4×", small: "Quarterly", note: "a year" },
    { big: "2×", small: "Half-yearly", note: "a year" },
    { big: "1×", small: "Yearly", note: "a year" },
  ];
  cadences.forEach((c, i) => {
    const x = 0.6 + i * 3.0;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 3.25, w: 2.7, h: 1.45, rectRadius: 0.12,
      fill: { color: C.accent1 }, line: { color: C.accent1 },
      objectName: `Cadence card ${c.small}`,
    });
    s.addShape(pres.shapes.OVAL, {
      x: x + 0.25, y: 3.55, w: 0.85, h: 0.85, fill: { color: C.accent2 }, line: { color: C.accent2 },
      objectName: `Cadence badge ${c.small}`,
    });
    s.addText(c.big, { x: x + 0.25, y: 3.55, w: 0.85, h: 0.85, fontSize: 24, bold: true, color: C.text2, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `Cadence count ${c.small}` });
    s.addText([
      { text: c.small, options: { fontSize: 18, bold: true, color: C.background1, breakLine: true } },
      { text: `payouts ${c.note}`, options: { fontSize: 14, color: C.background2 } },
    ], { x: x + 1.25, y: 3.5, w: 1.35, h: 0.95, valign: "middle", margin: 0, isTextBox: true, objectName: `Cadence label ${c.small}` });
  });
  s.addText("1- and 2-year terms · from $25,000", { x: 0.6, y: 4.85, w: 8.8, h: 0.35, fontSize: 14, color: C.accent2, italic: true, margin: 0, isTextBox: true });
  s.addNotes(
    "Welcome. Today we will walk through three simple payout plans. You choose how much to invest, how long to lock it in (one or two years), and how often you want to be paid: every quarter, every six months, or once a year.",
  );

  // ---------- 2. How it works ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Introduction" });
  s.addText("How it works", { placeholder: "title" });
  const steps = [
    { head: "Choose your amount", body: "$25,000, $50,000, $75,000 or $100,000" },
    { head: "Lock it in", body: "For a term of 1 or 2 years" },
    { head: "Pick your payout term", body: "Quarterly, half-yearly or yearly" },
    { head: "Get paid", body: "Earnings every period, your full amount back at the end" },
  ];
  steps.forEach((st, i) => {
    const x = 0.5 + i * 2.3;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.25, w: 2.05, h: 2.45, rectRadius: 0.1,
      fill: { color: C.background2 }, line: { color: C.background2 }, objectName: `Step card ${i + 1}`,
    });
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: 1.45, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: `Step badge ${i + 1}` });
    s.addText(String(i + 1), { x: x + 0.2, y: 1.45, w: 0.6, h: 0.6, fontSize: 20, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `Step number ${i + 1}` });
    s.addText([
      { text: st.head, options: { fontSize: 16, bold: true, color: C.text2, breakLine: true } },
      { text: st.body, options: { fontSize: 14, color: C.text1 } },
    ], { x: x + 0.2, y: 2.2, w: 1.7, h: 1.4, valign: "top", margin: 0, paraSpaceAfter: 4, isTextBox: true, objectName: `Step text ${i + 1}` });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 3.95, w: 9.0, h: 1.05, rectRadius: 0.1, fill: { color: C.accent5 }, line: { color: C.accent5 }, objectName: "Good to know box",
  });
  s.addText([
    { text: "Good to know  ", options: { bold: true, color: C.accent1 } },
    { text: "Earnings are simple (not compounded) and start the next business day after you invest. Prefer part of your money back with every payout? Choose ", options: { color: C.text1 } },
    { text: "Earnings and Principal", options: { bold: true, color: C.text1 } },
    { text: " instead of Earnings Only.", options: { color: C.text1 } },
  ], { x: 0.75, y: 4.0, w: 8.5, h: 0.95, fontSize: 14, valign: "middle", margin: 0, isTextBox: true });
  s.addNotes(
    "Four steps. Pick an amount, lock it in for one or two years, choose how often you are paid, and receive earnings each period with your full amount back at the end. The next three slides show what each payout term means in real dollars. Mention the Earnings and Principal option for people who want part of their money back sooner.",
  );

  // ---------- 3-5. Plans ----------
  pres.addSection({ title: "Plans" });
  const border = { type: "solid", pt: 0.75, color: "C7D3E8" };
  for (const plan of PLANS) {
    s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Plans" });
    s.addText(plan.title, { placeholder: "title" });
    s.addText(plan.lead, { x: 0.5, y: 0.98, w: 9.0, h: 0.35, fontSize: 14, color: C.text1, margin: 0, isTextBox: true });

    // Left: per-payout card
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y: 1.5, w: 3.0, h: 3.25, rectRadius: 0.12, fill: { color: C.accent1 }, line: { color: C.accent1 },
      objectName: `${plan.title} payout card`,
    });
    s.addText(plan.payoutLabel, { x: 0.75, y: 1.65, w: 2.6, h: 0.4, fontSize: 16, bold: true, color: C.background1, margin: 0, isTextBox: true });
    AMOUNTS.forEach((amount, i) => {
      const n = planNumbers(plan, amount, 1);
      const y = 2.1 + i * 0.88;
      s.addText(`on ${usd(amount)}`, { x: 0.75, y, w: 2.6, h: 0.3, fontSize: 14, color: C.background2, margin: 0, isTextBox: true });
      s.addText(usd(n.perPayout), { x: 0.75, y: y + 0.27, w: 2.6, h: 0.55, fontSize: 30, bold: true, color: C.accent2, margin: 0, isTextBox: true, objectName: `${plan.title} payout ${amount}` });
    });

    // Right: 1-year vs 2-year table
    const one = planNumbers(plan, AMOUNTS[0], 1).payouts;
    const two = planNumbers(plan, AMOUNTS[0], 2).payouts;
    const head = (text, extra = {}) => ({
      text,
      options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk2 }, align: "center", valign: "middle", fontSize: 13, ...extra },
    });
    const sub = (text) => ({ text, options: { bold: true, color: HEX.dk2, fill: { color: HEX.accent5 }, align: "center", valign: "middle", fontSize: 12 } });
    const cell = (text, extra = {}) => ({ text, options: { color: HEX.dk1, align: "right", valign: "middle", fontSize: 14, ...extra } });
    const rows = [
      [
        head("Investment", { rowspan: 2, align: "left" }),
        head(`1-year term (${one} payout${one === 1 ? "" : "s"})`, { colspan: 2 }),
        head(`2-year term (${two} payouts)`, { colspan: 2 }),
      ],
      [sub("Earnings"), sub("You receive"), sub("Earnings"), sub("You receive")],
      ...AMOUNTS.map((amount, i) => {
        const a = planNumbers(plan, amount, 1);
        const b = planNumbers(plan, amount, 2);
        const fill = { color: i % 2 === 0 ? HEX.lt1 : HEX.lt2 };
        return [
          cell(usd(amount), { align: "left", bold: true, fill }),
          cell(usd(a.totalInterest), { fill }),
          cell(usd(a.totalReceived), { fill }),
          cell(usd(b.totalInterest), { fill, bold: true, color: HEX.accent1 }),
          cell(usd(b.totalReceived), { fill }),
        ];
      }),
    ];
    s.addTable(rows, {
      x: 3.8, y: 1.5, w: 5.7, colW: [1.3, 1.05, 1.15, 1.05, 1.15], rowH: [0.45, 0.4, 0.45, 0.45, 0.45],
      border, margin: [0.03, 0.08, 0.03, 0.08],
    });

    // Callout under the table
    const big = planNumbers(plan, 100000, 2);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 3.8, y: 3.9, w: 5.7, h: 0.85, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 },
      objectName: `${plan.title} callout box`,
    });
    s.addText([
      { text: "Example: ", options: { bold: true, color: C.accent1 } },
      { text: "$100,000 for 2 years earns ", options: { color: C.text1 } },
      { text: `${usd(big.totalInterest)} in earnings`, options: { bold: true, color: C.text1 } },
      { text: ` (${big.payouts} payout${big.payouts === 1 ? "" : "s"} of ${usd(big.perPayout)}), plus your $100,000 back at the end.`, options: { color: C.text1 } },
    ], { x: 4.0, y: 3.92, w: 5.3, h: 0.8, fontSize: 14, valign: "middle", margin: 0, isTextBox: true });

    s.addText("Earnings Only payouts shown. Illustrative figures; see the disclaimer at the end.", {
      x: 0.5, y: 4.88, w: 9.0, h: 0.22, fontSize: 10, color: C.accent4, italic: true, margin: 0, isTextBox: true,
    });
    const ex = planNumbers(plan, 25000, 1);
    s.addNotes(
      `${plan.title}. You are paid ${plan.every}. On $25,000 that is ${usd(ex.perPayout)} each time. ` +
        `Over a 1-year term that is ${plural(planNumbers(plan, 25000, 1).payouts)}; over 2 years, ${plural(planNumbers(plan, 25000, 2).payouts)}. ` +
        `Your full investment is returned with the last payout. The table shows total earnings and the total you receive for $25,000, $50,000 and $100,000.`,
    );
  }

  // ---------- 6. Closing ----------
  pres.addSection({ title: "Next steps" });
  s = pres.addSlide({ masterName: "CLOSING_DARK", sectionTitle: "Next steps" });
  s.addText("See your own plan in a minute", { placeholder: "title" });
  s.addText([
    { text: "Use our calculator to see your exact payouts, then send an inquiry. Our team will contact you.", options: { breakLine: true } },
  ], { x: 0.6, y: 1.35, w: 5.6, h: 0.75, fontSize: 16, color: C.background2, valign: "top", margin: 0, isTextBox: true });
  s.addText("Visit", { x: 0.6, y: 2.25, w: 5.6, h: 0.3, fontSize: 14, color: C.background2, margin: 0, isTextBox: true });
  s.addText(INQUIRY_URL_SHORT, {
    x: 0.6, y: 2.55, w: 5.9, h: 0.5, fontSize: 20, bold: true, color: C.accent2, margin: 0, isTextBox: true,
    hyperlink: { url: INQUIRY_URL, tooltip: "Open the calculator and send an inquiry" }, objectName: "Inquiry URL",
  });
  s.addText("or scan the code with your phone camera", { x: 0.6, y: 3.1, w: 5.6, h: 0.3, fontSize: 14, color: C.background2, margin: 0, isTextBox: true });

  const qrData = await QRCode.toDataURL(INQUIRY_URL, { margin: 1, width: 800, errorCorrectionLevel: "M", color: { dark: "#16285AFF", light: "#FFFFFFFF" } });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.85, y: 1.3, w: 2.55, h: 2.55, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: C.background1 }, objectName: "QR code frame" });
  s.addImage({ data: qrData.replace(/^data:/, ""), x: 7.0, y: 1.45, w: 2.25, h: 2.25, altText: `QR code linking to ${INQUIRY_URL}`, objectName: "Inquiry QR code" });

  s.addText(`Disclaimer: ${DISCLAIMER}`, {
    x: 0.6, y: 4.15, w: 8.8, h: 1.05, fontSize: 10, color: C.background2, valign: "top", margin: 0, isTextBox: true, objectName: "Disclaimer",
  });
  s.addNotes(
    `Close with the call to action: open ${INQUIRY_URL} or scan the QR code, try your own numbers, and send an inquiry. Leave this slide up during questions.`,
  );

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("Wrote", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

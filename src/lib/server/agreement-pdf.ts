import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocumentBlock, DocumentContent } from "../agreement-template";

/**
 * Draws a DocumentContent (see agreement-template.ts) as a US Letter PDF:
 * title, wrapped paragraphs, label/value rows, tables that repeat their header
 * on a new page, signature blocks that are never split across pages, and a
 * footer with the reference and page numbers on every page.
 *
 * Text is set in Helvetica. Its character set is Western European, so any
 * other character in an investor's name is replaced by "?" rather than
 * failing; the owner can correct the name in BoldSign before sending.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 30;
const BOTTOM = 66;

const INK = rgb(0.1, 0.13, 0.2);
const MUTED = rgb(0.38, 0.43, 0.5);
const RULE = rgb(0.8, 0.83, 0.87);
const SHADE = rgb(0.94, 0.95, 0.97);

const BODY_SIZE = 10;
const BODY_LEADING = 14;

class Writer {
  readonly doc: PDFDocument;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  page!: PDFPage;
  y = 0;
  private readonly supported: Set<number>;

  private constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.supported = new Set(regular.getCharacterSet());
  }

  static async create(): Promise<Writer> {
    const doc = await PDFDocument.create();
    const [regular, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
    const writer = new Writer(doc, regular, bold);
    writer.newPage();
    return writer;
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Moves to a new page unless `height` still fits above the footer. Returns true when it did move. */
  ensure(height: number): boolean {
    if (this.y - height >= BOTTOM) return false;
    this.newPage();
    return true;
  }

  /** Text the font can draw: accents are dropped where the plain letter exists, anything else becomes "?". */
  clean(text: string): string {
    let out = "";
    for (const ch of text.replace(/\s+/g, " ")) {
      const code = ch.codePointAt(0) ?? 63;
      if (this.supported.has(code)) {
        out += ch;
        continue;
      }
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base.length > 0 && [...base].every((c) => this.supported.has(c.codePointAt(0) ?? 0)) ? base : "?";
    }
    return out;
  }

  width(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(text, size);
  }

  /** Splits text into lines no wider than `maxWidth` (long words are broken). */
  wrap(raw: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const text = this.clean(raw).trim();
    if (text === "") return [""];
    const lines: string[] = [];
    let line = "";
    const pushWord = (word: string) => {
      const attempt = line === "" ? word : `${line} ${word}`;
      if (this.width(attempt, font, size) <= maxWidth) {
        line = attempt;
        return;
      }
      if (line !== "") lines.push(line);
      line = "";
      let rest = word;
      while (this.width(rest, font, size) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && this.width(rest.slice(0, cut), font, size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    };
    for (const word of text.split(" ")) pushWord(word);
    if (line !== "") lines.push(line);
    return lines;
  }

  draw(text: string, x: number, baselineY: number, font: PDFFont, size: number, color = INK): void {
    if (text === "") return;
    this.page.drawText(text, { x, y: baselineY, font, size, color });
  }

  drawRight(text: string, rightX: number, baselineY: number, font: PDFFont, size: number, color = INK): void {
    this.draw(text, rightX - this.width(text, font, size), baselineY, font, size, color);
  }

  rule(y: number, x1 = MARGIN, x2 = PAGE_WIDTH - MARGIN, thickness = 0.6): void {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: RULE });
  }
}

// ---------- blocks ----------

function title(w: Writer, content: DocumentContent): void {
  const size = 19;
  const text = w.clean(content.title);
  w.draw(text, (PAGE_WIDTH - w.width(text, w.bold, size)) / 2, w.y - size, w.bold, size);
  w.y -= size + 8;
  const sub = w.clean(content.subtitle);
  w.draw(sub, (PAGE_WIDTH - w.width(sub, w.regular, 9.5)) / 2, w.y - 9.5, w.regular, 9.5, MUTED);
  w.y -= 9.5 + 10;
  w.rule(w.y);
  w.y -= 16;
}

function heading(w: Writer, text: string): void {
  const size = 11.5;
  // Keep a heading with at least two lines of what follows.
  w.ensure(size + 14 + BODY_LEADING * 2);
  w.y -= 8;
  w.draw(w.clean(text), MARGIN, w.y - size, w.bold, size);
  w.y -= size + 6;
}

function paragraph(w: Writer, text: string): void {
  const lines = w.wrap(text, w.regular, BODY_SIZE, CONTENT_WIDTH);
  // Do not leave a single line alone at the bottom or the top of a page.
  w.ensure(Math.min(lines.length, 2) * BODY_LEADING);
  for (const line of lines) {
    w.ensure(BODY_LEADING);
    w.draw(line, MARGIN, w.y - BODY_SIZE, w.regular, BODY_SIZE);
    w.y -= BODY_LEADING;
  }
  w.y -= 5;
}

const LABEL_WIDTH = 150;
const ROW_PAD = 4;

function details(w: Writer, rows: ReadonlyArray<readonly [string, string | null]>): void {
  const valueX = MARGIN + LABEL_WIDTH + 8;
  const valueWidth = PAGE_WIDTH - MARGIN - valueX;
  for (const [label, value] of rows) {
    const lines = value === null ? [""] : w.wrap(value, w.regular, BODY_SIZE, valueWidth);
    // A blank row is taller, so there is room for a BoldSign text box on it.
    const height = Math.max(lines.length * BODY_LEADING, value === null ? BODY_LEADING + 14 : BODY_LEADING + 4) + ROW_PAD * 2;
    w.ensure(height);
    const top = w.y;
    w.draw(w.clean(label), MARGIN, top - ROW_PAD - BODY_SIZE, w.bold, BODY_SIZE, MUTED);
    if (value === null) {
      // A blank line the investor fills in (in BoldSign).
      w.rule(top - height + ROW_PAD + 2, valueX, PAGE_WIDTH - MARGIN, 0.8);
    } else {
      lines.forEach((line, i) => w.draw(line, valueX, top - ROW_PAD - BODY_SIZE - i * BODY_LEADING, w.regular, BODY_SIZE));
    }
    w.rule(top - height);
    w.y = top - height;
  }
  w.y -= 8;
}

type TableBlock = Extract<DocumentBlock, { type: "table" }>;

function table(w: Writer, block: TableBlock): void {
  const size = 9;
  const leading = 12;
  const pad = 5;
  const xs: number[] = [];
  let x = MARGIN;
  for (const column of block.columns) {
    xs.push(x);
    x += column.width * CONTENT_WIDTH;
  }
  const colWidth = (i: number) => block.columns[i].width * CONTENT_WIDTH;

  const drawRow = (cells: string[], opts: { bold?: boolean; shade?: boolean }) => {
    const font = opts.bold ? w.bold : w.regular;
    const wrapped = cells.map((cell, i) => w.wrap(cell, font, size, colWidth(i) - pad * 2));
    const height = Math.max(...wrapped.map((l) => l.length)) * leading + pad * 2;
    return { wrapped, height, font };
  };
  const paint = (row: ReturnType<typeof drawRow>, shade: boolean) => {
    const top = w.y;
    if (shade) w.page.drawRectangle({ x: MARGIN, y: top - row.height, width: CONTENT_WIDTH, height: row.height, color: SHADE });
    row.wrapped.forEach((lines, i) => {
      lines.forEach((line, n) => {
        const baseline = top - pad - size - n * leading + 2;
        if (block.columns[i].align === "right") w.drawRight(line, xs[i] + colWidth(i) - pad, baseline, row.font, size);
        else w.draw(line, xs[i] + pad, baseline, row.font, size);
      });
    });
    w.rule(top - row.height);
    w.y = top - row.height;
  };

  const header = drawRow(
    block.columns.map((c) => c.label),
    { bold: true },
  );
  w.ensure(header.height + 3 * leading);
  paint(header, true);
  const body = block.rows.map((cells) => drawRow(cells, {}));
  for (const row of body) {
    if (w.ensure(row.height)) paint(header, true);
    paint(row, false);
  }
  if (block.totals) {
    const totals = drawRow(block.totals, { bold: true });
    if (w.ensure(totals.height)) paint(header, true);
    paint(totals, true);
  }
  w.y -= 10;
}

type SignatureBlock = Extract<DocumentBlock, { type: "signature" }>;

function signature(w: Writer, block: SignatureBlock): void {
  const lineHeight = 34;
  const height = 20 + block.lines.length * lineHeight + 10;
  w.ensure(height);
  w.draw(w.clean(block.party), MARGIN, w.y - 11, w.bold, 11);
  w.y -= 24;
  const valueX = MARGIN + 100;
  for (const [label, value] of block.lines) {
    const baseline = w.y - 14;
    w.draw(w.clean(label), MARGIN, baseline, w.regular, 9.5, MUTED);
    if (value !== null) w.draw(w.clean(value), valueX, baseline, w.regular, BODY_SIZE);
    w.rule(baseline - 4, valueX, valueX + 300, 0.8);
    w.y -= lineHeight;
  }
  w.y -= 10;
}

function footers(w: Writer, content: DocumentContent): void {
  const pages = w.doc.getPages();
  const reference = w.clean(`Ref ${content.reference}`);
  pages.forEach((page, index) => {
    w.page = page;
    w.rule(FOOTER_Y + 14);
    w.draw(reference, MARGIN, FOOTER_Y, w.regular, 8, MUTED);
    w.drawRight(`Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN, FOOTER_Y, w.regular, 8, MUTED);
  });
}

/** Renders the document as PDF bytes. */
export async function renderPdf(content: DocumentContent): Promise<Uint8Array> {
  const w = await Writer.create();
  w.doc.setTitle(w.clean(content.title));
  w.doc.setSubject(w.clean(content.subtitle));
  w.doc.setCreator("Investment Payout Calculator");
  w.doc.setProducer("Investment Payout Calculator");

  title(w, content);
  for (const block of content.blocks) {
    switch (block.type) {
      case "heading":
        heading(w, block.text);
        break;
      case "paragraph":
        paragraph(w, block.text);
        break;
      case "details":
        details(w, block.rows);
        break;
      case "table":
        table(w, block);
        break;
      case "signature":
        signature(w, block);
        break;
    }
  }
  footers(w, content);
  return w.doc.save();
}

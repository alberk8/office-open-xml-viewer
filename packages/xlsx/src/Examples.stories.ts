import type { Meta, StoryObj } from '@storybook/html';
import { buildViewerUI } from './XlsxViewer.stories';
import { XlsxWorkbook } from './workbook';
import { XlsxViewer } from './viewer';

type Args = { scale: number };
type LayoutArgs = Record<string, never>;

const SAMPLE_URL = `${import.meta.env.BASE_URL}xlsx/demo/sample-1.xlsx`;

// Cell viewport rendered for the headless thumbnails/previews below. Mirrors the
// VRT fixture (tests/visual/fixture.html) so the demo sheets look the same.
const VIEWPORT = { row: 1, col: 1, rows: 30, cols: 12 } as const;

const meta: Meta<Args> = {
  title: 'XlsxViewer/Examples',
  // The viewer fills the viewport (height:100vh). Storybook's default story
  // padding would push that past the fold, hiding the bottom sheet-tab bar
  // behind a scroll. 'fullscreen' removes the padding so 100vh fits exactly and
  // the tabs stay visible.
  parameters: { layout: 'fullscreen' },
  argTypes: {
    scale: {
      control: { type: 'range', min: 0.25, max: 2, step: 0.05 },
      description: 'Cell/header scale (1 = normal size)',
    },
  },
  args: { scale: 1 },
};
export default meta;
type Story = StoryObj<Args>;
type LayoutStory = StoryObj<LayoutArgs>;

export const Demo: Story = {
  name: 'Demo — single viewer (demo.xlsx)',
  render(args) {
    const { root } = buildViewerUI(args, SAMPLE_URL);
    return root;
  },
};

export const Offscreen: Story = {
  name: 'Offscreen — Web Worker rendering (demo.xlsx)',
  // The single-viewer Demo, rendered entirely in a Web Worker (mode: 'worker').
  // Identical UX — scroll, sheet tabs, cell selection — only the pixels are
  // produced off the main thread.
  render(args) {
    const { root } = buildViewerUI(args, SAMPLE_URL, { mode: 'worker' });
    return root;
  },
};

// The pptx/docx Examples expose ScrollView / ThumbnailGrid / MasterDetail
// "Layouts" recipes driven by the headless engine (PptxPresentation /
// DocxDocument). The xlsx analogue renders each sheet's top-left viewport to a
// plain canvas via XlsxWorkbook.renderViewport — the same low-level API the VRT
// fixture uses. These stories back the CI smoke suite (tests/smoke), which
// asserts every sheet canvas receives ink.

function makeStatus(root: HTMLElement): HTMLDivElement {
  const s = document.createElement('div');
  s.style.cssText = 'color:#666;font-size:13px;margin-bottom:8px;min-height:18px;';
  s.textContent = 'Loading…';
  root.appendChild(s);
  return s;
}

export const ScrollView: LayoutStory = {
  name: 'ScrollView — stack all sheets',
  render() {
    const root = document.createElement('div');
    root.style.cssText = 'font-family:sans-serif;padding:16px;';
    const heading = document.createElement('h3');
    heading.textContent = 'ScrollView — scroll through every sheet';
    heading.style.cssText = 'margin:0 0 8px;font-size:14px;';
    root.appendChild(heading);
    const status = makeStatus(root);

    const scroller = document.createElement('div');
    scroller.style.cssText =
      'max-height:720px;overflow-y:auto;border:1px solid #ccc;background:#f5f5f5;padding:12px;';
    root.appendChild(scroller);

    XlsxWorkbook.load(SAMPLE_URL, { useGoogleFonts: true })
      .then(async (wb) => {
        status.textContent = `Rendering ${wb.sheetCount} sheets…`;
        const widthPx = 900;
        const heightPx = 520;
        for (let i = 0; i < wb.sheetCount; i++) {
          const sheetWrapper = document.createElement('div');
          sheetWrapper.style.cssText =
            'display:block;max-width:900px;margin:0 auto 12px;';
          const caption = document.createElement('div');
          caption.textContent = `Sheet ${i + 1} — ${wb.sheetNames[i] ?? ''}`;
          caption.style.cssText = 'font-size:12px;color:#444;margin-bottom:4px;';
          const canvas = document.createElement('canvas');
          canvas.style.cssText =
            'display:block;width:100%;max-width:900px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);';
          sheetWrapper.append(caption, canvas);
          scroller.appendChild(sheetWrapper);
          await wb.renderViewport(canvas, i, VIEWPORT, { width: widthPx, height: heightPx, dpr: 1 });
        }
        status.textContent = `Loaded ${wb.sheetCount} sheets`;
      })
      .catch((e: Error) => {
        status.textContent = `Error: ${e.message}`;
        status.style.color = 'red';
      });

    return root;
  },
};

export const ThumbnailGrid: LayoutStory = {
  name: 'ThumbnailGrid — overview of all sheets',
  render() {
    const root = document.createElement('div');
    root.style.cssText = 'font-family:sans-serif;padding:16px;';
    const heading = document.createElement('h3');
    heading.textContent = 'ThumbnailGrid — every sheet at a glance';
    heading.style.cssText = 'margin:0 0 8px;font-size:14px;';
    root.appendChild(heading);
    const status = makeStatus(root);

    const grid = document.createElement('div');
    grid.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;';
    root.appendChild(grid);

    XlsxWorkbook.load(SAMPLE_URL, { useGoogleFonts: true })
      .then(async (wb) => {
        status.textContent = `Rendering ${wb.sheetCount} thumbnails…`;
        const thumbW = 260;
        const thumbH = 150;
        for (let i = 0; i < wb.sheetCount; i++) {
          const cell = document.createElement('div');
          cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
          const canvas = document.createElement('canvas');
          canvas.style.cssText =
            'display:block;width:100%;max-width:260px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);';
          const caption = document.createElement('div');
          caption.textContent = `Sheet ${i + 1} — ${wb.sheetNames[i] ?? ''}`;
          caption.style.cssText = 'font-size:12px;color:#444;margin-top:4px;';
          cell.append(canvas, caption);
          const idx = i;
          cell.addEventListener('click', () => {
            console.log(`[xlsx ThumbnailGrid] clicked sheet ${idx + 1}`);
          });
          grid.appendChild(cell);
          await wb.renderViewport(canvas, i, VIEWPORT, { width: thumbW, height: thumbH, dpr: 1 });
        }
        status.textContent = `Loaded ${wb.sheetCount} sheets`;
      })
      .catch((e: Error) => {
        status.textContent = `Error: ${e.message}`;
        status.style.color = 'red';
      });

    return root;
  },
};

export const MasterDetail: LayoutStory = {
  name: 'MasterDetail — sheet tabs + large preview',
  render() {
    const root = document.createElement('div');
    root.style.cssText = 'font-family:sans-serif;padding:16px;';
    const heading = document.createElement('h3');
    heading.textContent = 'MasterDetail — click a sheet tab to preview';
    heading.style.cssText = 'margin:0 0 8px;font-size:14px;';
    root.appendChild(heading);
    const status = makeStatus(root);

    const layout = document.createElement('div');
    layout.style.cssText = 'display:flex;gap:16px;height:720px;';
    root.appendChild(layout);

    const thumbCol = document.createElement('div');
    thumbCol.style.cssText =
      'flex:0 0 240px;overflow-y:auto;border:1px solid #ccc;background:#f5f5f5;padding:8px;' +
      'display:flex;flex-direction:column;gap:10px;';
    const detailCol = document.createElement('div');
    detailCol.style.cssText =
      'flex:1 1 auto;border:1px solid #ccc;background:#f5f5f5;padding:12px;overflow:auto;position:relative;';
    layout.append(thumbCol, detailCol);

    // Detail is a real interactive XlsxViewer (scroll, tabs, selection); the
    // thumbnail column drives it via goToSheet.
    const detailViewer = new XlsxViewer(detailCol, {
      useGoogleFonts: true,
      onError: (err) => { status.textContent = `Error: ${err.message}`; },
    });

    Promise.all([
      XlsxWorkbook.load(SAMPLE_URL, { useGoogleFonts: true }),
      detailViewer.load(SAMPLE_URL),
    ])
      .then(async ([wb]) => {
        status.textContent = `Rendering ${wb.sheetCount} thumbnails…`;
        const thumbEntries: HTMLDivElement[] = [];

        const selectSheet = async (i: number) => {
          for (let k = 0; k < thumbEntries.length; k++) {
            thumbEntries[k].style.outline = k === i ? '2px solid #0366d6' : 'none';
          }
          await detailViewer.goToSheet(i);
        };

        for (let i = 0; i < wb.sheetCount; i++) {
          const cell = document.createElement('div');
          cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;padding:4px;';
          const canvas = document.createElement('canvas');
          canvas.style.cssText =
            'display:block;width:100%;max-width:220px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);';
          const caption = document.createElement('div');
          caption.textContent = `Sheet ${i + 1} — ${wb.sheetNames[i] ?? ''}`;
          caption.style.cssText = 'font-size:12px;color:#444;margin-top:4px;';
          cell.append(canvas, caption);
          const idx = i;
          cell.addEventListener('click', () => {
            selectSheet(idx).catch((e: Error) => {
              status.textContent = `Render error: ${e.message}`;
            });
          });
          thumbCol.appendChild(cell);
          thumbEntries.push(cell);
          await wb.renderViewport(canvas, i, VIEWPORT, { width: 220, height: 128, dpr: 1 });
        }

        // Highlight first thumbnail
        if (thumbEntries.length > 0) thumbEntries[0].style.outline = '2px solid #0366d6';
        status.textContent = `Loaded ${wb.sheetCount} sheets`;
      })
      .catch((e: Error) => {
        status.textContent = `Error: ${e.message}`;
        status.style.color = 'red';
      });

    return root;
  },
};

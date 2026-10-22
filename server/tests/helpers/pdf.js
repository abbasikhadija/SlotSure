import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function inspectPdf(buffer) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
  });
  try {
    const pdf = await task.promise;
    const parts = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      parts.push(content.items.map((item) => item.str).join(' '));
    }
    return {
      pages: pdf.numPages,
      text: parts.join(' ').replace(/\s+/gu, ' ').trim(),
    };
  } finally {
    await task.destroy();
  }
}

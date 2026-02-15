const fs = require('fs');
const pdfjsLib = require('pdfjs-dist');

async function extractText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join('');
    fullText += `\n=== Page ${i} ===\n` + pageText;
  }
  return fullText;
}

async function main() {
  console.log('=== QUESTIONS PDF ===');
  const qText = await extractText('夜２後期練習問題.pdf');
  console.log(qText);

  console.log('\n\n=== ANSWERS PDF ===');
  const aText = await extractText('夜２後期練習問題_71問正答.pdf');
  console.log(aText);
}

main().catch(console.error);

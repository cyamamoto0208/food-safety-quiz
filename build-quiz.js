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
    fullText += pageText;
  }
  return fullText;
}

async function extractAnswers() {
  const data = new Uint8Array(fs.readFileSync('夜２後期練習問題_71問正答.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const OPS = pdfjsLib.OPS;
  const allAnswers = {};

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const ops = await page.getOperatorList();
    const content = await page.getTextContent();

    const redCircleCenters = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === OPS.setStrokeRGBColor) {
        const c = ops.argsArray[i];
        if (c[0] === 190 && c[1] === 75 && c[2] === 72) {
          for (let j = i + 1; j < Math.min(i + 5, ops.fnArray.length); j++) {
            if (ops.fnArray[j] === OPS.transform) {
              const t = ops.argsArray[j];
              const pathCenter = 296333.5;
              const centerX = t[0] * pathCenter + t[4];
              const centerY = t[3] * pathCenter + t[5];
              redCircleCenters.push({ x: centerX, y: centerY });
              break;
            }
          }
        }
      }
    }

    const choices = [];
    let currentQuestion = null;
    const choiceMap = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };

    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const qMatch = item.str.match(/^(\d+)\./);
      if (qMatch) currentQuestion = parseInt(qMatch[1]);
      if (choiceMap[item.str] && currentQuestion) {
        choices.push({
          question: currentQuestion,
          choice: choiceMap[item.str],
          x: item.transform[4],
          y: item.transform[5]
        });
      }
    }

    for (const circle of redCircleCenters) {
      let bestMatch = null;
      let bestDist = Infinity;
      for (const choice of choices) {
        const dist = Math.sqrt(
          Math.pow(circle.x - choice.x, 2) + Math.pow(circle.y - choice.y, 2)
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = choice;
        }
      }
      if (bestMatch && bestDist < 30) {
        if (!allAnswers[bestMatch.question]) allAnswers[bestMatch.question] = [];
        if (!allAnswers[bestMatch.question].includes(bestMatch.choice))
          allAnswers[bestMatch.question].push(bestMatch.choice);
      }
    }
  }
  return allAnswers;
}

function parseQuestions(text) {
  const questions = [];

  // Find all question start positions using lookbehind for non-digit
  const questionStarts = [];
  const qRegex = /(?:^|(?<=[^\d]))(\d{1,2})\.\s*/g;
  let m;
  while ((m = qRegex.exec(text)) !== null) {
    const num = parseInt(m[1]);
    if (num >= 1 && num <= 71) {
      // Calculate the start of the full match (including the number)
      const numStr = m[1];
      const matchStart = m.index + m[0].indexOf(numStr);
      questionStarts.push({ num, index: matchStart, fullMatchEnd: m.index + m[0].length });
    }
  }

  // Filter: keep only sequentially expected question numbers
  const filtered = [];
  let expected = 1;
  for (const qs of questionStarts) {
    if (qs.num === expected) {
      filtered.push(qs);
      expected = qs.num + 1;
    }
  }

  // Extract each question body
  for (let i = 0; i < filtered.length; i++) {
    const start = filtered[i];
    const endIdx = i + 1 < filtered.length ? filtered[i + 1].index : text.length;
    // Get text starting AFTER "N. "
    const body = text.substring(start.fullMatchEnd, endIdx).trim();

    // Extract choices
    const choiceMap = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
    const firstChoiceIdx = body.search(/[①②③④⑤]/);
    if (firstChoiceIdx < 0) continue;

    const questionText = body.substring(0, firstChoiceIdx).trim();
    const choicesText = body.substring(firstChoiceIdx);

    const choicesArr = [];
    const choiceRegex = /([①②③④⑤])\s*([\s\S]*?)(?=[①②③④⑤]|$)/g;
    let cm;
    while ((cm = choiceRegex.exec(choicesText)) !== null) {
      const choiceNum = choiceMap[cm[1]];
      let choiceText = cm[2].trim();
      // Remove trailing digits that belong to the next question number
      choiceText = choiceText.replace(/\d{1,2}$/, '').trim();
      // Remove trailing period if orphaned
      choiceText = choiceText.replace(/\s*\.$/, (m) => m);
      if (choiceText) {
        choicesArr.push({ num: choiceNum, text: choiceText });
      }
    }

    if (choicesArr.length > 0) {
      const isMulti = /全て選べ/.test(questionText);
      questions.push({
        num: start.num,
        question: questionText,
        choices: choicesArr,
        isMulti
      });
    }
  }

  return questions;
}

async function main() {
  console.error('Extracting questions...');
  const qText = await extractText('夜２後期練習問題.pdf');

  console.error('Extracting answers...');
  const answers = await extractAnswers();

  console.error('Parsing questions...');
  const questions = parseQuestions(qText);

  console.error(`Found ${questions.length} questions`);

  // Build quiz data
  const quizData = questions.map(q => ({
    num: q.num,
    question: q.question,
    choices: q.choices.map(c => ({ num: c.num, text: c.text })),
    answers: answers[q.num] || [],
    isMulti: q.isMulti
  }));

  // Verify
  for (const q of quizData) {
    const ansStr = q.answers.map(a => '①②③④⑤'[a-1]).join(',');
    console.error(`Q${q.num}: ${ansStr} | ${q.question.substring(0, 50)}`);
  }

  // Write JSON data
  fs.writeFileSync('quiz-data.json', JSON.stringify(quizData, null, 2));
  console.error('\nWrote quiz-data.json');
}

main().catch(console.error);

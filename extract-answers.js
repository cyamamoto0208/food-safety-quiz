const fs = require('fs');
const pdfjsLib = require('pdfjs-dist');

async function extractAnswers() {
  const data = new Uint8Array(fs.readFileSync('夜２後期練習問題_71問正答.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const OPS = pdfjsLib.OPS;

  const allAnswers = {};

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const ops = await page.getOperatorList();
    const content = await page.getTextContent();

    // 1. Find red circle CENTER positions
    const redCircleCenters = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === OPS.setStrokeRGBColor) {
        const c = ops.argsArray[i];
        if (c[0] === 190 && c[1] === 75 && c[2] === 72) {
          // Look for the transform after this to get position
          for (let j = i + 1; j < Math.min(i + 5, ops.fnArray.length); j++) {
            if (ops.fnArray[j] === OPS.transform) {
              const t = ops.argsArray[j];
              // t = [scaleX, 0, 0, scaleY, tx, ty]
              // The ellipse path goes from 0 to ~592667 in both axes
              // Center in path coords is approximately 296333.5
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

    // 2. Extract choice markers with positions
    const choices = [];
    let currentQuestion = null;
    const choiceMap = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };

    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;

      const qMatch = item.str.match(/^(\d+)\./);
      if (qMatch) {
        currentQuestion = parseInt(qMatch[1]);
      }

      if (choiceMap[item.str] && currentQuestion) {
        choices.push({
          question: currentQuestion,
          choice: choiceMap[item.str],
          x: item.transform[4],
          y: item.transform[5]
        });
      }
    }

    // 3. Match red circles to nearest choice marker
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
        if (!allAnswers[bestMatch.question]) {
          allAnswers[bestMatch.question] = [];
        }
        if (!allAnswers[bestMatch.question].includes(bestMatch.choice)) {
          allAnswers[bestMatch.question].push(bestMatch.choice);
        }
      }
    }
  }

  // Sort and output
  const sorted = {};
  for (let i = 1; i <= 71; i++) {
    if (allAnswers[i]) {
      sorted[i] = allAnswers[i].sort();
    } else {
      console.error(`WARNING: No answer found for question ${i}`);
    }
  }
  console.log(JSON.stringify(sorted, null, 2));
}

extractAnswers().catch(console.error);

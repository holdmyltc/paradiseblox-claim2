/**
 * Spots full card numbers in a message so they are never stored.
 * Looks for 13 to 19 digits (spaces or dashes allowed between them) that pass
 * the Luhn check every real card number passes.
 */
function luhn(digits: string) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function containsCardNumber(text: string) {
  if (!text) return false;
  // Links (like private server links) can hold long digit codes. Ignore them.
  const cleaned = text.replace(/https?:\/\/\S+|www\.\S+/gi, " ");
  // A whole run of 13 to 19 digits, spaces or dashes allowed between digits,
  // and not part of a longer number.
  const runs = cleaned.match(/(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g) || [];
  for (const run of runs) {
    const digits = run.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    if (/^(\d)\1+$/.test(digits)) continue;
    if (/^[2-6]/.test(digits) && luhn(digits)) return true;
  }
  return false;
}

export const CARD_BLOCK_MESSAGE =
  "For your safety, never send a card number here. If we ask for proof, send a screenshot with all but the last 4 digits covered.";

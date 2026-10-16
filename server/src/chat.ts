/**
 * Minimal chat word filter. Matches whole words (case-insensitive, diacritics-insensitive) and masks them.
 * The list is intentionally small and lives here so it can be moved to configuration later.
 */
const BLOCKED_WORDS = ["dm", "dmm", "vcl", "vl", "cl", "dcm", "cmm", "clgt"];

function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export function filterChat(text: string): string {
  // Operate word by word on the original text, comparing the diacritic-free lowercase form.
  return text
    .split(" ")
    .map((word) => {
      const plain = stripDiacritics(word).toLowerCase().replace(/[^a-z0-9]/g, "");
      return BLOCKED_WORDS.includes(plain) ? "*".repeat([...word].length) : word;
    })
    .join(" ");
}

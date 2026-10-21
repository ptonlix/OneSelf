export type PageChunk = {
  readonly ordinal: number;
  readonly body: string;
};

const CHUNK_CODE_POINTS = 1000;

export function chunkBody(body: string): PageChunk[] {
  const paragraphs = body.split(/\r?\n(?:[ \t]*\r?\n)+/);
  const pieces: string[] = [];
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const characters = Array.from(trimmed);
    for (let index = 0; index < characters.length; index += CHUNK_CODE_POINTS) {
      pieces.push(characters.slice(index, index + CHUNK_CODE_POINTS).join(""));
    }
  }
  return pieces.map((piece, ordinal) => ({ ordinal, body: piece }));
}

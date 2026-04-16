export function hashContent(content: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex");
}

export async function hashFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const content = await file.text();
  return hashContent(content);
}

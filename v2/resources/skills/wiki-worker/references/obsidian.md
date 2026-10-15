# Obsidian-style notes

This source uses Obsidian syntax. Treat it as data:
- `[[Note]]` or `[[Note|alias]]` points to another note in the user's vault. Use it as a
  hint: find that note with `source_search` and connect the related pages. Do not copy the
  `[[...]]` syntax into a wiki body; wiki links must name wiki pages.
- `![[image.png]]` embeds an image you cannot see. Use only what the surrounding text says.
- `#tag` words in prose are the user's own labels and good hints for categories (and
  tags). `#include`, `#define`, and similar inside code are not labels.
- Folder names in `relPath`, such as a course or subject folder, are context for titles
  and categories.

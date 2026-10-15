// Loaded on demand by Markdown: KaTeX and its fonts are only needed for notes with math.
import rehypeKatex from 'rehype-katex';
import type { PluggableList } from 'unified';
import 'katex/dist/katex.min.css';
import { katexOptions } from '../wiki/math';

export const rehypeMath: PluggableList = [[rehypeKatex, katexOptions]];

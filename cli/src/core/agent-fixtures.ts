import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { addMarkdownNoteToVault } from "./add-note";
import { loadVaultConfig, type VaultConfig } from "./config";
import type { EmbeddingProvider } from "../pipeline/embedder";
import { createVaultCollection, EMBEDDING_DIMENSIONS, openVaultCollection } from "../stores/vec-store";
import { MetaDB, type NoteRow } from "../stores/meta-store";

export interface InstallAgentScenarioFixturesInput {
  vaultRoot: string;
  vaultName: string;
  force?: boolean;
}

export interface InstallAgentScenarioFixturesResult {
  templatePath: string;
  sourcesConsidered: number;
  rewritten: FixtureWriteSummary;
  artifacts: FixtureWriteSummary;
}

export interface FixtureWriteSummary {
  added: number;
  updated: number;
  skipped: number;
  files: string[];
}

interface SourceEvidence {
  note: NoteRow;
  content: string;
  scenario: ScenarioKind;
}

type ScenarioKind =
  | "diet"
  | "workout"
  | "task"
  | "study"
  | "project"
  | "progress"
  | "idea"
  | "reflection"
  | "mixed";

const TEMPLATE_PATH = fileURLToPath(new URL("../../../docs/template.md", import.meta.url));
const REWRITE_AGENT = "deterministic-test-agent";
const REWRITE_PROMPT_HASH = "artifact-workflow-v3-test-fixture";

export async function installAgentScenarioFixtures(
  input: InstallAgentScenarioFixturesInput,
): Promise<InstallAgentScenarioFixturesResult> {
  const vaultConfig = await loadVaultConfig(input.vaultRoot);
  const templatePath = await installVaultTemplate(input.vaultRoot);
  const sources = await loadSourceEvidence(input.vaultRoot, input.vaultName);
  const embedProvider = new DeterministicEmbeddingProvider(vaultConfig);
  const vectorCollection = openOrCreateVectorCollection(input.vaultRoot, vaultConfig);

  const rewritten = emptySummary();
  for (const source of sources) {
    const relPath = rewrittenPathFor(source.note);
    const result = await addMarkdownNoteToVault({
      vaultRoot: input.vaultRoot,
      vaultName: input.vaultName,
      relPath,
      content: renderRewritten(source),
      force: input.force,
      vaultConfig,
      embedProvider,
      vectorCollection,
    });
    recordWrite(rewritten, result.status, result.filePath);
  }

  const artifacts = emptySummary();
  for (const artifact of buildArtifacts(sources)) {
    const result = await addMarkdownNoteToVault({
      vaultRoot: input.vaultRoot,
      vaultName: input.vaultName,
      relPath: artifact.relPath,
      content: artifact.content,
      force: input.force,
      vaultConfig,
      embedProvider,
      vectorCollection,
    });
    recordWrite(artifacts, result.status, result.filePath);
  }

  return {
    templatePath,
    sourcesConsidered: sources.length,
    rewritten,
    artifacts,
  };
}

function openOrCreateVectorCollection(vaultRoot: string, vaultConfig: VaultConfig): {
  upsertSync: (docs: unknown[]) => void;
  deleteSync?: (ids: string[]) => void;
} {
  const vectorIndexPath = join(vaultRoot, ".kn", "vectors");
  try {
    return openVaultCollection(vectorIndexPath, {}) as unknown as {
      upsertSync: (docs: unknown[]) => void;
      deleteSync?: (ids: string[]) => void;
    };
  } catch {
    return createVaultCollection(vectorIndexPath, "vault", vaultConfig.embedding.model) as unknown as {
      upsertSync: (docs: unknown[]) => void;
      deleteSync?: (ids: string[]) => void;
    };
  }
}

async function installVaultTemplate(vaultRoot: string): Promise<string> {
  const templateContent = await Bun.file(TEMPLATE_PATH).text();
  const templatePath = join(vaultRoot, ".kn", "template.md");
  mkdirSync(dirname(templatePath), { recursive: true });
  await Bun.write(templatePath, templateContent);
  return templatePath;
}

async function loadSourceEvidence(vaultRoot: string, vaultName: string): Promise<SourceEvidence[]> {
  const metaDb = new MetaDB(vaultRoot);
  try {
    const sourceNotes = metaDb.listNotesByLayer(vaultName, "source", 10_000, 0);
    const evidence: SourceEvidence[] = [];
    for (const note of sourceNotes) {
      const filePath = join(vaultRoot, note.file_path);
      if (!existsSync(filePath)) continue;
      const content = await Bun.file(filePath).text();
      evidence.push({
        note,
        content,
        scenario: classifyScenario(note, content),
      });
    }
    return evidence.sort((a, b) => a.note.file_path.localeCompare(b.note.file_path));
  } finally {
    metaDb.close();
  }
}

function classifyScenario(note: NoteRow, content: string): ScenarioKind {
  const haystack = `${note.file_path}\n${note.title ?? ""}\n${content}`.toLowerCase();
  if (/(식단|아침|점심|저녁|간식|다이어트|식사)/.test(haystack)) return "diet";
  if (/(운동|홈트|뛰었|러닝|스트레칭|푸쉬업|스쿼트)/.test(haystack)) return "workout";
  if (/(- \[[ x]\]|todo|task|해야|마감|완료|체크|녹강)/.test(haystack)) return "task";
  if (/(자료구조|알고리즘|nlp|공부|정처기|시험|암기|복습)/.test(haystack)) return "study";
  if (/(캡디|llm|프로젝트|구현|개발|모델|서비스)/.test(haystack)) return "project";
  if (/(\d+\s*\/\s*\d+|진도|progress|회차)/.test(haystack)) return "progress";
  if (/(아이디어|roadmap|자동|믹스|기획|생각)/.test(haystack)) return "idea";
  if (/(회고|일기|느낌|감정|싶다|운이란|오늘)/.test(haystack)) return "reflection";
  return "mixed";
}

function rewrittenPathFor(note: NoteRow): string {
  const date = note.doc_date ?? "undated";
  return `rewritten/${date}/${basename(note.file_path)}`;
}

function renderRewritten(source: SourceEvidence): string {
  const date = source.note.doc_date ?? "undated";
  const title = source.note.title ?? basename(source.note.file_path, ".md");
  return [
    "---",
    `title: "${escapeYaml(title)}"`,
    "layer: rewritten",
    `kind: "${source.scenario}"`,
    `doc_date: ${date}`,
    `source_path: "${escapeYaml(source.note.file_path)}"`,
    `rewrite_agent: "${REWRITE_AGENT}"`,
    `rewrite_prompt_hash: "${REWRITE_PROMPT_HASH}"`,
    "tags:",
    `  - "${source.scenario}"`,
    "  - test-fixture",
    "---",
    "",
    `# ${title}`,
    "",
    `Source: ${source.note.file_path}`,
    "",
    "## Agent Rewrite Summary",
    scenarioSummary(source.scenario),
    "",
    "## Structured Notes",
    normalizeBody(source.content),
    "",
    "## Evidence",
    `- source_path: ${source.note.file_path}`,
    `- rewrite_agent: ${REWRITE_AGENT}`,
  ].join("\n");
}

function scenarioSummary(kind: ScenarioKind): string {
  switch (kind) {
    case "diet":
      return "식단, 식사량 그래프, 금일 식사 조언, 다이어트 조언, 식단조절 streak 산출에 쓰는 rewritten 노트입니다.";
    case "workout":
      return "운동량 그래프, 금일 운동 평가, 다음 운동 조언, 운동 streak 산출에 쓰는 rewritten 노트입니다.";
    case "task":
      return "Task 우선순위, 완료 체크, 마감 추적을 위해 할 일과 상태를 정리한 rewritten 노트입니다.";
    case "study":
      return "공부 초안을 지식 노트로 정제하고 부족한 개념을 구조화하기 위한 rewritten 노트입니다.";
    case "project":
      return "캡디/프로젝트 진행 상황과 다음 구현 작업을 정리하기 위한 rewritten 노트입니다.";
    case "progress":
      return "시험/진도 추적과 남은 학습량 계산을 위한 rewritten 노트입니다.";
    case "idea":
      return "아이디어 백로그와 기획 후보를 정리하기 위한 rewritten 노트입니다.";
    case "reflection":
      return "일기/회고록 내용을 관찰, 감정, 다음 행동으로 정리하기 위한 rewritten 노트입니다.";
    default:
      return "여러 주제가 섞인 source를 검색 가능한 형태로 정리한 rewritten 노트입니다.";
  }
}

function normalizeBody(content: string): string {
  const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
  if (!body) return "- 원문에 비어 있는 내용만 있습니다.";
  return body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n");
}

interface ArtifactFixture {
  relPath: string;
  content: string;
}

function buildArtifacts(sources: SourceEvidence[]): ArtifactFixture[] {
  return [
    {
      relPath: "artifacts/diet/diet-dashboard.md",
      content: renderArtifact({
        title: "식단관리 대시보드",
        kind: "diet-dashboard",
        templateId: "diet-management-v1",
        sections: [
          ["식사량 그래프", tableFor(sources, "diet", "날짜 | 식사 기록 | 조절 상태")],
          ["금일 식사 조언", "- source 기반 식사 기록을 보고 단백질, 채소, 과식 여부를 확인한다."],
          ["다이어트 조언", "- 식단조절 streak은 끊긴 날짜를 명시하고 무리한 제한보다 지속성을 우선한다."],
          ["Streaks", "- 식단조절: testdata evidence 기준으로 계산 대상"],
          ["Sources", sourcesList(sources, "diet")],
        ],
      }),
    },
    {
      relPath: "artifacts/workout/workout-dashboard.md",
      content: renderArtifact({
        title: "운동관리 대시보드",
        kind: "workout-dashboard",
        templateId: "workout-management-v1",
        sections: [
          ["운동량 그래프", tableFor(sources, "workout", "날짜 | 운동 기록 | streak")],
          ["금일 운동 평가", "- 운동 강도와 지속 시간을 분리해 평가한다."],
          ["다음 운동 조언", "- 과부하가 누적된 날은 회복 또는 가벼운 유산소를 우선한다."],
          ["Streak", "- 운동: testdata evidence 기준으로 계산 대상"],
          ["Sources", sourcesList(sources, "workout")],
        ],
      }),
    },
    {
      relPath: "artifacts/tasks/task-priority.md",
      content: renderArtifact({
        title: "Task 우선순위",
        kind: "task-board",
        templateId: "task-priority-v1",
        sections: [
          ["우선순위", "- [ ] 캡디, 녹강, 알고리즘, 정처기 같은 반복 등장 작업을 먼저 확인한다."],
          ["완료 기록", "- [x] source에 체크된 완료 항목은 완료 일자를 보존한다."],
          ["다음 행동", "- [ ] 마감이 있는 작업은 날짜와 함께 재검색한다."],
          ["Sources", sourcesList(sources, "task")],
        ],
      }),
    },
    {
      relPath: "artifacts/study/study-knowledge-base.md",
      content: renderArtifact({
        title: "Study 지식 정리",
        kind: "study-guide",
        templateId: "study-rewrite-v1",
        sections: [
          ["핵심 개념", "- 자료구조, 알고리즘, NLP, 정처기 내용을 정의와 예시로 정제한다."],
          ["복습 질문", "- 오늘 정리한 개념을 설명형 질문으로 바꾼다."],
          ["부족한 내용", "- source에 빠진 정의는 추론 표시 후 보강 후보로 남긴다."],
          ["Sources", sourcesList(sources, "study")],
        ],
      }),
    },
    {
      relPath: "artifacts/reflection/reflection-log.md",
      content: renderArtifact({
        title: "일기/회고록 로그",
        kind: "reflection-log",
        templateId: "reflection-journal-v1",
        sections: [
          ["관찰", "- 하루 사건과 감정을 분리해 기록한다."],
          ["회고", "- 반복되는 생각과 행동 패턴을 evidence 기반으로 요약한다."],
          ["다음 행동", "- 감정 해석은 단정하지 않고 실행 가능한 작은 행동으로 연결한다."],
          ["Sources", sourcesList(sources, "reflection")],
        ],
      }),
    },
    {
      relPath: "artifacts/projects/capdi-project-status.md",
      content: renderArtifact({
        title: "캡디/프로젝트 상태",
        kind: "project-status",
        templateId: "project-status-v1",
        sections: [
          ["진행 상황", "- 캡디/프로젝트 source와 rewritten 검색 결과를 이용해 구현 상태를 정리한다."],
          ["리스크", "- 막힌 점, 모델/서비스 의존성, 다음 검증 작업을 분리한다."],
          ["Sources", sourcesList(sources, "project")],
        ],
      }),
    },
    {
      relPath: "artifacts/progress/exam-progress.md",
      content: renderArtifact({
        title: "시험/진도 추적",
        kind: "progress-tracker",
        templateId: "exam-progress-v1",
        sections: [
          ["진도", "- 정처기와 시험 대비 진도를 날짜별로 누적한다."],
          ["다음 범위", "- 남은 범위를 계산하고 복습 우선순위를 둔다."],
          ["Sources", sourcesList(sources, "progress")],
        ],
      }),
    },
    {
      relPath: "artifacts/ideas/ideas-backlog.md",
      content: renderArtifact({
        title: "아이디어 백로그",
        kind: "idea-backlog",
        templateId: "idea-backlog-v1",
        sections: [
          ["후보", "- 음악프로그램 자동믹스, Minecraft roadmap 같은 아이디어를 보존한다."],
          ["검증", "- 구현 가능성, 필요한 데이터, 다음 실험을 나눈다."],
          ["Sources", sourcesList(sources, "idea")],
        ],
      }),
    },
  ];
}

function renderArtifact(input: {
  title: string;
  kind: string;
  templateId: string;
  sections: Array<[string, string]>;
}): string {
  return [
    "---",
    `title: "${escapeYaml(input.title)}"`,
    "layer: artifact",
    `kind: "${input.kind}"`,
    `artifact_template_id: "${input.templateId}"`,
    "tags:",
    "  - test-fixture",
    "  - artifact",
    "---",
    "",
    `# ${input.title}`,
    "",
    ...input.sections.flatMap(([heading, body]) => [`## ${heading}`, body, ""]),
  ].join("\n");
}

function tableFor(sources: SourceEvidence[], scenario: ScenarioKind, header: string): string {
  const rows = sources
    .filter((source) => source.scenario === scenario)
    .slice(0, 8)
    .map((source) => {
      const date = source.note.doc_date ?? "unknown";
      const summary = compactLine(source.content);
      return `| ${date} | ${summary} | evidence |`;
    });
  return [`| ${header} |`, "| --- | --- | --- |", ...(rows.length ? rows : ["| unknown | evidence 없음 | unknown |"])].join("\n");
}

function sourcesList(sources: SourceEvidence[], scenario: ScenarioKind): string {
  const matching = sources.filter((source) => source.scenario === scenario);
  const selected = matching.length > 0 ? matching : sources.slice(0, 3);
  return selected
    .slice(0, 10)
    .map((source) => `- ${source.note.file_path}`)
    .join("\n");
}

function compactLine(content: string): string {
  const line = normalizeBody(content)
    .split(/\r?\n/)
    .map((item) => item.replace(/^#+\s*/, "").trim())
    .find((item) => item.length > 0);
  return (line ?? "원문 참조").replace(/\|/g, "/").slice(0, 80);
}

function emptySummary(): FixtureWriteSummary {
  return { added: 0, updated: 0, skipped: 0, files: [] };
}

function recordWrite(summary: FixtureWriteSummary, status: "added" | "updated" | "skipped", filePath: string): void {
  summary[status]++;
  summary.files.push(filePath);
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = "deterministic-test-fixture";
  readonly isLocal = true;
  private readonly dimension: number;

  constructor(vaultConfig: VaultConfig) {
    this.dimension = EMBEDDING_DIMENSIONS[vaultConfig.embedding.model] ?? 768;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => deterministicVector(text, this.dimension));
  }
}

function deterministicVector(text: string, dimension: number): number[] {
  const bytes = createHash("sha256").update(text).digest();
  const vector = new Array<number>(dimension);
  for (let i = 0; i < dimension; i++) {
    vector[i] = ((bytes[i % bytes.length] ?? 0) - 128) / 128;
  }
  return vector;
}

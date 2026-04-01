// index.ts
import { parseArgs } from "util";

// 1. 인자(Arguments) 파싱 설정
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    name: {
      type: "string",
      short: "n",
    },
    version: {
      type: "boolean",
      short: "v",
    },
  },
  strict: true,
  allowPositionals: true,
});

// 2. 버전 확인 로직
if (values.version) {
  console.log("My CLI Tool v1.0.0");
  process.exit(0);
}

// 3. 메인 로직
const targetName = values.name || "Guest";

console.log(`\n🚀 Hello, ${targetName}! Bun CLI에 오신 것을 환영합니다.`);

if (positionals.length > 2) {
  console.log("추가 입력값:", positionals.slice(2));
}

// 4. Bun 내장 API 활용 예시 (파일 읽기)
const packageJson = await Bun.file("package.json").json();
console.log(`현재 프로젝트 이름: ${packageJson.name}`);

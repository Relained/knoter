import { Command } from "commander";

export function registerAskCommand(program: Command): void {
  program
    .command("ask <question>")
    .description("Ask a question to be answered using RAG over the vault")
    .option("--context-limit <n>", "Maximum number of context documents")
    .option("--context-window <n>", "Maximum context window size in tokens")
    .option("--model <name>", "LLM model to use")
    .option("--routing <mode>", "Context routing strategy")
    .option("--show-sources", "Display source documents in response")
    .option("--raw", "Output raw response without formatting")
    .action((question, options) => {
      console.log("Not yet implemented: kn ask");
    });
}

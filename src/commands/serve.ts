import { Command } from "commander";

export function registerServeCommand(program: Command): void {
  const serveCmd = program
    .command("serve")
    .description("Run an API server for the vault");

  serveCmd
    .option("--transport <type>", "Transport protocol (http, grpc, etc)")
    .option("--port <n>", "Port to listen on")
    .option("--daemon", "Run as daemon process")
    .action((options) => {
      console.log("Not yet implemented: kn serve");
    });

  serveCmd
    .command("stop")
    .description("Stop the running API server")
    .action(() => {
      console.log("Not yet implemented: kn serve stop");
    });
}

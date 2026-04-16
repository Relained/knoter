import { Command } from "commander";

export function registerScheduleCommand(program: Command): void {
  const scheduleCmd = program
    .command("schedule")
    .description("Schedule periodic indexing jobs (enable, disable, status, run-now)");

  scheduleCmd
    .command("enable")
    .option("--interval <duration>", "Schedule interval (e.g., 1h, 30m)")
    .action((options) => {
      console.log("Not yet implemented: kn schedule enable");
    });

  scheduleCmd
    .command("disable")
    .action(() => {
      console.log("Not yet implemented: kn schedule disable");
    });

  scheduleCmd
    .command("status")
    .action(() => {
      console.log("Not yet implemented: kn schedule status");
    });

  scheduleCmd
    .command("run-now")
    .action(() => {
      console.log("Not yet implemented: kn schedule run-now");
    });
}

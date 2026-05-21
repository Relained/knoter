import { expect, test } from "@playwright/test";

test("workspace shell renders and core interactions work", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/?workspace=playwright-smoke");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole("navigation", { name: "Application menu" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Dashboard markdown editor" })).toBeVisible();

  await page.getByRole("button", { name: "Command Palette" }).first().click();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByRole("combobox").fill("settings");
  await page.getByRole("option", { name: /설정 열기/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();
  const floatingCountAfterSettings = await page.locator(".floating-window").count();
  expect(floatingCountAfterSettings).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Split Pane" }).first().click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);

  await page.getByRole("button", { name: "Floating Window" }).first().click();
  await expect(page.locator(".floating-window")).toHaveCount(floatingCountAfterSettings + 1);

  await expect.poll(() => consoleErrors).toEqual([]);
});

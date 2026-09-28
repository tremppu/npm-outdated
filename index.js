#!/usr/bin/env node
import { exec } from "child_process";
import { basename } from "path";
import { styleText } from "util";

// Get arguments passed to the script
const args = process.argv.slice(2);

// If --show-unsafe flag is present, show unsafe packages as well
const showUnsafe = args.includes("--show-unsafe");

// If --verbose flag is present, enable verbose logging
const verbose = args.includes("--verbose");

// If --loose flag is present, use npm update to keep package.json ranges intact
const loose = args.includes("--loose");

const root = "root";

// Map workspace folder names (npm outdated "dependent") to workspace locations
const getWorkspaces = () =>
  new Promise((resolve) => {
    exec("npm query .workspace", (error, stdout) => {
      try {
        const workspaces = JSON.parse(stdout);
        resolve(
          Object.fromEntries(
            workspaces.map((ws) => [basename(ws.location), ws.location])
          )
        );
      } catch {
        resolve({});
      }
    });
  });

// Strip "@version" while keeping scoped names like "@scope/name" intact
const toName = (pkg) => pkg.slice(0, pkg.lastIndexOf("@"));

// Build one install command per target, root first
// npm update keeps package.json ranges intact but resolves "wanted" at run time
const toCommands = (groups) =>
  Object.entries(groups)
    .sort(([a], [b]) =>
      a === root ? -1 : b === root ? 1 : a.localeCompare(b)
    )
    .map(([target, packages]) => [
      target,
      `${
        loose
          ? `npm update ${packages.map(toName).join(" ")}`
          : `npm i ${packages.join(" ")}`
      }${target === root ? "" : ` -w ${target}`}`,
    ]);

const logCommands = (groups) => {
  const commands = toCommands(groups);
  for (const [target, command] of commands) {
    console.log(`\n${styleText("cyan", `${target}:`)}\n${command}`);
  }
  if (commands.length > 1) {
    console.log(
      `\n${styleText("magenta", "All in one:")}\n${commands
        .map(([, c]) => c)
        .join(" && ")}`
    );
  }
};

const countPackages = (groups) =>
  Object.values(groups).reduce((sum, packages) => sum + packages.length, 0);

exec("npm outdated --json", async (error, stdout, stderr) => {
  const data = JSON.parse(stdout);
  const workspaces = await getWorkspaces();

  const outdated = Object.entries(data).reduce((acc, [name, value]) => {
    // Packages used by multiple workspaces are listed as arrays
    for (const entry of [].concat(value)) {
      if (entry.current !== entry.wanted) {
        acc.push([name, entry.wanted, workspaces[entry.dependent] ?? root]);
      }
    }
    return acc;
  }, []);

  const now = new Date();

  const isSafe = {};
  const safeToUpdate = {};
  const unsafeToUpdate = {};

  for (const [name, version, target] of outdated) {
    const pkg = `${name}@${version}`;
    try {
      // Fetch metadata only once per package version
      if (!(pkg in isSafe)) {
        const metadata = await fetch(`https://registry.npmjs.org/${name}`).then(
          (res) => res.json()
        );
        const versionTimestamp = metadata.time[version];
        const versionDate = new Date(versionTimestamp);
        const diffTime = Math.abs(now - versionDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // If package is at least 2 days old, consider it safe to update
        isSafe[pkg] = diffDays >= 2;
      }

      const groups = isSafe[pkg] ? safeToUpdate : unsafeToUpdate;
      (groups[target] ??= []).push(pkg);
    } catch (error) {
      const message = styleText("red", `Error fetching metadata for ${pkg}`);
      if (verbose) console.error(message, error);
      else console.error(message);
    }
  }

  console.log(
    `Found ${styleText(
      "bold",
      String(outdated.length)
    )} outdated packages from which ${styleText(
      "yellow",
      String(countPackages(unsafeToUpdate))
    )} are unsafe to update at this point. ${styleText(
      ["green", "bold"],
      "Safe to update:"
    )}`
  );
  logCommands(safeToUpdate);

  if (showUnsafe) {
    console.log(`\n${styleText(["yellow", "bold"], "Unsafe to update:")}`);
    logCommands(unsafeToUpdate);
  }
});

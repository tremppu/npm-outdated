#!/usr/bin/env node
import { exec } from "child_process";

// Get arguments passed to the script
const args = process.argv.slice(2);

// If --show-unsafe flag is present, show unsafe packages as well
const showUnsafe = args.includes("--show-unsafe");

exec("npm outdated --json", async (error, stdout, stderr) => {
  const data = JSON.parse(stdout);

  const outdated = Object.entries(data).reduce((acc, [name, value]) => {
    if (value.current !== value.wanted) {
      acc.push([name, value.wanted]);
    }
    return acc;
  }, []);

  const now = new Date();

  const safeToUpdate = [];
  const unsafeToUpdate = [];

  for (const [name, version] of outdated) {
    const metadata = await fetch(`https://registry.npmjs.org/${name}`).then(
      (res) => res.json()
    );
    const versionTimestamp = metadata.time[version];
    const versionDate = new Date(versionTimestamp);
    const diffTime = Math.abs(now - versionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // If package is at least 2 days old, consider it safe to update
    if (diffDays >= 2) safeToUpdate.push(`${name}@${version}`);
    else unsafeToUpdate.push(`${name}@${version}`);
  }

  console.log(
    `Found ${outdated.length} outdated packages from which ${unsafeToUpdate.length} are unsafe to update at this point. Safe to update:`
  );
  console.log(safeToUpdate.join(" "));

  if (showUnsafe) {
    console.log("\nUnsafe to update:");
    console.log(unsafeToUpdate.join(" "));
  }
});

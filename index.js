#!/usr/bin/env node
import { exec } from "child_process";

exec("npm outdated --json", (error, stdout, stderr) => {
  const data = JSON.parse(stdout);

  const outdated = Object.entries(data).reduce((acc, [name, value]) => {
    if (value.current !== value.wanted) {
      acc.push([name, value.wanted]);
    }
    return acc;
  }, []);

  const wanted = outdated
    .map(([name, version]) => `${name}@${version}`)
    .join(" ");

  console.log(wanted);
});

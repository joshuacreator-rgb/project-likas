import { defineRailway, github, project, service, volume } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "comfortable-youth";
export default defineRailway(() => {
  // The data volume must be declared. Without it the plan treats the attachment
  // as drift and proposes detaching it ("/data" -> null), which would orphan
  // every file already written to it. sizeMB/region are stated explicitly
  // because omitting them plans as clearing both.
  const dataVolume = volume("comfortable-youth-volume", { region: "sfo", sizeMB: 500 });

  const comfortableYouth = service("comfortable-youth", {
    // builder from CaC: "NIXPACKS"
    source: github("joshuacreator-rgb/project-likas"),
    // npm start (package.json) is what Railway runs today: it chains the
    // runtime migrations before boot. Invoking node directly — as the old
    // railway.toml did — would drop `cross-env NODE_ENV=production`, because
    // cross-env only resolves when npm puts node_modules/.bin on PATH.
    start: "npm start",
    healthcheck: "/",
    healthcheckTimeout: 30,
    replicas: { sfo: 1 },
    domains: ["likas.fyi"],
    // normalizeVolumeMounts() uses the MAP KEY as mountPath when the value is a
    // VolumeNode (attachments[value.name] = { volume: value.address, mountPath: key }),
    // so the key is the path, not the volume name.
    volumeMounts: { "/data": dataVolume },
  });

  return project("Project-Likas", {
    variables: { managed: false },
    resources: [comfortableYouth, dataVolume],
  });
});

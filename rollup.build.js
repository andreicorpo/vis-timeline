import { generateRollupConfiguration } from "vis-dev-utils";

import packageJSON from "./package.json";

const baseConfig = generateRollupConfiguration({
  externalForPeerBuild: ["moment", "vis-data"],
  globals: {
    "@egjs/hammerjs": "Hammer",
    "component-emitter": "Emitter",
    "propagating-hammerjs": "propagating",
    "vis-data": "vis",
    "vis-util": "vis",
    keycharm: "keycharm",
    moment: "moment",
    uuid: "uuid",
    xss: "filterXSS",
  },
  header: { name: "vis-timeline and vis-graph2d" },
  libraryFilename: "vis-timeline-graph2d",
  entryPoints: "./lib",
  packageJSON,
});

export default baseConfig.then((result) =>
  result.filter((v) => v.input.includes("esnext"))
);

import { plugin } from "bun";

const SERVER_ONLY = /server-only\/index\.js$/;

plugin({
  name: "release-server-only",
  setup(build) {
    build.onLoad({ filter: SERVER_ONLY }, () => ({
      contents: "",
      loader: "js",
    }));
  },
});

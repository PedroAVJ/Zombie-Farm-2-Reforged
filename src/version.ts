import packageJson from "../package.json";

/** User-facing game version. Keep the full semver in package.json, but omit a
 * trailing zero patch so e.g. 0.2.0 is presented as "0.2" (0.2.1 stays "0.2.1"). */
export const APP_VERSION = packageJson.version.replace(/\.0$/, "");

/** Short commit SHA this bundle was built from ("dev" locally). `APP_VERSION` tracks
 *  package.json and rarely changes, so this is what actually identifies a deployed
 *  build in a crash report. */
export const BUILD_SHA = typeof __BUILD_SHA__ === "string" ? __BUILD_SHA__ : "dev";

/** Version string for diagnostics and support: "0.1 (a1b2c3d)". */
export const BUILD_ID = `${APP_VERSION} (${BUILD_SHA})`;

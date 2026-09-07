# Versioning and releases

`package.json` is the authoritative source for the LAYER.systems package name and
semantic version. The About app imports that metadata directly, so local and
production builds display the same version.

## Preparing a release

1. Run `npm version patch`, `npm version minor`, or `npm version major` from the
   repository root. This updates `package.json` and `package-lock.json`, creates
   the matching git commit, and creates a version tag.
2. Run `npm run test` and verify the version in the About app.
3. Push the commit and tag to publish the release.

The first tracked release is `1.0.0`. Use semantic versioning for all subsequent
releases: patch for backwards-compatible fixes, minor for backwards-compatible
features, and major for breaking changes.

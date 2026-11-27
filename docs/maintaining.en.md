# Repository and release operations

[简体中文](maintaining.zh-CN.md) · [Contributing](../CONTRIBUTING.en.md)

## Merge authority

Changes enter the default branch, `main`, through pull requests. Bring the branch up to date, pass the **Windows x64** check from GitHub Actions and resolve review conversations before squash-merging. The default branch rejects force pushes and deletion. Administrators follow the same merge path. CODEOWNERS routes review requests to the maintainer.

The project starts with one maintainer, so the required approval count is zero. Authors cannot approve their own PRs. When a second regular maintainer is available, consider requiring an independent approval and code owner review. Grant write access narrowly and reserve administrator access for repository and release maintainers. Account recovery codes and two-factor authentication belong to the account owner.

Versioned rule definitions live in `.github/rulesets/`. Inspect the active rules in Settings → Rules → Rulesets. Apply JSON changes to GitHub and verify them using `gh api repos/la8garlic/QuanY/rules/branches/main`. Separate tag rules restrict creation of `v*` tags to maintainers and prevent subsequent updates or deletion.

## Automation and dependencies

The Windows workflow runs on PRs and the default branch. Its token can read repository contents, and checkout does not persist credentials. Actions are pinned to full commit SHAs and restricted to GitHub-owned actions. Only trusted main builds supply release artifacts. Dependabot checks Cargo, npm and Actions weekly. Review upstream changes, lockfile diffs and CI results, particularly for scripts, build tools and IPC permissions.

Dependabot alerts, secret scanning, push protection and private vulnerability reporting are enabled. Revoke or rotate an exposed credential first, then assess history cleanup. Removing a credential from the latest commit does not invalidate it.

## Cutting a release

1. In a PR, align versions in Cargo, npm, their lockfiles and Tauri configuration, then update release notes in both languages. Review distribution notices. Update the WebView2 SDK license and NOTICE when its bundled loader changes.
2. After merge, wait for the Windows workflow at the exact main commit. Record the full SHA and run ID, inspect the fields below and download its artifact into a fresh directory.

```powershell
gh run view RUN_ID --repo la8garlic/QuanY --json headSha,headBranch,event,conclusion,url
gh run download RUN_ID --repo la8garlic/QuanY --name QuanY-windows-x64 --dir release-download
Get-FileHash .\release-download\QuanY.exe -Algorithm SHA256
```

3. Compare the checksum, inspect the executable version, architecture and embedded notices, then smoke-check startup and saving with a disposable library. A maintainer creates and pushes an annotated `vVERSION` tag at the verified SHA.
4. Create a draft using `gh release create vVERSION --verify-tag --draft`. Attach QuanY.exe and `SHA256SUMS.txt`, bilingual release notes and the build run URL before publishing. Immutable releases are enabled. Ship binary or attachment corrections in a new version.
5. Download both public assets again, compare their hashes and inspect the tag, assets and publication state using `gh release view vVERSION`. GitHub provides automatic source archives for the tag.

[GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) · [Actions security](https://docs.github.com/en/actions/reference/security/secure-use) · [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

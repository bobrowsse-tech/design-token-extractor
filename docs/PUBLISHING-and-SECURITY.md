# Publishing, Sustaining, and Protecting This as Free & Open Source

Everything below can be done at **$0 cost**. Every recommendation says explicitly
whether it's free and why.

## 1. Publishing to the VS Code Marketplace

1. **Create a publisher.** Go to https://marketplace.visualstudio.com/manage,
   sign in with a Microsoft account, create a publisher ID. Free.
2. **Create an Azure DevOps organization** (required only to generate the
   Personal Access Token the publish tool needs — you don't use Azure DevOps
   for anything else). Free tier is sufficient.
3. **Generate a PAT** scoped to *Marketplace (Manage)* only — don't grant it
   broader Azure DevOps permissions than that.
4. **Fill required `package.json` fields**: `publisher`, `name`, `version`,
   `engines.vscode`, `repository`, `license`, `icon`, `categories`,
   `galleryBanner` (optional). A missing `repository` field is one of the
   first things that makes a listing look untrustworthy to users.
5. **Package and publish** using `@vscode/vsce` (the official CLI):
   ```bash
   npm install -g @vscode/vsce
   vsce package     # produces a .vsix locally, test this first
   vsce publish     # publishes using your PAT
   ```
6. **Also publish to Open VSX** (https://open-vsx.org). This is the open,
   vendor-neutral registry used by VSCodium, Gitpod, Coder, and others. Free,
   same `vsce`-compatible tooling (`ovsx publish`). Mirroring here means
   you're not solely dependent on one company's marketplace policies for
   distribution — protects you against a single point of failure, not just
   technically but reputationally.

## 2. Keeping It Free and Open Source, Permanently

- **Pick a permissive license** (MIT or Apache-2.0) and commit a `LICENSE`
  file on day one. This is what lets the community fork and keep the project
  alive even if you ever step away — the free/open nature is guaranteed by
  the license, not by your continued involvement.
- **Host on a public GitHub repo.** Free, unlimited for public repos, and
  gives you free CI (GitHub Actions), free static analysis (CodeQL), free
  dependency scanning (Dependabot), and free secret-leak scanning — all
  covered in section 3.
- **Never introduce a paid dependency** in the core path: no paid telemetry
  service, no paid crash reporting, no paid API calls at runtime. If you want
  usage analytics, only use something with a genuinely free tier and be
  transparent about it in the README — or skip telemetry entirely, which
  also sidesteps privacy concerns for an extension that touches source code.
- **Add a `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.** Costs nothing, makes
  it realistic for others to help maintain it, which is your actual
  insurance against burnout or abandonment.

## 3. Hardening Against Attackers (all free, GitHub/Marketplace native)

The realistic attack surface for a small open-source VS Code extension is:
supply-chain compromise (a dependency or CI step gets hijacked), credential
theft (someone steals your publish token), and impersonation (someone
publishes a malicious extension under a confusingly similar name). Here's how
to close each, at no cost:

### Supply chain
- Commit the lockfile (`package-lock.json`) and always run `npm ci` in CI, not
  `npm install` — this enforces exact dependency versions instead of trusting
  whatever resolves at build time.
- Enable **Dependabot** (Settings → Code security) for automated dependency
  vulnerability alerts and update PRs. Free on public repos.
- Enable **secret scanning + push protection** (Settings → Code security).
  Free on public repos. Stops you from accidentally committing a live token.
- Enable **CodeQL** code scanning. Free on public repos, catches a real class
  of vulnerabilities automatically on every PR.
- **Pin GitHub Actions to a full commit SHA**, not a tag (e.g.
  `actions/checkout@<full-sha>` not `@v4`). Tags can be moved by a compromised
  upstream action; a commit SHA cannot.

### Credential theft
- Store the marketplace PAT and npm token (if you publish a CLI package too)
  as **GitHub encrypted secrets**, never in code or CI logs.
- Scope the PAT as narrowly as possible (Marketplace-publish only, as in
  section 1) and set an expiration date; rotate it periodically.
- Use a **GitHub Environment with required reviewers** for the publish job,
  so a compromised PR can't trigger a real marketplace publish without a
  human approving it first.
- If you later publish a CLI to npm: use **npm's OIDC "trusted publishing"**
  from GitHub Actions instead of a long-lived npm token. This means there's
  no npm secret sitting in your repo at all for an attacker to steal — npm
  authenticates the publish based on the GitHub Actions run itself. Free,
  and it eliminates an entire category of leak risk.
- Enable **2FA** on your Microsoft/Azure DevOps account, your GitHub account,
  and your npm account (if used). Free, and the single highest-leverage step
  against account takeover.

### Impersonation / name squatting
- Publish under your chosen name as early as possible on both the VS Code
  Marketplace and Open VSX, even with a minimal Phase 1 build — this reserves
  the name before anyone else can.
- Consider **domain verification** on the Marketplace (Settings on your
  publisher profile) if you own a domain — it's free and adds a verified
  badge, which is a trust signal for users wary of installing an extension
  that rewrites their source files.
- Add a `SECURITY.md` with a contact for responsible disclosure. Costs
  nothing, and means a researcher who finds a real problem tells you first
  instead of posting it publicly.

### Branch/PR hygiene (protects against hostile contributions)
- Turn on **branch protection** on `main`: require PR review, require status
  checks to pass, disallow force-push. Free on public repos.
- GitHub already requires maintainer approval to run Actions on PRs from
  first-time outside contributors by default — leave this on. Never switch a
  workflow to auto-run on forked PRs with secrets access.

## 4. A Note Specific to This Project

Because the eventual Phase 4 rewriter *writes to the user's source files*,
treat "don't let this get compromised" as a product requirement, not just an
infra one:
- Ship the rewriter as opt-in and dry-run-by-default, always behind the
  Phase 3 diff preview — this bounds the damage even in a worst-case
  compromise scenario, since nothing is ever silently written.
- Keep the dependency list for the rewrite path as small as possible; every
  dependency is something an attacker could compromise upstream of you.

## 5. Total Cost Summary

| Item | Cost |
|---|---|
| VS Code Marketplace publisher account | Free |
| Azure DevOps org (for the PAT only) | Free |
| Open VSX publishing | Free |
| GitHub public repo | Free |
| GitHub Actions (public repo) | Free, effectively unlimited minutes |
| Dependabot, secret scanning, CodeQL | Free on public repos |
| Domain verification | Free (only need a domain if you already have one) |
| npm OIDC trusted publishing | Free |

Nothing in this pipeline requires a paid tier at any point.

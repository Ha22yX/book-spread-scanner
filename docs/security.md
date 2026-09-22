# Credential Handling and Publication Review

## Review scope

Before public release, the repository was checked on **September 22, 2026**, starting from commit `4db776a`:

- Gitleaks **8.30.1**, using its default rules and redacted output, scanned all 17 existing commits reachable from all fetched branches and tags, plus the working tree. No findings were reported.
- A supplemental scan checked all **302 historical Git blobs** for provider-token patterns (including OpenAI keys), private-key headers, JWTs, credentials embedded in URLs, and literal credential assignments. No matches were reported.
- Historical filenames were checked for real environment files, private keys, credential bundles, and local databases. None were found. The committed `.env.example` has empty credential fields.
- The repository had no pull requests, issues, releases, Actions artifacts, wiki, or GitHub Pages deployment at the time of review.
- The Sites project identifier in `.openai/hosting.json` is deployment metadata, not an authentication credential. It is retained for the existing deployment.

This review concerns repository contents and reachable history. Automated detection cannot prove the absence of every possible secret. It does not audit uncommitted files on other computers, hosting-provider secret stores, or the runtime security of a deployed site. A final scan of the publication commit and updated working tree is performed before changing visibility.

## Keep credentials out of Git

- Put local credentials in `.dev.vars` or other ignored environment files; use hosting-provider secrets for the deployed web service.
- Keep `OPENAI_API_KEY`, `PROCESSOR_TOKEN`, and `SITE_ACCESS_TOKEN` out of browser code, screenshots, logs, issue reports, and commits.
- `.gitignore` excludes environment files (except `.env.example`), local runtime state, generated output, common private-key formats, credential JSON files, and local database files. Ignore rules do not remove files already tracked by Git.
- The processor token authenticates the processor endpoint. Protect the deployed site separately and do not share session URLs publicly.

For repeatable repository checks, install Gitleaks and run from the repository root:

```sh
gitleaks git . --log-opts="--all --full-history" --redact
gitleaks dir . --redact
```

If a real secret is ever committed, revoke or rotate it first. Removing it only from the newest file does not remove it from Git history.

## 中文说明

公开前已使用 Gitleaks 检查全部 17 次已有提交与当前文件，并补充扫描 302 个历史文件版本，未发现密钥或令牌。示例环境文件的凭据字段为空，真实环境文件、私钥和本地数据库未进入历史记录。发布文档提交后、改为公开前还会复扫一次。

扫描结论限于本仓库及可获取的 Git 历史，不代表对其他电脑上的未提交文件、托管平台秘密存储或线上应用安全作出保证。真实密钥应保存在被忽略的本地配置或托管平台秘密配置中。源码公开不会自动公开现有站点；会话链接与站点访问凭证仍应保密。

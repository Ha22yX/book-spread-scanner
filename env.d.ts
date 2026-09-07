declare namespace Cloudflare {
  interface Env {
    FILES: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  }
}

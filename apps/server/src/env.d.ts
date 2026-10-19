declare namespace Cloudflare {
  interface Env {
    TOKEN_SECRET: string;
    /**
     * Yalnız e2e (playwright.config.ts): '1' ise YouTube oEmbed ağ çağrısı
     * atlanır; tarayıcıdaki doğrulama ucu Playwright route ile sahtelenir.
     * Üretimde tanımlı değildir; varsayılan davranış gerçek doğrulamadır.
     */
    MOL_YOUTUBE_STUB?: string;
  }
}

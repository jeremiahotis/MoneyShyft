/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_ENABLE_TEST_CONNECTSHYFT_FLAGS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

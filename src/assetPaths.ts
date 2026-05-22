type ImportMetaWithOptionalEnv = ImportMeta & {
  env?: {
    BASE_URL?: string;
  };
};

const viteBaseUrl = (import.meta as ImportMetaWithOptionalEnv).env?.BASE_URL ?? '/';

export function assetPath(path: string) {
  return `${viteBaseUrl}${path.replace(/^\/+/, '')}`;
}

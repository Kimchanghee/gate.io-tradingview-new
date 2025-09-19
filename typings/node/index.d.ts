declare namespace NodeJS {
  interface Process {
    env: Record<string, string | undefined>;
    on(event: string, listener: (...args: any[]) => void): void;
  }
}

declare const process: NodeJS.Process;

declare module 'node:path' {
  export const join: (...parts: string[]) => string;
  export const dirname: (target: string) => string;
  const path: {
    join: typeof join;
    dirname: typeof dirname;
  };
  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare module 'node:crypto' {
  export function randomUUID(): string;
}

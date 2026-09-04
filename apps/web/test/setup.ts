// jest-dom のカスタムマッチャ（toBeInTheDocument 等）を有効にする。
import '@testing-library/jest-dom/vitest';

// vitest.config.ts で globals を有効にしていない（暗黙のグローバルに頼らない方針）ため、
// Testing Library の自動クリーンアップが効かない。テストごとに明示的に後始末する。
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

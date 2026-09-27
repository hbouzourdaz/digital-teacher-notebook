import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * نسخة better-sqlite3 المبنية لواجهة Node (يجهّزها `npm run sqlite:node`).
 * النسخة الأساسية في node_modules/better-sqlite3 مبنية لإلكترون ولا تصلح هنا،
 * ولا نلمسها حتى يبقى التطبيق قادراً على العمل أثناء الاختبارات.
 */
const nodeAbi = resolve(__dirname, 'node_modules/.node-abi/better-sqlite3')

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      // بديل electron حتى تعمل اختبارات طبقة البيانات الحقيقية دون تشغيل إلكترون
      electron: resolve(__dirname, 'tests/stubs/electron.ts'),
      ...(existsSync(nodeAbi) ? { 'better-sqlite3': nodeAbi } : {})
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})

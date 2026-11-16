/**
 * Verifica o resultado de `npm run build` (pasta dist/). No CI o build corre antes dos testes;
 * localmente, corre `npm run build` antes de `npm test`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const MISSING_BUILD = 'Falta a pasta dist/: corre "npm run build" antes dos testes.';

beforeAll(() => {
  expect(fs.existsSync(distDir), MISSING_BUILD).toBe(true);
});

describe('Service worker gerado (dist/sw.js)', () => {
  const readSw = () => fs.readFileSync(path.join(distDir, 'sw.js'), 'utf-8');

  it('existe e regista rotas do Workbox', () => {
    expect(readSw()).toContain('registerRoute');
  });

  it('não guarda respostas da API do Supabase (os dados offline vivem no IndexedDB)', () => {
    const sw = readSw();
    // Uma cache NetworkFirst da API devolvia dados antigos como frescos em redes lentas
    expect(sw).not.toContain('supabase-api-cache');
    // (o chunk "vendor-supabase-*.js" é pré-cache normal; o que não pode existir é uma rota para o domínio)
    expect(sw).not.toMatch(/supabase\\?\.co/);
    expect(sw).not.toContain('NetworkFirst');
  });

  it('guarda imagens e tipos de letra em cache', () => {
    const sw = readSw();
    expect(sw).toContain('images-assets-cache');
    expect(sw).toContain('StaleWhileRevalidate');
    expect(sw).toContain('google-fonts-cache');
    expect(sw).toContain('CacheFirst');
  });

  it('sem rede, qualquer página abre o index.html (navegação offline)', () => {
    const sw = readSw();
    expect(sw).toContain('NavigationRoute');
    expect(sw).toContain('index.html');
  });
});

describe('Tamanho dos ficheiros JavaScript', () => {
  it('nenhum ficheiro passa os 500 kB e o principal fica abaixo dos 400 kB', () => {
    const assetsDir = path.join(distDir, 'assets');
    const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const file of jsFiles) {
      const sizeKb = fs.statSync(path.join(assetsDir, file)).size / 1024;
      expect(sizeKb, `${file} tem ${sizeKb.toFixed(0)} kB`).toBeLessThan(500);
      if (file.startsWith('index-')) {
        expect(sizeKb, `${file} (principal) tem ${sizeKb.toFixed(0)} kB`).toBeLessThan(400);
      }
    }
  });
});

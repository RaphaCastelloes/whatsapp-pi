import { defineConfig } from 'vitest/config';

function resolveLocalJsImports() {
    return {
        name: 'resolve-local-js-imports',
        async resolveId(source: string, importer: string | undefined) {
            if (!importer || !source.startsWith('.') || !source.endsWith('.js')) {
                return null;
            }

            const tsSource = `${source.slice(0, -3)}.ts`;
            const resolved = await this.resolve(tsSource, importer, { skipSelf: true });
            return resolved?.id ?? null;
        }
    };
}

export default defineConfig({
    plugins: [resolveLocalJsImports()]
});

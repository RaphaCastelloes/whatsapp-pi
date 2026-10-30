import { describe, expect, it } from 'vitest';
import { LiteParse } from '@llamaindex/liteparse';

function createTextPdf(): Buffer {
    const stream = 'BT /F1 24 Tf 72 720 Td (Hello PDF) Tj ET';
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => {
        const offset = Buffer.byteLength(pdf);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        return offset;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
}

describe('LiteParse integration', () => {
    it('extracts text from PDF bytes using the production parser configuration', async () => {
        const parser = new LiteParse({ ocrEnabled: true });
        const result = await parser.parse(createTextPdf());

        expect(result.text).toContain('Hello PDF');
    });
});

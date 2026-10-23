import { describe, expect, it } from 'vitest';
import { aigcJson, buildAigc, buildXmp, extractAigcFromXmp, parseAigc, TC260_NS, upsertXmp } from './aigc';

const info = buildAigc({ producer: '某某科技有限公司', produceId: 'A20261023-abc', propagator: '' });

describe('AIGC 字段', () => {
  it('七个字段齐全，Label 为 1', () => {
    expect(Object.keys(info)).toEqual(['Label', 'ContentProducer', 'ProduceID', 'ReservedCode1', 'ContentPropagator', 'PropagateID', 'ReservedCode2']);
    expect(info.Label).toBe('1');
  });
  it('ASCII 模式把中文转成 \\u 转义，解析后还原', () => {
    const s = aigcJson(info, true);
    expect(/^[\x20-\x7e]+$/.test(s)).toBe(true);
    expect(parseAigc(s)).toEqual(info);
  });
  it('兼容外层包一层 AIGC 的写法，不相关的 JSON 或乱码返回 null', () => {
    expect(parseAigc('{"AIGC":{"Label":"1","ContentProducer":"x"}}')).toEqual({ Label: '1', ContentProducer: 'x' });
    expect(parseAigc('{"foo":1}')).toBeNull();
    expect(parseAigc('not json')).toBeNull();
  });
});

describe('XMP', () => {
  it('生成后能读回，特殊字符正确转义', () => {
    const json = aigcJson({ ...info, ContentProducer: 'A&B <"公司">' });
    const xmp = buildXmp(json);
    expect(xmp).toContain(`xmlns:TC260="${TC260_NS}"`);
    expect(xmp).not.toContain('<"公司">');
    expect(extractAigcFromXmp(xmp)).toBe(json);
  });
  it('认属性写法', () => {
    const xmp = `<rdf:Description xmlns:TC260="${TC260_NS}" TC260:AIGC="{&quot;Label&quot;:&quot;1&quot;}"/>`;
    expect(extractAigcFromXmp(xmp)).toBe('{"Label":"1"}');
  });
  it('写入已有 XMP 时保留其他内容，替换旧的 AIGC', () => {
    const old = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:TC260="${TC260_NS}" TC260:AIGC="{&quot;Label&quot;:&quot;9&quot;}"><dc:creator>小王</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>`;
    const xmp = upsertXmp(old, '{"Label":"1"}');
    expect(xmp).toContain('<dc:creator>小王</dc:creator>');
    expect(xmp).not.toContain('&quot;9&quot;');
    expect(extractAigcFromXmp(xmp)).toBe('{"Label":"1"}');
    expect(upsertXmp('乱七八糟', '{}')).toBe(buildXmp('{}'));
  });
});

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMd, highlight, previewHtml } from '../../public/logic/markdown.js'

test('isMd accepts .md and .md.disabled in any case and rejects other names', () => {
  assert.equal(isMd('SKILL.md'), true)
  assert.equal(isMd('agent.md.disabled'), true)
  assert.equal(isMd('README.MD'), true)
  assert.equal(isMd('settings.json'), false)
  assert.equal(isMd('notes.md.bak'), false)
  assert.equal(isMd(undefined), false)
})

test('previewHtml renders headings two levels down and caps them at h6', () => {
  assert.equal(previewHtml('# Title', 'a.md'), '<h3>Title</h3>')
  assert.equal(previewHtml('#### Deep', 'a.md'), '<h6>Deep</h6>')
  assert.equal(previewHtml('###### Deepest', 'a.md'), '<h6>Deepest</h6>')
})

test('previewHtml joins paragraph lines and renders inline code, bold, and italic', () => {
  assert.equal(
    previewHtml('Use `npm test` and **always**\nread *this*.', 'a.md'),
    '<p>Use <code>npm test</code> and <strong>always</strong> read <em>this</em>.</p>'
  )
})

test('previewHtml shows a link as text with its target, not as an anchor', () => {
  const html = previewHtml('See [docs](https://example.com).', 'a.md')
  assert.equal(html, '<p>See docs <span class="link">(https://example.com)</span>.</p>')
  assert.doesNotMatch(previewHtml('[x](javascript:alert(1))', 'a.md'), /<a\b|href=/)
})

test('previewHtml renders bullet and numbered lists', () => {
  assert.equal(previewHtml('- one\n- two', 'a.md'), '<ul><li>one</li><li>two</li></ul>')
  assert.equal(previewHtml('1. one\n2) two', 'a.md'), '<ol><li>one</li><li>two</li></ol>')
})

test('previewHtml renders a fenced code block with its language label and escapes its body', () => {
  assert.equal(
    previewHtml('```js\nif (a < b) x()\n```', 'a.md'),
    '<figure class="code"><figcaption>js</figcaption><pre><code>if (a &lt; b) x()</code></pre></figure>'
  )
  assert.equal(previewHtml('```\nplain\n```', 'a.md'), '<figure class="code"><pre><code>plain</code></pre></figure>')
})

test('previewHtml renders a table with a header row', () => {
  assert.equal(
    previewHtml('| A | B |\n| --- | --- |\n| 1 | `2` |', 'a.md'),
    '<div class="tbl-md"><table><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><td>1</td><td><code>2</code></td></tr></tbody></table></div>'
  )
})

test('previewHtml renders quotes and horizontal rules', () => {
  assert.equal(previewHtml('> quoted\n> more', 'a.md'), '<blockquote><p>quoted more</p></blockquote>')
  assert.equal(previewHtml('a\n\n---\n\nb', 'a.md'), '<p>a</p><hr><p>b</p>')
})

test('previewHtml escapes raw HTML everywhere in a user file', () => {
  const src = [
    '# <img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '- <b>item</b>',
    '> <iframe src="x">',
    '| <svg onload=x> | b |',
    '| --- | --- |',
    '| c | d |',
    '`<i>code</i>`',
    '[<b>t</b>](http://x"onmouseover="y)'
  ].join('\n')
  const html = previewHtml(src, 'a.md')
  assert.doesNotMatch(html, /<(script|img|iframe|svg|b|i)\b/)
  assert.doesNotMatch(html, /"onmouseover=/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /<code>&lt;i&gt;code&lt;\/i&gt;<\/code>/)
})

test('previewHtml shows front matter as a card and leaves it out of the body', () => {
  const html = previewHtml('---\nname: review\ndescription: Check code\n---\nBody', 'SKILL.md')
  assert.equal(
    html,
    '<section class="fm-card" aria-label="Frontmatter"><h3 class="fm-h">Frontmatter</h3><dl>' +
      '<div class="fm-row"><dt>name</dt><dd><span>review</span></dd></div>' +
      '<div class="fm-row"><dt>description</dt><dd><span>Check code</span></dd></div>' +
      '</dl></section><p>Body</p>'
  )
})

test('previewHtml front matter joins continuation lines and accepts CRLF', () => {
  const html = previewHtml('---\r\ndescription: first\r\n  second\r\n---\r\nBody', 'a.md')
  assert.match(html, /<dt>description<\/dt><dd><span>first second<\/span><\/dd>/)
  assert.match(html, /<p>Body<\/p>$/)
})

test('previewHtml front matter shows lists, tools, and model as chips', () => {
  const html = previewHtml('---\ntools: Read, Grep\nmodel: opus\npaths: [a, "b"]\n---\n', 'a.md')
  assert.match(html, /<dt>tools<\/dt><dd><span class="fm-chip">Read<\/span><span class="fm-chip">Grep<\/span><\/dd>/)
  assert.match(html, /<dt>model<\/dt><dd><span class="fm-chip k">opus<\/span><\/dd>/)
  assert.match(html, /<dt>paths<\/dt><dd><span class="fm-chip">a<\/span><span class="fm-chip">b<\/span><\/dd>/)
})

test('previewHtml front matter escapes keys and values', () => {
  const html = previewHtml('---\nname: <script>x</script>\ntools: <b>, "<i>"\n---\n', 'a.md')
  assert.doesNotMatch(html, /<(script|b|i)>/)
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/)
})

test('previewHtml hides the front matter keys it is told to hide', () => {
  const html = previewHtml('---\nname: a\ndescription: b\n---\nBody', 'a.md', ['name', 'description'])
  assert.equal(html, '<p>Body</p>')
})

test('previewHtml says there is nothing to preview for an empty body', () => {
  assert.equal(previewHtml('', 'a.md'), '<p class="note">Nothing to preview.</p>')
  assert.equal(previewHtml('\n\n', 'a.md'), '<p class="note">Nothing to preview.</p>')
})

test('previewHtml shows a non-Markdown file as escaped preformatted text', () => {
  assert.equal(previewHtml('{"a":"<b>"}', 'x.json'), '<pre><code>{&quot;a&quot;:&quot;&lt;b&gt;&quot;}</code></pre>')
})

test('previewHtml treats a call without a file name as Markdown', () => {
  assert.equal(previewHtml('# Hi'), '<h3>Hi</h3>')
})

test('highlight returns escaped plain text with a trailing newline for non-Markdown files', () => {
  assert.equal(highlight('<a> & b', 'x.sh'), '&lt;a&gt; &amp; b\n')
})

test('highlight marks front matter delimiters and keys', () => {
  assert.equal(
    highlight('---\nname: x\n---\nbody', 'a.md'),
    '<span class="hl-fm">---</span>\n<span class="hl-key">name</span><span class="hl-fm">:</span> x\n<span class="hl-fm">---</span>\nbody\n'
  )
})

test('highlight marks headings, quotes, rules, fences, and list markers', () => {
  const out = highlight('# H\n> q\n***\n```\n**x**\n```\n- item', 'a.md').split('\n')
  assert.equal(out[0], '<span class="hl-h"># H</span>')
  assert.equal(out[1], '<span class="hl-q">&gt; q</span>')
  assert.equal(out[2], '<span class="hl-fm">***</span>')
  assert.equal(out[3], '<span class="hl-fence">```</span>')
  assert.equal(out[4], '<span class="hl-c">**x**</span>')
  assert.equal(out[5], '<span class="hl-fence">```</span>')
  assert.equal(out[6], '<span class="hl-li">-</span> item')
})

test('highlight marks inline code, bold, italic, and links', () => {
  assert.equal(
    highlight('`c` **b** *i* [t](u)', 'a.md'),
    '<span class="hl-c">`c`</span> <span class="hl-b">**b**</span> <span class="hl-i">*i*</span> <span class="hl-a">[t](u)</span>\n'
  )
})

test('highlight escapes raw HTML in every kind of line', () => {
  const out = highlight('---\nname: <b>\n---\n# <script>\n- <img>\n```\n<i>\n```\n<u> `<s>`', 'a.md')
  assert.doesNotMatch(out, /<(b|script|img|i|u|s)>/)
  assert.match(out, /&lt;script&gt;/)
})

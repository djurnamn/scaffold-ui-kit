import { describe, expect, it } from 'vitest';

import {
  GENERATED_IDENTIFIER,
  canonicalMarkup,
  canonicalNodes,
  rootAttributes,
} from '../src/parity/index.js';
import { decodeCharacterReferences } from '../src/parity/entities.js';

// Each smoothing below is pinned on markup a framework wrote for the same
// template in each target, as the engine's targets render it on the server.

describe('canonicalMarkup smooths what the frameworks write differently', () => {
  it("drops Vue's and Svelte's comment anchors and template comments", () => {
    const vue =
      '<div><b>a</b><!--[--><u>c</u><!--]--><!-- a note --><!----></div>';
    const svelte =
      '<!--[--><!--$s1--><div><b>a</b><!--[0--><u>c</u><!--]--></div><!--]-->';
    expect(canonicalMarkup(vue)).toBe('<div><b>a</b><u>c</u></div>');
    expect(canonicalMarkup(svelte)).toBe('<div><b>a</b><u>c</u></div>');
  });

  it('joins the text on both sides of a dropped comment', () => {
    expect(canonicalMarkup('<p>a<!---->b</p>')).toBe('<p>ab</p>');
  });

  it("drops React's hoisted preload hint, and keeps any other link", () => {
    expect(
      canonicalMarkup(
        '<link rel="preload" as="image" href="/a.png"/><div><img src="/a.png" alt=""/></div>'
      )
    ).toBe('<div><img alt="" src="/a.png"></div>');
    expect(canonicalMarkup('<link rel="stylesheet" href="/a.css">')).toBe(
      '<link href="/a.css" rel="stylesheet">'
    );
  });

  it("drops Svelte's event replay attribute, and keeps a handler of the component's own", () => {
    expect(
      canonicalMarkup('<img src="/a.png" alt="" onload="this.__e=event"/>')
    ).toBe('<img alt="" src="/a.png">');
    expect(canonicalMarkup('<img onerror="this.__e=event">')).toBe('<img>');
    expect(canonicalMarkup('<img onload="track()">')).toBe(
      '<img onload="track()">'
    );
  });

  it("sorts attributes and lowercases names, as Vue's server renderer writes an SVG viewBox", () => {
    const react =
      '<svg class="spinner" viewBox="0 0 16 16" width="16" aria-hidden="true"></svg>';
    const vue =
      '<svg class="spinner" viewbox="0 0 16 16" width="16" aria-hidden="true"></svg>';
    expect(canonicalMarkup(vue)).toBe(canonicalMarkup(react));
    expect(canonicalMarkup(react)).toBe(
      '<svg aria-hidden="true" class="spinner" viewbox="0 0 16 16" width="16"></svg>'
    );
  });

  it('reads a bare attribute as an empty one', () => {
    const react = '<input readOnly="" disabled="" tabindex="0"/>';
    const vue = '<input readonly disabled tabindex="0">';
    const svelte = '<input readonly="" disabled="" tabindex="0"/>';
    expect(canonicalMarkup(vue)).toBe(canonicalMarkup(react));
    expect(canonicalMarkup(svelte)).toBe(canonicalMarkup(react));
  });

  it('drops an empty class or style, as Vue writes for a style binding that sets nothing', () => {
    expect(canonicalMarkup('<div class="empty" style=""></div>')).toBe(
      '<div class="empty"></div>'
    );
    expect(canonicalMarkup('<div class=" " id="x"></div>')).toBe(
      '<div id="x"></div>'
    );
  });

  it("sorts class tokens, as Vue's server renderer writes a bound class first", () => {
    expect(canonicalMarkup('<input class="is-solid field">')).toBe(
      canonicalMarkup('<input class="field is-solid">')
    );
  });

  it("drops Svelte's scoping classes", () => {
    expect(canonicalMarkup('<div class="styled svelte-4oh9wb"></div>')).toBe(
      '<div class="styled"></div>'
    );
  });

  it('writes styles tight with custom properties first, as Svelte pads its declarations', () => {
    const react =
      '<div style="color:red;box-shadow:var(--a, var(--b));--styled-gap:1rem;--styled-size:2rem"></div>';
    const vue =
      '<div style="color:red;box-shadow:var(--a, var(--b));--styled-gap:1rem;--styled-size:2rem;"></div>';
    const svelte =
      '<div style="color: red; box-shadow: var(--a,  var(--b)); --styled-gap: 1rem; --styled-size: 2rem;"></div>';
    expect(canonicalMarkup(vue)).toBe(canonicalMarkup(react));
    expect(canonicalMarkup(svelte)).toBe(canonicalMarkup(react));
    expect(canonicalMarkup(react)).toBe(
      '<div style="--styled-gap:1rem;--styled-size:2rem;color:red;box-shadow:var(--a, var(--b))"></div>'
    );
  });

  it('keeps the last of a custom property declared twice, and the order of standard properties', () => {
    expect(
      canonicalMarkup('<p style="padding:0;--x:1;padding-left:1px;--x:2"></p>')
    ).toBe('<p style="--x:2;padding:0;padding-left:1px"></p>');
  });

  it("replaces the ids React's, Vue's and Svelte's id generators write", () => {
    const react =
      '<div aria-labelledby="legend-_R_0_"><span id="legend-_R_0_">L</span></div>';
    const vue =
      '<div aria-labelledby="legend-v-0"><span id="legend-v-0">L</span></div>';
    const svelte =
      '<div aria-labelledby="legend-s1"><span id="legend-s1">L</span></div>';
    const expected = `<div aria-labelledby="legend-${GENERATED_IDENTIFIER}"><span id="legend-${GENERATED_IDENTIFIER}">L</span></div>`;
    expect(canonicalMarkup(react)).toBe(expected);
    expect(canonicalMarkup(vue)).toBe(expected);
    expect(canonicalMarkup(svelte)).toBe(expected);
    expect(canonicalMarkup('<p id=":r3:"></p><p id="«r1»"></p>')).toBe(
      `<p id="${GENERATED_IDENTIFIER}"></p><p id="${GENERATED_IDENTIFIER}"></p>`
    );
  });

  it("replaces Svelte's client ids", () => {
    expect(canonicalMarkup('<label for="c1"></label><input id="c1">')).toBe(
      canonicalMarkup('<label for="s1"></label><input id="s1">')
    );
  });

  it('reads numeric parts after a generated id as part of it, as Vue nests its ids', () => {
    const markup = (id: string) =>
      `<button aria-controls="${id}-0" id="${id}-0-trigger"></button><div id="${id}-0"></div>`;
    expect(canonicalMarkup(markup('v-1'))).toBe(
      canonicalMarkup(markup('_r_1_'))
    );
    expect(canonicalMarkup(markup('c2'))).toBe(
      canonicalMarkup(markup('_r_1_'))
    );
    expect(canonicalMarkup('<p id="v-1-0"></p>')).toBe(
      `<p id="${GENERATED_IDENTIFIER}"></p>`
    );
    expect(canonicalMarkup('<p id="_r_1_-0"></p>')).toBe(
      `<p id="${GENERATED_IDENTIFIER}"></p>`
    );
  });

  it('replaces the machine ids Zag writes into its data attributes', () => {
    const markup = (id: string) =>
      `<div data-uid="${id}" data-ownedby="${id}" data-controls="select:${id}:content"></div>`;
    expect(canonicalMarkup(markup('v-0'))).toBe(
      canonicalMarkup(markup('_r_0_'))
    );
    expect(canonicalMarkup(markup('c1'))).toBe(
      canonicalMarkup(markup('_r_0_'))
    );
  });

  it("replaces React 19.1's server ids", () => {
    expect(
      canonicalMarkup('<p id="«R1l7»"></p><p id="«r0»"></p><p id="_r_2_"></p>')
    ).toBe(`<p id="${GENERATED_IDENTIFIER}"></p>`.repeat(3));
  });

  it('replaces generated ids in the attributes that point at an element', () => {
    const markup = (id: string) =>
      `<label for="${id}"></label><input id="${id}" aria-describedby="hint ${id}-hint" name="${id}"><a href="#${id}"></a><svg><path fill="url(#${id})"></path></svg>`;
    expect(canonicalMarkup(markup('_R_1_'))).toBe(
      canonicalMarkup(markup('v-3'))
    );
    expect(canonicalMarkup(markup('s2'))).toBe(canonicalMarkup(markup('v-3')));
  });

  it('compares any other attribute as written, an id-shaped value included', () => {
    expect(canonicalMarkup('<p data-size="s1"></p>')).not.toBe(
      canonicalMarkup('<p data-size="s2"></p>')
    );
    expect(canonicalMarkup('<p title="v-1"></p>')).not.toBe(
      canonicalMarkup('<p title="v-2"></p>')
    );
    expect(canonicalMarkup('<a href="/s1"></a>')).not.toBe(
      canonicalMarkup('<a href="/s2"></a>')
    );
    expect(canonicalMarkup('<path fill="s1"></path>')).toBe(
      '<path fill="s1"></path>'
    );
  });

  it('leaves an id that only looks generated inside a word, and text', () => {
    expect(
      canonicalMarkup('<p id="nav-v-2x" data-step="steps1">s1 v-0</p>')
    ).toBe('<p data-step="steps1" id="nav-v-2x">s1 v-0</p>');
  });

  it('decodes character references and writes them back one way', () => {
    const react =
      '<input aria-label="Ada&#x27;s &amp; Bob&#x27;s"/>It&#x27;s &lt;ok&gt; &amp; fine';
    const vue =
      '<input aria-label="Ada&#39;s &amp; Bob&#39;s">It&#39;s &lt;ok&gt; &amp; fine';
    const svelte =
      "<input aria-label=\"Ada's &amp; Bob's\"/>It's &lt;ok> &amp; fine";
    expect(canonicalMarkup(vue)).toBe(canonicalMarkup(react));
    expect(canonicalMarkup(svelte)).toBe(canonicalMarkup(react));
    expect(canonicalMarkup(react)).toBe(
      "<input aria-label=\"Ada's &amp; Bob's\">It's &lt;ok&gt; &amp; fine"
    );
  });

  it('collapses a run of whitespace in text to one space, as Vue condenses it', () => {
    expect(canonicalMarkup('<p>multi  word\n  text</p>')).toBe(
      canonicalMarkup('<p>multi word text</p>')
    );
  });

  it('keeps a no-break space', () => {
    expect(canonicalMarkup('<p>a&nbsp;b</p>')).toBe('<p>a b</p>');
  });

  it('writes a self-closed element with its closing tag and a void element without one', () => {
    expect(canonicalMarkup('<svg><path d="M0 0"/></svg><br/>')).toBe(
      '<svg><path d="M0 0"></path></svg><br>'
    );
  });
});

describe('canonicalMarkup keeps what renders', () => {
  it('keeps whitespace between elements, which renders between inline ones', () => {
    expect(canonicalMarkup('<p><b>a</b> <i>b</i></p>')).not.toBe(
      canonicalMarkup('<p><b>a</b><i>b</i></p>')
    );
  });

  it('keeps attribute values, classes, styles, tags and text', () => {
    const base = '<p class="a" style="color:red" title="x">t</p>';
    for (const changed of [
      '<p class="a b" style="color:red" title="x">t</p>',
      '<p class="a" style="color:blue" title="x">t</p>',
      '<p class="a" style="color:red" title="y">t</p>',
      '<div class="a" style="color:red" title="x">t</div>',
      '<p class="a" style="color:red" title="x">u</p>',
    ]) {
      expect(canonicalMarkup(changed)).not.toBe(canonicalMarkup(base));
    }
  });

  it("keeps a legacy component's counted id, which no framework writes", () => {
    expect(canonicalMarkup('<span id="legend-1"></span>')).toBe(
      '<span id="legend-1"></span>'
    );
  });

  it('closes what the markup leaves open, and skips a stray closing tag', () => {
    expect(canonicalMarkup('<div><p>a</span>')).toBe('<div><p>a</p></div>');
  });

  it('reads a > inside a quoted attribute value as part of the value', () => {
    expect(canonicalMarkup('<a title="a > b">x</a>')).toBe(
      '<a title="a > b">x</a>'
    );
  });
});

describe('canonicalMarkup reads raw text as text', () => {
  it("keeps a script's content as written, markup characters included", () => {
    const markup = '<script>if (a < b && c > d) { x("<p>  </p>"); }</script>';
    expect(canonicalMarkup(markup)).toBe(markup);
    expect(canonicalNodes(markup)).toEqual([
      '<script>',
      'if (a < b && c > d) { x("<p>  </p>"); }',
      '</script>',
    ]);
  });

  it("keeps a style's content as written, and compares it", () => {
    const markup = '<style>.a > .b { color: red; }</style><p>x</p>';
    expect(canonicalMarkup(markup)).toBe(markup);
    expect(canonicalMarkup('<style>.a{color:red}</style>')).not.toBe(
      canonicalMarkup('<style>.a{color:blue}</style>')
    );
  });

  it('ends raw text at its own closing tag in any case', () => {
    expect(canonicalMarkup('<SCRIPT type="module">a<b</SCRIPT ><i>c</i>')).toBe(
      '<script type="module">a<b</script><i>c</i>'
    );
  });

  it("reads a textarea's content as text, its whitespace kept", () => {
    expect(canonicalMarkup('<textarea>a  <b>&amp;\n</textarea>')).toBe(
      '<textarea>a  &lt;b&gt;&amp;\n</textarea>'
    );
  });
});

describe('canonicalNodes', () => {
  it('lists the canonical markup one node per entry', () => {
    expect(canonicalNodes('<!--[--><p class="b a">x <b>y</b></p>')).toEqual([
      '<p class="a b">',
      'x ',
      '<b>',
      'y',
      '</b>',
      '</p>',
    ]);
  });
});

describe('rootAttributes', () => {
  it("reads the root past Vue's anchors and React's preload hints", () => {
    const root = rootAttributes(
      '<link rel="preload" as="image" href="/a.png"/>\n<!--[--><div class="Badge  Badge--calm" style="color: red; --badge-size: 2rem ; --kit-tone:  var(--a,  b)">New</div>'
    );
    expect(root.tag).toBe('div');
    expect(root.classes).toEqual(new Set(['Badge', 'Badge--calm']));
    expect(root.variables).toEqual({
      '--badge-size': '2rem',
      '--kit-tone': 'var(--a, b)',
    });
  });

  it('reads only the custom properties under a prefix', () => {
    expect(
      rootAttributes(
        '<span style="--kit-size:1rem;--other:2;--kit-size:3rem"></span>',
        { variablePrefix: '--kit-' }
      ).variables
    ).toEqual({ '--kit-size': '3rem' });
  });

  it('reads an SVG root and decodes its attribute values', () => {
    const root = rootAttributes('<SVG class="a&amp;b"></SVG>');
    expect(root.tag).toBe('svg');
    expect(root.classes).toEqual(new Set(['a&b']));
    expect(root.variables).toEqual({});
  });

  it('fails for markup with no element', () => {
    expect(() => rootAttributes('<!--[--><!--]-->')).toThrow('No root element');
  });
});

describe('decodeCharacterReferences', () => {
  it('decodes numeric and the named references serializers write, once', () => {
    expect(decodeCharacterReferences('&#x27;&#39;&quot;&amp;amp;&copy;')).toBe(
      "''\"&amp;&copy;"
    );
  });
});

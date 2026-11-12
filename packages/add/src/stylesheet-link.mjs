/**
 * Linking a copied component to its stylesheet, in the form and at the
 * place the build puts the link: an `import` statement closing the leading
 * imports on react and svelte, a `<style src>` block closing a Vue SFC, a
 * `<link>` opening an html page.
 */
import { extname, posix } from 'node:path';

const misplacedLinkWarning =
  'links its stylesheet somewhere the build does not put the link; left as it is';

/**
 * A component's text with the link the build wrote to its stylesheet
 * removed, and a link to `specifier` put in its place when one is given.
 *
 * @param {string} content - The component's text as built.
 * @param {string} extension - The component file's extension.
 * @param {string | undefined} builtSpecifier - The specifier the build
 *   links the stylesheet by (`./Button.css`), or undefined when the
 *   component has no stylesheet.
 * @param {string | undefined} specifier - What the copy links instead, or
 *   undefined for no link.
 * @returns {{ content: string, warning?: string }} The warning says the
 *   file links its stylesheet somewhere the build does not put the link;
 *   such a file is returned as it is.
 */
export function relinkStylesheet(
  content,
  extension,
  builtSpecifier,
  specifier
) {
  if (builtSpecifier === undefined) {
    return specifier === undefined
      ? { content }
      : link(content, extension, specifier, true);
  }
  const unlinked = link(content, extension, builtSpecifier, false);
  if (unlinked.warning !== undefined || specifier === undefined) {
    return unlinked;
  }
  return link(unlinked.content, extension, specifier, true);
}

function link(content, extension, specifier, linked) {
  switch (extension) {
    case '.tsx':
    case '.ts':
      return linkAfterDirectives(content, `import '${specifier}';`, linked);
    case '.svelte':
      return linkInSvelteScript(content, `import '${specifier}';`, linked);
    case '.vue':
      return linkAtEnd(
        content,
        `\n\n<style src="${specifier}"></style>\n`,
        linked
      );
    case '.html':
      return linkHtmlPage(content, specifier, linked);
    default:
      return { content };
  }
}

/**
 * Links or unlinks a stylesheet in a React module, past the directives that
 * open it: a client module's `'use client';` is the file's first statement,
 * ahead of the imports the link closes, with or without a blank line after
 * it. A file of another shape - a directive further down, CRLF line endings
 * - is left as it is, with the misplaced-link warning.
 */
function linkAfterDirectives(content, link, linked) {
  const prologue =
    /^(?:(['"])use [a-z]+\1;?[ \t]*\n)+\n?/.exec(content)?.[0] ?? '';
  const body = content.slice(prologue.length);
  if (
    content.includes('\r\n') ||
    /^[ \t]*(['"])use [a-z]+\1;?[ \t]*$/m.test(body)
  ) {
    return { content, warning: misplacedLinkWarning };
  }
  const result = linkInSections(body, link, linked);
  return { ...result, content: `${prologue}${result.content}` };
}

/**
 * Links or unlinks a stylesheet in text made of blank-line-separated
 * sections whose first may be the imports: the link is the last import, or
 * the only section's content when there are no other imports.
 */
function linkInSections(body, link, linked) {
  const separator = body.indexOf('\n\n');
  const end = separator === -1 ? body.length : separator;
  const first = body.slice(0, end);
  const inPlace = first === link || first.endsWith(`\n${link}`);
  if (!inPlace) {
    if (body.split('\n').includes(link)) {
      return { content: body, warning: misplacedLinkWarning };
    }
    if (!linked) {
      return { content: body };
    }
    if (first.startsWith('import')) {
      return { content: `${first}\n${link}${body.slice(end)}` };
    }
    return { content: body === '' ? link : `${link}\n\n${body}` };
  }
  if (linked) {
    return { content: body };
  }
  if (first === link) {
    return { content: body.slice(Math.min(end + 2, body.length)) };
  }
  return { content: `${first.slice(0, -link.length - 1)}${body.slice(end)}` };
}

/**
 * Links or unlinks a stylesheet in a Svelte component's `<script>` block,
 * creating the block for a link when there is none and dropping it when the
 * link was all it held.
 */
function linkInSvelteScript(content, link, linked) {
  const open = '<script lang="ts">\n';
  const close = '\n</script>';
  const start = content.indexOf(open);
  if (start === -1) {
    if (!linked) {
      return { content };
    }
    const options = '<svelte:options runes={true} />\n\n';
    const at = content.startsWith(options) ? options.length : 0;
    return {
      content: `${content.slice(0, at)}${open}${link}${close}\n\n${content.slice(at)}`,
    };
  }
  const bodyStart = start + open.length;
  const bodyEnd = content.indexOf(close, bodyStart);
  const result = linkInSections(
    content.slice(bodyStart, bodyEnd),
    link,
    linked
  );
  if (result.content === '') {
    const blockEnd = bodyEnd + close.length;
    const after = content.startsWith('\n\n', blockEnd)
      ? blockEnd + 2
      : blockEnd;
    return { content: `${content.slice(0, start)}${content.slice(after)}` };
  }
  return {
    ...result,
    content: `${content.slice(0, bodyStart)}${result.content}${content.slice(bodyEnd)}`,
  };
}

/**
 * Links or unlinks a stylesheet whose link closes the file - a Vue SFC's
 * `<style src>` block - given as the exact text the build adds there.
 */
function linkAtEnd(content, linkText, linked) {
  if (content.endsWith(linkText)) {
    return {
      content: linked ? content : `${content.slice(0, -linkText.length)}\n`,
    };
  }
  if (content.includes(linkText.trim())) {
    return { content, warning: misplacedLinkWarning };
  }
  return {
    content: linked ? `${content.replace(/\n$/, '')}${linkText}` : content,
  };
}

/**
 * Links or unlinks an html page's stylesheet. The page's own link is the
 * `<link>` opening it whose file is the page's stylesheet by name, wherever
 * it points - a kit may link its pages to a compiled copy, which the
 * consumer does not get.
 */
function linkHtmlPage(content, href, linked) {
  const opening = /^<link rel="stylesheet" href="([^"]*)">\n\n/.exec(content);
  const name = posix.basename(href);
  const base = name.slice(0, name.length - extname(name).length);
  const ownLink =
    opening !== null &&
    ['.css', '.scss'].includes(extname(opening[1])) &&
    posix.basename(opening[1], extname(opening[1])) === base;
  const body = ownLink ? content.slice(opening[0].length) : content;
  if (!ownLink && content.includes(`<link rel="stylesheet" href="${href}">`)) {
    return { content, warning: misplacedLinkWarning };
  }
  return {
    content: linked
      ? `<link rel="stylesheet" href="${href}">\n\n${body}`
      : body,
  };
}

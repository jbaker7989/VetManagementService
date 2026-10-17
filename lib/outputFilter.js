// Removes the channels a hijacked model could use to leak data through the
// browser: markdown and HTML images, reference-style link definitions, and
// http(s) or protocol-relative URLs (an image or link fetch carries whatever
// the model put in the URL). The UI renders model text as plain text, so this
// is a second layer.

const IMAGE = /!\[[^\]\n]*\](?:\([^)\n]*\)|\[[^\]\n]*\])/g;
const IMG_TAG = /<img\b[^>]*>/gi;
const DEFINITION = /^[ \t]*\[[^\]\n]+\]:[ \t]*(?:https?:)?\/\/\S*/gim;
const LINK = /(?:https?:\/\/|(?<![^\s("'])\/\/(?=[a-z0-9-]+\.[a-z0-9]))[^\s)\]>"']*/gi;
const MAX_HELD_CHARS = 500;

// Constructs still being written at the end of the text, each matched from its start.
const UNFINISHED = [
  /!\[[^\]\n]*(?:\](?:\([^)\n]*|\[[^\]\n]*)?)?$/,
  /<(?:i|im|img(?:\s[^>]*)?)?$/i,
  /(?<![^\n])[ \t]*\[[^\]\n]*(?:\](?::[ \t]*\S*)?)?$/,
];

function scrubText(text) {
  return text
    .replace(IMAGE, "[image removed]")
    .replace(IMG_TAG, "[image removed]")
    .replace(DEFINITION, "[link removed]")
    .replace(LINK, "[link removed]");
}

// Deltas can split a URL or image mid-way, so the trailing word (and any
// unfinished image, tag or link definition) is held back until more text or
// flush() arrives.
export function createStreamScrubber() {
  let held = "";

  return {
    push(delta) {
      const text = held + delta;
      let cut = Math.max(text.search(/\S*$/), 0);
      for (const re of [IMAGE, IMG_TAG, DEFINITION]) {
        for (const { index, 0: match } of text.matchAll(re)) if (index < cut && cut < index + match.length) cut = index;
      }
      for (const unfinished of UNFINISHED) {
        const start = unfinished.exec(text)?.index;
        if (start < cut && text.length - start <= MAX_HELD_CHARS) cut = start;
      }
      held = text.slice(cut);
      return scrubText(text.slice(0, cut));
    },
    flush() {
      const rest = scrubText(held);
      held = "";
      return rest;
    },
  };
}

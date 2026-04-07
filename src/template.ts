import type { Template, TemplateElement, TemplateResolved, TemplateResolvedElement } from "./types";

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function resolveText(input: string, data: Record<string, unknown>): string {
  return input.replace(VAR_RE, (_, key: string) => {
    const v = data[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

export function resolveTemplate(template: Template, data: Record<string, unknown>): TemplateResolved {
  const elements: TemplateResolvedElement[] = template.elements.map((el) => resolveElement(el, data));
  return { ...template, elements };
}

function resolveElement(el: TemplateElement, data: Record<string, unknown>): TemplateResolvedElement {
  switch (el.type) {
    case "text":
      return { ...el, text: resolveText(el.text, data) };
    case "qrcode":
      return { ...el, data: resolveText(el.data, data) };
    case "barcode":
      return { ...el, data: resolveText(el.data, data) };
    case "image":
      return el;
    default: {
      const _exhaustive: never = el;
      return _exhaustive;
    }
  }
}


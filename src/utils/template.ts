import Handlebars from "handlebars";

export const t = <T>(
  template: string[],
  data?: T,
  options?: { delim?: string } & CompileOptions
): string => {
  const delim = options?.delim ?? "\n";

  const compiled = Handlebars.compile(template.join(delim), {
    noEscape: true,
    ...options,
  });

  return compiled(data);
};
